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
    const documentId = String(body.document_id || "").trim();
    if (!documentId) throw new HttpError(400, "document_id is required");

    const { data: agreement, error: agreementError } = await admin
      .from("carrier_agreements")
      .select("id,status")
      .eq("user_id", user.id)
      .eq("signwell_document_id", documentId)
      .maybeSingle();
    if (agreementError) throw new HttpError(500, agreementError.message);
    if (!agreement) throw new HttpError(404, "Agreement draft not found");
    if (agreement.status !== "draft") throw new HttpError(400, "This agreement was already sent.");

    const { data: connection, error: connError } = await admin
      .from("signwell_connections")
      .select("api_key_ciphertext,api_key_iv")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connError) throw new HttpError(500, connError.message);
    if (!connection) throw new HttpError(400, "Connect your SignWell account first in Settings.");

    const apiKey = await decryptSecret(connection.api_key_ciphertext, connection.api_key_iv);
    await signwellFetch(apiKey, `/documents/${documentId}/send`, { method: "POST", body: JSON.stringify({}) });

    const { error: updateError } = await admin
      .from("carrier_agreements")
      .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", agreement.id);
    if (updateError) throw new HttpError(500, updateError.message);

    return json({ ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("carrier-agreement-confirm", { status, message });
    return json({ error: message }, status);
  }
});
