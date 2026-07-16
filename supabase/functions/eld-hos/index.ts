import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const decoder = new TextDecoder();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Missing server secret: ${name}`);
  return value;
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function decrypt(ciphertext: string, iv: string) {
  const raw = fromBase64(env("ELD_CREDENTIALS_KEY"));
  if (raw.byteLength !== 32) throw new HttpError(500, "Invalid ELD encryption secret");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const output = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return decoder.decode(output);
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function userAndAdmin(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) throw new HttpError(401, "Missing login session");
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(header.slice(7).trim());
  if (error || !data.user) throw new HttpError(401, "Invalid or expired login session");
  return { user: data.user, admin };
}

function rows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["data", "content", "items", "results", "records", "rows"]) {
    if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
  }
  return [];
}

function text(item: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function minutes(item: Record<string, unknown>, key: string): number | null {
  const value = item[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

async function fetchOfficialHos(apiKey: string) {
  const query = new URLSearchParams({
    page: "1",
    elements: "100",
    asc: "true",
    orderBy: "driverName",
  });
  const response = await fetch(
    `https://cloud.nextfleeteld.com/api/v0/driverProfiles?${query}`,
    { headers: { "X-Api-Key": apiKey, Accept: "application/json" } },
  );
  const raw = await response.text();
  let payload: unknown = raw;
  try { payload = raw ? JSON.parse(raw) : null; } catch { /* keep text for error */ }
  if (!response.ok) {
    const detail = typeof payload === "string" ? payload.slice(0, 300) : JSON.stringify(payload).slice(0, 300);
    throw new HttpError(response.status, `Next Fleet HOS API error ${response.status}: ${detail}`);
  }
  return rows(payload);
}

const selectFields =
  "external_id,driver_name,phone,vehicle_id,trailer_id,duty_status,duty_status_duration,break_minutes,drive_minutes,shift_minutes,cycle_minutes,cycle_tomorrow_minutes,last_hos_sync,last_activity_at,hos_synced_at,raw_data";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const { user, admin } = await userAndAdmin(req);
    if (req.method !== "GET" && req.method !== "POST") throw new HttpError(405, "Method not allowed");

    const url = new URL(req.url);
    const body = req.method === "POST"
      ? await req.json().catch(() => ({})) as Record<string, unknown>
      : {};
    const connectionId = req.method === "POST"
      ? String(body.connection_id || "")
      : String(url.searchParams.get("connection_id") || "");
    if (!connectionId) throw new HttpError(400, "connection_id is required");

    const { data: connection, error: connectionError } = await admin
      .from("eld_connections")
      .select("credential_ciphertext,credential_iv,provider")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();
    if (connectionError || !connection) throw new HttpError(404, "ELD connection not found");
    if (connection.provider !== "nextfleet") throw new HttpError(400, "HOS provider is not supported");

    if (req.method === "POST") {
      const { data: existingRows, error: existingError } = await admin
        .from("eld_external_drivers")
        .select("external_id,raw_data")
        .eq("user_id", user.id)
        .eq("connection_id", connectionId);
      if (existingError) throw new HttpError(500, existingError.message);
      const existing = new Map((existingRows || []).map((row) => [String(row.external_id), row.raw_data || {}]));

      const profiles = await fetchOfficialHos(
        await decrypt(connection.credential_ciphertext, connection.credential_iv),
      );
      const now = new Date().toISOString();
      const normalized = profiles.map((item, index) => {
        const externalId = text(item, "id", "driverId") || `hos-driver-${index}`;
        const priorRaw = existing.get(externalId);
        return {
          user_id: user.id,
          connection_id: connectionId,
          external_id: externalId,
          driver_name: text(item, "driverName", "name"),
          vehicle_id: text(item, "vehicleId"),
          duty_status: text(item, "dutyStatus"),
          break_minutes: minutes(item, "breakTime"),
          drive_minutes: minutes(item, "driveTime"),
          shift_minutes: minutes(item, "shiftTime"),
          cycle_minutes: minutes(item, "cycleTime"),
          cycle_tomorrow_minutes: minutes(item, "cycleTomorrowTime"),
          hos_synced_at: now,
          synced_at: now,
          raw_data: { ...(priorRaw && typeof priorRaw === "object" ? priorRaw : {}), ...item },
        };
      });
      if (normalized.length) {
        const { error } = await admin
          .from("eld_external_drivers")
          .upsert(normalized, { onConflict: "connection_id,external_id" });
        if (error) throw new HttpError(500, error.message);
      }
    }

    const { data, error } = await admin
      .from("eld_external_drivers")
      .select(selectFields)
      .eq("user_id", user.id)
      .eq("connection_id", connectionId)
      .order("driver_name");
    if (error) throw new HttpError(500, error.message);

    return reply({ drivers: data || [], hos_api_available: true, warning: null });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected HOS error";
    console.error("eld-hos", { status, message });
    return reply({ error: message }, status);
  }
});