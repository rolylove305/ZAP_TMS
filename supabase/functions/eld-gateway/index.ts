import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const NEXT_FLEET_BASE_URL = "https://cloud.nextfleeteld.com";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
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
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

async function decryptSecret(ciphertext: string, iv: string): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(ciphertext),
  );
  return decoder.decode(decrypted);
}

function tokenFromRequest(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) throw new HttpError(401, "Missing Authorization bearer token");
  return auth.slice(7).trim();
}

function serviceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticatedUser(req: Request) {
  const token = tokenFromRequest(req);
  const admin = serviceClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid or expired Supabase session");
  return { user: data.user, admin };
}

function asArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["content", "data", "items", "results", "records", "rows"]) {
    if (Array.isArray(obj[key])) return asArray(obj[key]);
  }
  return [];
}

function firstString(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

async function nextFleetFetch(apiKey: string, path: string): Promise<unknown> {
  const response = await fetch(`${NEXT_FLEET_BASE_URL}${path}`, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
  });
  const text = await response.text();
  let payload: unknown = text;
  try { payload = text ? JSON.parse(text) : null; } catch { /* retain text */ }
  if (!response.ok) {
    const detail = typeof payload === "string" ? payload.slice(0, 500) : JSON.stringify(payload).slice(0, 500);
    throw new HttpError(response.status, `Next Fleet API error ${response.status}: ${detail}`);
  }
  return payload;
}

async function getConnection(admin: ReturnType<typeof serviceClient>, userId: string, connectionId: string) {
  const { data, error } = await admin
    .from("eld_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new HttpError(404, "ELD connection not found");
  return data;
}

async function connectionApiKey(connection: Record<string, unknown>): Promise<string> {
  return decryptSecret(String(connection.credential_ciphertext), String(connection.credential_iv));
}

async function testNextFleet(apiKey: string) {
  const payload = await nextFleetFetch(
    apiKey,
    "/api/v0/users/drivers?page=1&elements=1&asc=true&orderBy=driverName&active=true",
  );
  return { ok: true, provider: "nextfleet", sampleCount: asArray(payload).length };
}

async function syncNextFleet(admin: ReturnType<typeof serviceClient>, userId: string, connectionId: string, apiKey: string) {
  const [driversPayload, gpsPayload, eldPayload] = await Promise.all([
    nextFleetFetch(apiKey, "/api/v0/users/drivers?page=1&elements=500&asc=true&orderBy=driverName&active=true"),
    nextFleetFetch(apiKey, "/api/v0/devices/gps?page=1&elements=500&asc=true&orderBy=vehicleId&status=active"),
    nextFleetFetch(apiKey, "/api/v0/devices/eld?page=1&elements=500&asc=true&orderBy=vehicleId&status=active"),
  ]);

  const drivers = asArray(driversPayload).map((item, index) => ({
    user_id: userId,
    connection_id: connectionId,
    external_id: firstString(item, ["id", "driverId", "userId", "uuid"]) || `driver-${index}`,
    driver_name: firstString(item, ["driverName", "name", "fullName", "username"]),
    phone: firstString(item, ["phoneNum", "phone", "mobile", "phoneNumber"]),
    email: firstString(item, ["email", "emailAddress"]),
    status: firstString(item, ["status", "driverStatus"]),
    raw_data: item,
    synced_at: new Date().toISOString(),
  }));

  const normalizeDevices = (payload: unknown, deviceType: "gps" | "eld") => asArray(payload).map((item, index) => ({
    user_id: userId,
    connection_id: connectionId,
    device_type: deviceType,
    external_id: firstString(item, ["id", "deviceId", "serialNum", "serialNumber", "vehicleId"]) || `${deviceType}-${index}`,
    vehicle_id: firstString(item, ["vehicleId", "vehicle", "unitNumber", "truckNumber"]),
    serial_number: firstString(item, ["serialNum", "serialNumber", "serial"]),
    status: firstString(item, ["status", "deviceStatus"]),
    raw_data: item,
    synced_at: new Date().toISOString(),
  }));

  const devices = [...normalizeDevices(gpsPayload, "gps"), ...normalizeDevices(eldPayload, "eld")];

  if (drivers.length) {
    const { error } = await admin.from("eld_external_drivers").upsert(drivers, { onConflict: "connection_id,external_id" });
    if (error) throw new HttpError(500, `Could not save synced drivers: ${error.message}`);
  }
  if (devices.length) {
    const { error } = await admin.from("eld_external_devices").upsert(devices, { onConflict: "connection_id,device_type,external_id" });
    if (error) throw new HttpError(500, `Could not save synced devices: ${error.message}`);
  }

  const now = new Date().toISOString();
  await admin.from("eld_connections").update({ status: "connected", last_error: null, last_synced_at: now }).eq("id", connectionId).eq("user_id", userId);
  return { drivers: drivers.length, gpsDevices: normalizeDevices(gpsPayload, "gps").length, eldDevices: normalizeDevices(eldPayload, "eld").length, syncedAt: now };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { user, admin } = await authenticatedUser(req);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const connectionId = url.searchParams.get("connection_id");
      if (connectionId) {
        const [drivers, devices] = await Promise.all([
          admin.from("eld_external_drivers").select("external_id,driver_name,phone,email,status,synced_at").eq("user_id", user.id).eq("connection_id", connectionId).order("driver_name"),
          admin.from("eld_external_devices").select("device_type,external_id,vehicle_id,serial_number,status,synced_at").eq("user_id", user.id).eq("connection_id", connectionId).order("vehicle_id"),
        ]);
        if (drivers.error) throw new HttpError(500, drivers.error.message);
        if (devices.error) throw new HttpError(500, devices.error.message);
        return json({ drivers: drivers.data || [], devices: devices.data || [] });
      }

      const { data, error } = await admin
        .from("eld_connections")
        .select("id,carrier_id,provider,display_name,account_id,status,last_error,last_tested_at,last_synced_at,created_at,updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw new HttpError(500, error.message);
      return json({ connections: data || [] });
    }

    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "save_connection") {
      const provider = String(body.provider || "").toLowerCase();
      const apiKey = String(body.api_key || "").trim();
      const displayName = String(body.display_name || "").trim();
      const carrierId = body.carrier_id ? String(body.carrier_id) : null;
      if (provider !== "nextfleet") throw new HttpError(400, "Next Fleet is the first supported provider");
      if (!apiKey || !displayName) throw new HttpError(400, "Connection name and API key are required");

      await testNextFleet(apiKey);
      const encrypted = await encryptSecret(apiKey);
      const record = {
        user_id: user.id,
        carrier_id: carrierId,
        provider,
        display_name: displayName,
        account_id: body.account_id ? String(body.account_id) : null,
        credential_ciphertext: encrypted.ciphertext,
        credential_iv: encrypted.iv,
        status: "connected",
        last_error: null,
        last_tested_at: new Date().toISOString(),
      };
      const { data, error } = await admin.from("eld_connections").upsert(record, { onConflict: "user_id,provider,display_name" }).select("id,carrier_id,provider,display_name,status,last_tested_at,last_synced_at").single();
      if (error) throw new HttpError(500, error.message);
      return json({ connection: data }, 201);
    }

    const connectionId = String(body.connection_id || "");
    if (!connectionId) throw new HttpError(400, "connection_id is required");
    const connection = await getConnection(admin, user.id, connectionId);

    if (action === "test_connection") {
      const apiKey = await connectionApiKey(connection);
      try {
        const result = await testNextFleet(apiKey);
        await admin.from("eld_connections").update({ status: "connected", last_error: null, last_tested_at: new Date().toISOString() }).eq("id", connectionId).eq("user_id", user.id);
        return json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connection test failed";
        await admin.from("eld_connections").update({ status: "error", last_error: message, last_tested_at: new Date().toISOString() }).eq("id", connectionId).eq("user_id", user.id);
        throw error;
      }
    }

    if (action === "sync") {
      if (String(connection.provider) !== "nextfleet") throw new HttpError(400, "Provider is not implemented yet");
      return json(await syncNextFleet(admin, user.id, connectionId, await connectionApiKey(connection)));
    }

    if (action === "delete_connection") {
      const { error } = await admin.from("eld_connections").delete().eq("id", connectionId).eq("user_id", user.id);
      if (error) throw new HttpError(500, error.message);
      return json({ deleted: true });
    }

    throw new HttpError(400, "Unknown action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error("eld-gateway", { status, message });
    return json({ error: message }, status);
  }
});
