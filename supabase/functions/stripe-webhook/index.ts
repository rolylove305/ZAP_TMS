// Receives Stripe webhook events and syncs the user's subscription_status /
// current_period_end into public.profiles (via service role). Deployed with
// verify_jwt=false because Stripe authenticates via its own signature, not a
// Supabase JWT. The signature is verified manually with STRIPE_WEBHOOK_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing server secret: ${name}`);
  return v;
}

const admin = createClient(
  env("SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Verify Stripe's `Stripe-Signature` header: HMAC-SHA256 of `${t}.${payload}`.
async function verifySignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const parts: Record<string, string> = {};
  header.split(",").forEach((kv) => {
    const i = kv.indexOf("=");
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${t}.${payload}`),
  );
  const expected = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

// Map a Stripe subscription.status to our subscription_status enum.
function mapStatus(s: string): string {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled"; // canceled / incomplete / incomplete_expired / paused
}

async function updateByUser(userId: string, fields: Record<string, unknown>) {
  await admin.from("profiles").update(fields).eq("id", userId);
}
async function updateByCustomer(
  customerId: string,
  fields: Record<string, unknown>,
) {
  await admin.from("profiles").update(fields).eq("stripe_customer_id", customerId);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sig = req.headers.get("stripe-signature") || "";
  const payload = await req.text();

  let secret: string;
  try {
    secret = env("STRIPE_WEBHOOK_SECRET");
  } catch {
    console.error("STRIPE_WEBHOOK_SECRET not set yet");
    return new Response("Webhook not configured", { status: 500 });
  }

  if (!(await verifySignature(payload, sig, secret))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  try {
    const type = String(event.type || "");
    const obj = (((event.data as Record<string, unknown>) || {}).object ||
      {}) as Record<string, unknown>;
    const meta = (obj.metadata as Record<string, unknown>) || {};
    const userId = (obj.client_reference_id as string) ||
      (meta.user_id as string) || null;
    const customerId = (obj.customer as string) || null;

    switch (type) {
      case "checkout.session.completed": {
        const fields = {
          subscription_status: "active",
          ...(customerId ? { stripe_customer_id: customerId } : {}),
        };
        if (userId) await updateByUser(userId, fields);
        else if (customerId) await updateByCustomer(customerId, fields);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const fields: Record<string, unknown> = {
          subscription_status: mapStatus(String(obj.status || "")),
          current_period_end: obj.current_period_end
            ? new Date(Number(obj.current_period_end) * 1000).toISOString()
            : null,
        };
        if (userId) await updateByUser(userId, fields);
        else if (customerId) await updateByCustomer(customerId, fields);
        break;
      }
      case "customer.subscription.deleted": {
        const fields = { subscription_status: "canceled" };
        if (userId) await updateByUser(userId, fields);
        else if (customerId) await updateByCustomer(customerId, fields);
        break;
      }
      case "invoice.payment_failed": {
        if (customerId) {
          await updateByCustomer(customerId, { subscription_status: "past_due" });
        }
        break;
      }
      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stripe-webhook handler error", e);
    return new Response("Handler error", { status: 500 });
  }
});
