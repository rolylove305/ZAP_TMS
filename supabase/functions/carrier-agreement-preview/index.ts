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
      .select("id")
      .eq("user_id", user.id)
      .eq("signwell_document_id", documentId)
      .maybeSingle();
    if (agreementError) throw new HttpError(500, agreementError.message);
    if (!agreement) throw new HttpError(404, "Agreement not found");

    const { data: connection, error: connError } = await admin
      .from("signwell_connections")
      .select("api_key_ciphertext,api_key_iv")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connError) throw new HttpError(500, connError.message);
    if (!connection) throw new HttpError(400, "Connect your SignWell account first in Settings.");

    const apiKey = await decryptSecret(connection.api_key_ciphertext, connection.api_key_iv);
    const response = await fetch(`https://www.signwell.com/api/v1/documents/${documentId}`, {
      headers: { "X-Api-Key": apiKey, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new HttpError(response.status, `SignWell error: ${JSON.stringify(payload).slice(0, 300)}`);
    }

    return json({ ok: true, preview_url: payload.embedded_edit_url || "" });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("carrier-agreement-preview", { status, message });
    return json({ error: message }, status);
  }
});
