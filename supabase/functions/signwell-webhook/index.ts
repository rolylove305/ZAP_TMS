import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return bytesToHex(new Uint8Array(signature));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const payload = await req.json().catch(() => null);
    const eventType = payload?.event?.type as string | undefined;
    const eventTime = payload?.event?.time;
    const eventHash = payload?.event?.hash as string | undefined;
    const object = payload?.data?.object;
    const documentId = object?.id as string | undefined;
    const metadata = (object?.metadata || {}) as Record<string, unknown>;
    const userId = String(metadata.user_id || "");

    if (!eventType || !eventHash || !documentId || !userId) {
      return json({ ok: true, ignored: "missing fields" });
    }

    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: connection, error: connError } = await admin
      .from("signwell_connections")
      .select("webhook_id,api_key_ciphertext,api_key_iv")
      .eq("user_id", userId)
      .maybeSingle();
    if (connError || !connection?.webhook_id) {
      console.error("signwell-webhook: no connection/webhook_id for user", userId);
      return json({ ok: true, ignored: "unknown connection" });
    }

    const expected = await hmacHex(connection.webhook_id, `${eventType}@${eventTime}`);
    if (expected !== eventHash) {
      console.error("signwell-webhook: hash mismatch", { userId, documentId });
      return json({ error: "Invalid signature" }, 401);
    }

    const STATUS_MAP: Record<string, string> = {
      document_completed: "signed",
      document_declined: "declined",
      document_expired: "expired",
      document_canceled: "canceled",
      document_viewed: "viewed",
      document_in_progress: "in_progress",
    };
    const newStatus = STATUS_MAP[eventType];
    if (!newStatus) return json({ ok: true, ignored: eventType });

    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };

    if (eventType === "document_completed") {
      const apiKey = await decryptSecret(connection.api_key_ciphertext, connection.api_key_iv);
      const pdfResponse = await fetch(
        `https://www.signwell.com/api/v1/documents/${documentId}/completed_pdf?url_only=false`,
        { headers: { "X-Api-Key": apiKey, accept: "application/pdf" } },
      );
      if (pdfResponse.ok) {
        const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
        const carrierId = String(metadata.carrier_id || "misc");
        const path = `${userId}/carrier-agreements/${carrierId}_${Date.now()}.pdf`;
        const { error: uploadError } = await admin.storage
          .from("load-documents")
          .upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (!uploadError) {
          updates.storage_path = path;
          updates.completed_at = new Date().toISOString();
        } else {
          console.error("signwell-webhook: storage upload failed", uploadError);
        }
      } else {
        console.error("signwell-webhook: completed_pdf fetch failed", pdfResponse.status);
      }
    }

    const { error: updateError } = await admin
      .from("carrier_agreements")
      .update(updates)
      .eq("user_id", userId)
      .eq("signwell_document_id", documentId);
    if (updateError) console.error("signwell-webhook: update failed", updateError);

    return json({ ok: true });
  } catch (error) {
    console.error("signwell-webhook", error);
    return json({ ok: true, error: error instanceof Error ? error.message : "error" });
  }
});
