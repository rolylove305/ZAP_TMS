import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const decoder = new TextDecoder();

export class EldHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new EldHttpError(500, `Missing server secret: ${name}`);
  return value;
}

function decode64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function decryptEldCredential(ciphertext: string, iv: string) {
  const raw = decode64(required("ELD_CREDENTIALS_KEY"));
  if (raw.byteLength !== 32) throw new EldHttpError(500, "Invalid ELD encryption secret");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const output = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode64(iv) },
    key,
    decode64(ciphertext),
  );
  return decoder.decode(output);
}

export async function authenticatedContext(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) throw new EldHttpError(401, "Missing login session");
  const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(header.slice(7).trim());
  if (error || !data.user) throw new EldHttpError(401, "Invalid or expired login session");
  return { user: data.user, admin };
}
