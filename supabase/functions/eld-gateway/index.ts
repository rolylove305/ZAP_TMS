import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import {
  ApolloApiError,
  apolloBreakMinutes,
  apolloClockMinutes,
  apolloDriverName,
  apolloEpochToIso,
  apolloRequest,
  apolloRows,
  sanitizeApolloRecord,
} from "../_shared/apollo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const NEXT_FLEET_BASE_URL = "https://cloud.nextfleeteld.com";
const SUPPORTED_PROVIDERS = new Set(["nextfleet", "apollo"]);
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
  if (!auth.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Missing Authorization bearer token");
  }
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
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }
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

function firstNumber(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Math.trunc(Number(value));
    }
  }
  return null;
}

function epochToIso(value: unknown): string | null {
  const millis = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(millis) || millis <= 0) return null;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function nextFleetRequest(
  apiKey: string,
  path: string,
  method: "GET" | "POST" = "GET",
): Promise<unknown> {
  const response = await fetch(`${NEXT_FLEET_BASE_URL}${path}`, {
    method,
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? "{}" : undefined,
  });

  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Keep text for a useful error message.
  }

  if (!response.ok) {
    const detail = typeof payload === "string"
      ? payload.slice(0, 500)
      : JSON.stringify(payload).slice(0, 500);
    throw new HttpError(response.status, `Next Fleet API error ${response.status}: ${detail}`);
  }
  return payload;
}

async function getConnection(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  connectionId: string,
) {
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
  return decryptSecret(
    String(connection.credential_ciphertext),
    String(connection.credential_iv),
  );
}

async function testNextFleet(apiKey: string) {
  const payload = await nextFleetRequest(
    apiKey,
    "/api/v0/users/drivers?page=1&elements=1&asc=true&orderBy=driverName&active=true",
  );
  return { ok: true, provider: "nextfleet", sampleCount: asArray(payload).length };
}

async function testApollo(apiKey: string) {
  try {
    const payload = await apolloRequest(
      apiKey,
      "/HOSDriver/v2.0/GetHOSDriversForClient",
      { DriverStatus: 1 },
    );
    return { ok: true, provider: "apollo", sampleCount: apolloRows(payload).length };
  } catch (error) {
    if (error instanceof ApolloApiError) throw new HttpError(error.status, error.message);
    throw error;
  }
}

async function testProvider(provider: string, apiKey: string) {
  if (provider === "nextfleet") return testNextFleet(apiKey);
  if (provider === "apollo") return testApollo(apiKey);
  throw new HttpError(400, "ELD provider is not supported");
}

async function syncNextFleetBase(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  connectionId: string,
  apiKey: string,
) {
  const [driversPayload, gpsPayload, eldPayload] = await Promise.all([
    nextFleetRequest(apiKey, "/api/v0/users/drivers?page=1&elements=100&asc=true&orderBy=driverName&active=true"),
    nextFleetRequest(apiKey, "/api/v0/devices/gps?page=1&elements=100&asc=true&orderBy=vehicleId&status=active"),
    nextFleetRequest(apiKey, "/api/v0/devices/eld?page=1&elements=100&asc=true&orderBy=vehicleId&status=active"),
  ]);

  const syncedAt = new Date().toISOString();
  const drivers = asArray(driversPayload).map((item, index) => ({
    user_id: userId,
    connection_id: connectionId,
    external_id: firstString(item, ["id", "driverId", "userId", "uuid"]) || `driver-${index}`,
    driver_name: firstString(item, ["driverName", "name", "fullName", "username"]),
    phone: firstString(item, ["phoneNum", "phone", "mobile", "phoneNumber"]),
    email: firstString(item, ["email", "emailAddress"]),
    status: firstString(item, ["status", "driverStatus"]),
    duty_status: firstString(item, ["dutyStatus"]),
    raw_data: item,
    synced_at: syncedAt,
  }));

  const normalizeDevices = (payload: unknown, deviceType: "gps" | "eld") =>
    asArray(payload).map((item, index) => ({
      user_id: userId,
      connection_id: connectionId,
      device_type: deviceType,
      external_id:
        firstString(item, ["id", "deviceId", "serialNum", "serialNumber", "vehicleId"]) ||
        `${deviceType}-${index}`,
      vehicle_id: firstString(item, ["vehicleId", "vehicle", "unitNumber", "truckNumber"]),
      serial_number: firstString(item, ["serialNum", "serialNumber", "serial"]),
      status: firstString(item, ["status", "deviceStatus"]),
      raw_data: item,
      synced_at: syncedAt,
    }));

  const gpsDevices = normalizeDevices(gpsPayload, "gps");
  const eldDevices = normalizeDevices(eldPayload, "eld");
  const devices = [...gpsDevices, ...eldDevices];

  if (drivers.length) {
    const { error } = await admin
      .from("eld_external_drivers")
      .upsert(drivers, { onConflict: "connection_id,external_id" });
    if (error) throw new HttpError(500, `Could not save synced drivers: ${error.message}`);
  }

  if (devices.length) {
    const { error } = await admin
      .from("eld_external_devices")
      .upsert(devices, { onConflict: "connection_id,device_type,external_id" });
    if (error) throw new HttpError(500, `Could not save synced devices: ${error.message}`);
  }

  return {
    drivers: drivers.length,
    gpsDevices: gpsDevices.length,
    eldDevices: eldDevices.length,
  };
}

function apolloActiveStatus(value: unknown): string {
  if (value === true || value === 1 || String(value).toLowerCase() === "true" || String(value) === "1") {
    return "active";
  }
  if (value === false || value === 0 || String(value).toLowerCase() === "false" || String(value) === "0") {
    return "inactive";
  }
  return String(value ?? "").trim();
}

async function syncApolloBase(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  connectionId: string,
  apiKey: string,
) {
  let driversPayload: unknown;
  let assetsPayload: unknown;
  try {
    [driversPayload, assetsPayload] = await Promise.all([
      apolloRequest(apiKey, "/HOSDriver/v2.0/GetHOSDriversForClient"),
      apolloRequest(apiKey, "/HOSAsset/v2.0/GetHOSAssetsForClient"),
    ]);
  } catch (error) {
    if (error instanceof ApolloApiError) throw new HttpError(error.status, error.message);
    throw error;
  }

  const syncedAt = new Date().toISOString();
  const drivers = apolloRows(driversPayload).map((item, index) => ({
    user_id: userId,
    connection_id: connectionId,
    external_id: firstString(item, ["HOSDriverId", "ExternalDriverId", "HOSUserName"]) || `apollo-driver-${index}`,
    driver_name: apolloDriverName(item),
    phone: firstString(item, ["MobilePhone", "Phone", "PhoneNumber"]),
    email: firstString(item, ["Email", "EmailAddress"]),
    status: apolloActiveStatus(item.IsActive ?? item.DriverStatus),
    duty_status: "",
    raw_data: sanitizeApolloRecord(item),
    synced_at: syncedAt,
  }));

  const eldDevices = apolloRows(assetsPayload).map((item, index) => ({
    user_id: userId,
    connection_id: connectionId,
    device_type: "eld" as const,
    external_id: firstString(item, ["AssetId", "ECMId", "VIN", "Number"]) || `apollo-eld-${index}`,
    vehicle_id: firstString(item, ["Number", "VehicleNumber", "UnitNumber"]),
    serial_number: firstString(item, ["ECMId", "AdditionalECMId", "VIN"]),
    status: apolloActiveStatus(item.Active),
    raw_data: sanitizeApolloRecord(item),
    synced_at: syncedAt,
  }));

  if (drivers.length) {
    const { error } = await admin
      .from("eld_external_drivers")
      .upsert(drivers, { onConflict: "connection_id,external_id" });
    if (error) throw new HttpError(500, `Could not save Apollo drivers: ${error.message}`);
  }

  if (eldDevices.length) {
    const { error } = await admin
      .from("eld_external_devices")
      .upsert(eldDevices, { onConflict: "connection_id,device_type,external_id" });
    if (error) throw new HttpError(500, `Could not save Apollo assets: ${error.message}`);
  }

  return { drivers: drivers.length, gpsDevices: 0, eldDevices: eldDevices.length };
}

async function syncNextFleetHos(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  connectionId: string,
  apiKey: string,
) {
  const endTime = Date.now();
  const startTime = endTime - 7 * 24 * 60 * 60 * 1000;
  const query = new URLSearchParams({
    page: "1",
    elements: "100",
    orderBy: "driverName",
    asc: "true",
    active: "true",
    showUnassigned: "true",
    startTime: String(startTime),
    endTime: String(endTime),
    forceFinished: "false",
    eventTypes: "",
    companyIds: "",
    groupIds: "",
    vehicleIds: "",
    driverIds: "",
    fmcIds: "",
    trailerIds: "",
  });

  const payload = await nextFleetRequest(
    apiKey,
    `/web/fleetDashboard/driverProfiles?${query.toString()}`,
    "POST",
  );

  const hosSyncedAt = new Date().toISOString();
  const profiles = asArray(payload);
  const records = profiles.map((item, index) => ({
    user_id: userId,
    connection_id: connectionId,
    external_id: firstString(item, ["id", "driverId"]) || `hos-driver-${index}`,
    driver_name: firstString(item, ["driverName", "name"]),
    phone: firstString(item, ["phoneNum", "phone"]),
    vehicle_id: firstString(item, ["vehicleId"]),
    trailer_id: firstString(item, ["trailerName", "trailerId"]),
    duty_status: firstString(item, ["dutyStatus"]),
    duty_status_duration: firstString(item, ["dutyStatusDuration"]),
    break_minutes: firstNumber(item, ["breakTime"]),
    drive_minutes: firstNumber(item, ["driveTime"]),
    shift_minutes: firstNumber(item, ["shiftTime"]),
    cycle_minutes: firstNumber(item, ["cycleTime"]),
    cycle_tomorrow_minutes: firstNumber(item, ["cycleTomorrowTime"]),
    last_hos_sync: firstString(item, ["lastHosSync"]),
    last_activity_at: epochToIso(item.lastActivity),
    hos_synced_at: hosSyncedAt,
    raw_data: item,
    synced_at: hosSyncedAt,
  }));

  if (records.length) {
    const { error } = await admin
      .from("eld_external_drivers")
      .upsert(records, { onConflict: "connection_id,external_id" });
    if (error) throw new HttpError(500, `Could not save HOS clocks: ${error.message}`);
  }

  return { hosDrivers: records.length };
}

async function syncApolloHos(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  connectionId: string,
  apiKey: string,
) {
  let payload: unknown;
  try {
    payload = await apolloRequest(
      apiKey,
      "/HOSDashboard/v2.0/GetHoursOfServiceByDriverForClient",
      { HOSDriverId: -1 },
    );
  } catch (error) {
    if (error instanceof ApolloApiError) throw new HttpError(error.status, error.message);
    throw error;
  }

  const hosSyncedAt = new Date().toISOString();
  const records = apolloRows(payload).map((item, index) => {
    const activityAt = apolloEpochToIso(item.LastUpdateTimestamp);
    return {
      user_id: userId,
      connection_id: connectionId,
      external_id: firstString(item, ["HOSDriverId", "HOSUserName"]) || `apollo-hos-driver-${index}`,
      driver_name: apolloDriverName(item),
      duty_status: firstString(item, ["CurrentDutyStatus"]),
      break_minutes: apolloBreakMinutes(item.Next30BreakTimestamp),
      drive_minutes: apolloClockMinutes(item.DrivingString),
      shift_minutes: apolloClockMinutes(item.OnDutyString),
      cycle_minutes: apolloClockMinutes(item.OnDutyWeekString),
      cycle_tomorrow_minutes: null,
      last_hos_sync: activityAt || firstString(item, ["LastUpdateTimestamp"]),
      last_activity_at: activityAt,
      hos_synced_at: hosSyncedAt,
      raw_data: sanitizeApolloRecord(item),
      synced_at: hosSyncedAt,
    };
  });

  if (records.length) {
    const { error } = await admin
      .from("eld_external_drivers")
      .upsert(records, { onConflict: "connection_id,external_id" });
    if (error) throw new HttpError(500, `Could not save Apollo HOS clocks: ${error.message}`);
  }

  return { hosDrivers: records.length };
}

async function syncProviderBase(
  provider: string,
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  connectionId: string,
  apiKey: string,
) {
  if (provider === "nextfleet") return syncNextFleetBase(admin, userId, connectionId, apiKey);
  if (provider === "apollo") return syncApolloBase(admin, userId, connectionId, apiKey);
  throw new HttpError(400, "ELD provider is not supported");
}

async function syncProviderHos(
  provider: string,
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  connectionId: string,
  apiKey: string,
) {
  if (provider === "nextfleet") return syncNextFleetHos(admin, userId, connectionId, apiKey);
  if (provider === "apollo") return syncApolloHos(admin, userId, connectionId, apiKey);
  throw new HttpError(400, "ELD provider is not supported");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { user, admin } = await authenticatedUser(req);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const connectionId = url.searchParams.get("connection_id");

      if (connectionId) {
        const [drivers, devices] = await Promise.all([
          admin
            .from("eld_external_drivers")
            .select(
              "external_id,driver_name,phone,email,status,synced_at,vehicle_id,trailer_id,duty_status,duty_status_duration,break_minutes,drive_minutes,shift_minutes,cycle_minutes,cycle_tomorrow_minutes,last_hos_sync,last_activity_at,hos_synced_at",
            )
            .eq("user_id", user.id)
            .eq("connection_id", connectionId)
            .order("driver_name"),
          admin
            .from("eld_external_devices")
            .select("device_type,external_id,vehicle_id,serial_number,status,synced_at")
            .eq("user_id", user.id)
            .eq("connection_id", connectionId)
            .order("vehicle_id"),
        ]);

        if (drivers.error) throw new HttpError(500, drivers.error.message);
        if (devices.error) throw new HttpError(500, devices.error.message);
        return json({ drivers: drivers.data || [], devices: devices.data || [] });
      }

      const { data, error } = await admin
        .from("eld_connections")
        .select(
          "id,carrier_id,provider,display_name,account_id,status,last_error,last_tested_at,last_synced_at,created_at,updated_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw new HttpError(500, error.message);
      return json({ connections: data || [] });
    }

    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "save_connection") {
      const provider = String(body.provider || "").toLowerCase();
      const apiKey = String(body.api_key || "").trim();
      const displayName = String(body.display_name || "").trim();
      const carrierId = body.carrier_id ? String(body.carrier_id) : null;

      if (!SUPPORTED_PROVIDERS.has(provider)) {
        throw new HttpError(400, "ELD provider is not supported");
      }
      if (!apiKey || !displayName) {
        throw new HttpError(400, "Connection name and API key are required");
      }

      await testProvider(provider, apiKey);
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

      const { data, error } = await admin
        .from("eld_connections")
        .upsert(record, { onConflict: "user_id,provider,display_name" })
        .select("id,carrier_id,provider,display_name,status,last_tested_at,last_synced_at")
        .single();

      if (error) throw new HttpError(500, error.message);
      return json({ connection: data }, 201);
    }

    const connectionId = String(body.connection_id || "");
    if (!connectionId) throw new HttpError(400, "connection_id is required");
    const connection = await getConnection(admin, user.id, connectionId);

    if (action === "test_connection") {
      const apiKey = await connectionApiKey(connection);
      const provider = String(connection.provider || "").toLowerCase();
      try {
        const result = await testProvider(provider, apiKey);
        await admin
          .from("eld_connections")
          .update({
            status: "connected",
            last_error: null,
            last_tested_at: new Date().toISOString(),
          })
          .eq("id", connectionId)
          .eq("user_id", user.id);
        return json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connection test failed";
        await admin
          .from("eld_connections")
          .update({
            status: "error",
            last_error: message,
            last_tested_at: new Date().toISOString(),
          })
          .eq("id", connectionId)
          .eq("user_id", user.id);
        throw error;
      }
    }

    if (action === "sync") {
      const provider = String(connection.provider || "").toLowerCase();
      const apiKey = await connectionApiKey(connection);
      const base = await syncProviderBase(provider, admin, user.id, connectionId, apiKey);
      let hos: { hosDrivers: number; warning?: string } = { hosDrivers: 0 };

      try {
        hos = await syncProviderHos(provider, admin, user.id, connectionId, apiKey);
      } catch (error) {
        hos.warning = error instanceof Error ? error.message : "HOS sync failed";
      }

      const syncedAt = new Date().toISOString();
      await admin
        .from("eld_connections")
        .update({
          status: "connected",
          last_error: hos.warning || null,
          last_synced_at: syncedAt,
        })
        .eq("id", connectionId)
        .eq("user_id", user.id);

      return json({ ...base, ...hos, syncedAt });
    }

    if (action === "delete_connection") {
      const { error } = await admin
        .from("eld_connections")
        .delete()
        .eq("id", connectionId)
        .eq("user_id", user.id);
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
