// Creates a Stripe Checkout Session (subscription) for the logged-in user and
// returns its URL. The frontend redirects the user there. Uses the hosted
// Stripe Checkout page, so no card data ever touches our servers.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const APP_URL = "https://app.zapdispatch.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing server secret: ${name}`);
  return v;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Minimal Stripe REST helper (form-encoded), no SDK needed.
async function stripe(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env("STRIPE_SECRET_KEY"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = (json && json.error && json.error.message) ||
      ("Stripe error " + res.status);
    throw new Error(msg);
  }
  return json as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = /^Bearer\s+(.+)$/i.exec(authHeader.trim())?.[1];
    if (!token) return jsonResponse({ error: "Missing authorization." }, 401);

    const supabaseUrl = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(
      token,
    );
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Invalid or expired session." }, 401);
    }
    const user = userData.user;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Reuse the Stripe customer if we already made one; else create + store it.
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = (profile && profile.stripe_customer_id) || null;
    if (!customerId) {
      const cust = await stripe("customers", {
        email: user.email ?? "",
        "metadata[user_id]": user.id,
      });
      customerId = String(cust.id);
      await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const session = await stripe("checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": env("STRIPE_PRICE_ID"),
      "line_items[0][quantity]": "1",
      success_url: APP_URL + "/?paid=1",
      cancel_url: APP_URL + "/?checkout=cancel",
      client_reference_id: user.id,
      "subscription_data[metadata][user_id]": user.id,
      allow_promotion_codes: "true",
    });

    return jsonResponse({ url: session.url });
  } catch (e) {
    console.error("create-checkout-session error", e);
    return jsonResponse(
      { error: (e as Error).message || "Server error" },
      500,
    );
  }
});
