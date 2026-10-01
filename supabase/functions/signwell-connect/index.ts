import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const encoder = new TextEncoder();

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(): Promise<CryptoKey> {
  const raw = base64ToBytes(requireEnv("ELD_CREDENTIALS_KEY"));
  if (raw.byteLength !== 32) {
    throw new HttpError(500, "ELD_CREDENTIALS_KEY must be a base64-encoded 32-byte key");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(value),
  );
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
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
    throw new HttpError(response.status, `SignWell error ${response.status}: ${detail.slice(0, 300)}`);
  }
  return payload as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) throw new HttpError(401, "Missing login session");
    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(authHeader.slice(7).trim());
    if (authError || !authData.user) throw new HttpError(401, "Invalid or expired login session");
    const userId = authData.user.id;

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("signwell_connections")
        .select("status,account_email,template_id,last_error,updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      return json({ connection: data || null });
    }

    if (req.method === "DELETE") {
      const { error } = await admin.from("signwell_connections").delete().eq("user_id", userId);
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true });
    }

    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const body = await req.json().catch(() => ({}));
    const apiKey = String(body.api_key || "").trim();
    const templateId = body.template_id ? String(body.template_id).trim() : null;

    const { data: existing } = await admin
      .from("signwell_connections")
      .select("id,api_key_ciphertext,api_key_iv,webhook_id,template_id")
      .eq("user_id", userId)
      .maybeSingle();

    // Allow saving/changing just the template_id without re-sending the API key.
    if (!apiKey && existing && templateId !== null) {
      const { error } = await admin
        .from("signwell_connections")
        .update({ template_id: templateId, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true });
    }
    if (!apiKey) throw new HttpError(400, "api_key is required");

    const me = await signwellFetch(apiKey, "/me");
    const accountEmail = String((me as { email?: string }).email || "");

    const callbackUrl = `${requireEnv("SUPABASE_URL")}/functions/v1/signwell-webhook`;

    let webhookId = existing?.webhook_id || null;
    if (!webhookId) {
      try {
        const hook = await signwellFetch(apiKey, "/hooks", {
          method: "POST",
          body: JSON.stringify({ callback_url: callbackUrl }),
        });
        webhookId = String((hook as { id?: string }).id || "") || null;
      } catch (error) {
        console.error("signwell-connect webhook create failed", error);
      }
    }

    const encrypted = await encryptSecret(apiKey);
    const row = {
      user_id: userId,
      api_key_ciphertext: encrypted.ciphertext,
      api_key_iv: encrypted.iv,
      account_email: accountEmail,
      template_id: templateId ?? existing?.template_id ?? null,
      webhook_id: webhookId,
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("signwell_connections").upsert(row, { onConflict: "user_id" });
    if (error) throw new HttpError(500, error.message);

    return json({ ok: true, account_email: accountEmail, webhook_configured: !!webhookId });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("signwell-connect", { status, message });
    return json({ error: message }, status);
  }
});
