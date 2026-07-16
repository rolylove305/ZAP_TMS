import { authenticatedContext, decryptEldCredential, EldHttpError } from "../_shared/eld-secure.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}

function text(item: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function numeric(item: Record<string, unknown>, key: string) {
  const value = item[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const date = new Date(parsed < 1_000_000_000_000 ? parsed * 1000 : parsed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function nextFleetLocations(apiKey: string) {
  const response = await fetch("https://cloud.nextfleeteld.com/api/v0/locations", {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
  });
  const raw = await response.text();
  let payload: unknown = raw;
  try { payload = raw ? JSON.parse(raw) : null; } catch { /* keep raw for error */ }
  if (!response.ok) {
    const detail = typeof payload === "string" ? payload.slice(0, 300) : JSON.stringify(payload).slice(0, 300);
    throw new EldHttpError(response.status, `Next Fleet location API error ${response.status}: ${detail}`);
  }
  const vehicles = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).vehicles
    : null;
  return Array.isArray(vehicles)
    ? vehicles.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

const fields = "external_id,vehicle_id,driver_external_id,latitude,longitude,speed,bearing,fuel,odometer,engine_hours,location_time,timezone_offset,geocoded_location,synced_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const { user, admin } = await authenticatedContext(req);
    if (req.method !== "GET" && req.method !== "POST") throw new EldHttpError(405, "Method not allowed");

    const url = new URL(req.url);
    const body = req.method === "POST"
      ? await req.json().catch(() => ({})) as Record<string, unknown>
      : {};
    const connectionId = req.method === "POST"
      ? String(body.connection_id || "")
      : String(url.searchParams.get("connection_id") || "");
    if (!connectionId) throw new EldHttpError(400, "connection_id is required");

    const { data: connection, error: connectionError } = await admin
      .from("eld_connections")
      .select("credential_ciphertext,credential_iv,provider")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();
    if (connectionError || !connection) throw new EldHttpError(404, "ELD connection not found");
    if (connection.provider !== "nextfleet") throw new EldHttpError(400, "Location provider is not supported");

    if (req.method === "POST") {
      const vehicles = await nextFleetLocations(
        await decryptEldCredential(connection.credential_ciphertext, connection.credential_iv),
      );
      const now = new Date().toISOString();
      const rows = vehicles.map((item, index) => ({
        user_id: user.id,
        connection_id: connectionId,
        external_id: text(item, "id"),
        vehicle_id: text(item, "vehicleId", "id") || `vehicle-${index}`,
        driver_external_id: text(item, "driverID", "driverId"),
        latitude: numeric(item, "latitude"),
        longitude: numeric(item, "longitude"),
        speed: numeric(item, "speed"),
        bearing: text(item, "bearing"),
        fuel: numeric(item, "fuel"),
        odometer: numeric(item, "odometer"),
        engine_hours: numeric(item, "engineHours"),
        location_time: toIso(item.locationTime),
        timezone_offset: numeric(item, "timeZoneOffset"),
        geocoded_location: text(item, "geoCodedLocation"),
        raw_data: item,
        synced_at: now,
      }));
      if (rows.length) {
        const { error } = await admin
          .from("eld_vehicle_locations")
          .upsert(rows, { onConflict: "connection_id,vehicle_id" });
        if (error) throw new EldHttpError(500, error.message);
      }
    }

    const { data, error } = await admin
      .from("eld_vehicle_locations")
      .select(fields)
      .eq("user_id", user.id)
      .eq("connection_id", connectionId)
      .order("vehicle_id");
    if (error) throw new EldHttpError(500, error.message);
    return reply({ locations: data || [] });
  } catch (error) {
    const status = error instanceof EldHttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected location error";
    console.error("eld-location", { status, message });
    return reply({ error: message }, status);
  }
});
