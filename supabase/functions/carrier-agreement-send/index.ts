import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const decoder = new TextDecoder();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Missing server secret: ${name}`);
  return value;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function decryptSecret(ciphertext: string, iv: string): Promise<string> {
  const raw = base64ToBytes(requireEnv("ELD_CREDENTIALS_KEY"));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    key,
    base64ToBytes(ciphertext),
  );
  return decoder.decode(decrypted);
}

async function signwellFetch(apiKey: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.signwell.com/api/v1${path}`, {
    ...init,
    headers: {
      "X-Api-Key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const detail = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new HttpError(response.status, `SignWell error ${response.status}: ${detail.slice(0, 500)}`);
  }
  return payload as Record<string, unknown>;
}

function field(apiId: string, value: unknown) {
  return { api_id: apiId, value: value == null ? "" : String(value) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) throw new HttpError(401, "Missing login session");
    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(authHeader.slice(7).trim());
    if (authError || !authData.user) throw new HttpError(401, "Invalid or expired login session");
    const user = authData.user;

    const body = await req.json().catch(() => ({}));
    const carrierId = String(body.carrier_id || "").trim();
    if (!carrierId) throw new HttpError(400, "carrier_id is required");

    const { data: connection, error: connError } = await admin
      .from("signwell_connections")
      .select("api_key_ciphertext,api_key_iv,template_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connError) throw new HttpError(500, connError.message);
    if (!connection) throw new HttpError(400, "Connect your SignWell account first in Settings.");
    if (!connection.template_id) throw new HttpError(400, "Save your SignWell template ID first in Settings.");

    const { data: carrier, error: carrierError } = await admin
      .from("carriers")
      .select("id,name,mc_dot,contact,phone,email")
      .eq("id", carrierId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (carrierError) throw new HttpError(500, carrierError.message);
    if (!carrier) throw new HttpError(404, "Carrier not found");
    if (!carrier.email) throw new HttpError(400, "This carrier has no email on file — add one before sending.");

    const { data: settings } = await admin
      .from("company_settings")
      .select("company_name,email,phone,default_commission_pct")
      .eq("user_id", user.id)
      .maybeSingle();

    const apiKey = await decryptSecret(connection.api_key_ciphertext, connection.api_key_iv);
    const mcDot = String(carrier.mc_dot || "");
    const mcMatch = mcDot.match(/MC\s*#?\s*(\d{4,8})/i);
    const dotMatch = mcDot.match(/DOT\s*#?\s*(\d{4,8})/i) || mcDot.match(/(\d{4,8})/);

    const templateFields = [
      field("effective_date", new Date().toLocaleDateString("en-US")),
      field("dispatcher_name", settings?.company_name || "Zap Dispatch LLC"),
      field("dispatcher_email", settings?.email || user.email || ""),
      field("dispatcher_phone", settings?.phone || ""),
      field("carrier_name", carrier.name),
      field("carrier_mc", mcMatch ? mcMatch[1] : mcDot),
      field("carrier_dot", dotMatch ? dotMatch[1] : ""),
      field("carrier_contact", carrier.contact || ""),
      field("carrier_email", carrier.email),
      field("carrier_phone", carrier.phone || ""),
      field("agreed_fee", `${settings?.default_commission_pct ?? 8}% per load`),
      field("invoice_schedule", "Weekly"),
      field("payment_due", "Every Friday"),
      field("cancel_notice", "14 days"),
    ];

    const created = await signwellFetch(apiKey, "/document_templates/documents", {
      method: "POST",
      body: JSON.stringify({
        template_id: connection.template_id,
        name: `Dispatch Agreement — ${carrier.name}`,
        draft: false,
        template_fields: templateFields,
        recipients: [
          {
            placeholder_name: "Dispatcher",
            name: settings?.company_name || "Zap Dispatch LLC",
            email: settings?.email || user.email || "",
          },
          {
            placeholder_name: "Carrier",
            name: carrier.contact || carrier.name,
            email: carrier.email,
          },
        ],
        metadata: { user_id: user.id, carrier_id: carrier.id },
      }),
    });

    const documentId = String((created as { id?: string }).id || "");
    const { error: insertError } = await admin.from("carrier_agreements").insert({
      user_id: user.id,
      carrier_id: carrier.id,
      carrier_name: carrier.name,
      signwell_document_id: documentId || null,
      status: "sent",
    });
    if (insertError) throw new HttpError(500, insertError.message);

    return json({ ok: true, document_id: documentId });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("carrier-agreement-send", { status, message });
    return json({ error: message }, status);
  }
});
