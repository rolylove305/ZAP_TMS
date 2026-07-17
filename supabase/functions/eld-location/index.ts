import {
  authenticatedContext,
  decryptEldCredential,
  EldHttpError,
} from "../_shared/eld-secure.ts";
import {
  ApolloApiError,
  apolloRequest,
  apolloRows,
  sanitizeApolloRecord,
} from "../_shared/apollo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });

function text(item: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function numeric(item: Record<string, unknown>, key: string): number | null {
  const value = item[key];
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: unknown): string | null {
  if (typeof value === "string" && !value.trim()) return null;
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
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    // Keep the response only for a safe error below.
  }
  if (!response.ok) {
    const detail = typeof payload === "string"
      ? payload.slice(0, 300)
      : JSON.stringify(payload).slice(0, 300);
    throw new EldHttpError(
      response.status,
      `Next Fleet location API error ${response.status}: ${detail}`,
    );
  }
  const vehicles = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).vehicles
    : null;
  return Array.isArray(vehicles)
    ? vehicles.filter((item): item is Record<string, unknown> =>
      !!item && typeof item === "object"
    )
    : [];
}

async function apolloDriverRecords(apiKey: string) {
  const endDate = Math.floor(Date.now() / 1000);
  try {
    return apolloRows(await apolloRequest(
      apiKey,
      "/HOSRecord/v2.0/GetDriverRecordsForClient",
      {
        HOSDriverId: -1,
        FromDate: endDate - 48 * 60 * 60,
        EndDate: endDate,
      },
    ));
  } catch (error) {
    if (error instanceof ApolloApiError) {
      throw new EldHttpError(error.status, error.message);
    }
    throw error;
  }
}

type ApolloDriverSnapshot = {
  latest: Record<string, unknown> | null;
  vehicle: Record<string, unknown> | null;
  coordinates: Record<string, unknown> | null;
};

function newer(
  current: Record<string, unknown> | null,
  candidate: Record<string, unknown>,
): boolean {
  return !current || Number(candidate.Timestamp || 0) > Number(current.Timestamp || 0);
}

function apolloSnapshots(records: Record<string, unknown>[]) {
  const snapshots = new Map<string, ApolloDriverSnapshot>();
  for (const record of records) {
    const driverId = text(record, "HOSDriverId");
    const vehicleId = text(record, "TractorNumber", "TractorVin", "ELDId");
    if (!driverId && !vehicleId) continue;
    const key = driverId || `vehicle:${vehicleId}`;
    const snapshot = snapshots.get(key) || {
      latest: null,
      vehicle: null,
      coordinates: null,
    };
    if (newer(snapshot.latest, record)) snapshot.latest = record;
    if (vehicleId && newer(snapshot.vehicle, record)) snapshot.vehicle = record;

    const latitude = numeric(record, "Latitude");
    const longitude = numeric(record, "Longitude");
    if (
      latitude !== null &&
      longitude !== null &&
      !(latitude === 0 && longitude === 0) &&
      newer(snapshot.coordinates, record)
    ) {
      snapshot.coordinates = record;
    }
    snapshots.set(key, snapshot);
  }
  return snapshots;
}

function normalizeApolloLocations(records: Record<string, unknown>[]) {
  const rows: Record<string, unknown>[] = [];
  const assignments: Array<{
    driver_external_id: string;
    vehicle_id: string;
    trailer_id: string | null;
  }> = [];

  for (const [driverKey, snapshot] of apolloSnapshots(records)) {
    const latest = snapshot.latest;
    const vehicleRecord = snapshot.vehicle || latest;
    const coordinateRecord = snapshot.coordinates || latest;
    if (!vehicleRecord && !coordinateRecord) continue;

    const driverId = text(latest || vehicleRecord || {}, "HOSDriverId") ||
      (driverKey.startsWith("vehicle:") ? "" : driverKey);
    const vehicleId = text(
      vehicleRecord || {},
      "TractorNumber",
      "TractorVin",
      "ELDId",
    ) || (driverId ? `Driver ${driverId}` : driverKey.replace("vehicle:", ""));
    const city = text(coordinateRecord || {}, "City");
    const state = text(coordinateRecord || {}, "State");
    const locationDescription =
      text(coordinateRecord || {}, "DriverLocationDesc") ||
      [city, state].filter(Boolean).join(", ") ||
      null;

    rows.push({
      external_id: text(coordinateRecord || latest || {}, "HOSEventId", "ELDId") ||
        `${driverKey}-${text(coordinateRecord || latest || {}, "Timestamp") || "latest"}`,
      vehicle_id: vehicleId,
      driver_external_id: driverId || null,
      latitude: numeric(coordinateRecord || {}, "Latitude"),
      longitude: numeric(coordinateRecord || {}, "Longitude"),
      speed: null,
      bearing: null,
      fuel: null,
      odometer: numeric(coordinateRecord || latest || {}, "VehicleMiles"),
      engine_hours: numeric(coordinateRecord || latest || {}, "ElapsedEngineHours"),
      location_time: toIso((coordinateRecord || latest || {}).Timestamp),
      timezone_offset: null,
      geocoded_location: locationDescription,
      raw_data: sanitizeApolloRecord(coordinateRecord || latest || {}),
    });

    if (driverId && vehicleId) {
      assignments.push({
        driver_external_id: driverId,
        vehicle_id: vehicleId,
        trailer_id: text(vehicleRecord || {}, "TrailerNumber"),
      });
    }
  }
  return { rows, assignments };
}

function latestRowsByVehicle(rows: Record<string, unknown>[]) {
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row.vehicle_id || row.external_id || "").trim();
    if (!key) continue;
    const current = latest.get(key);
    const candidateTime = Date.parse(String(row.location_time || "")) || 0;
    const currentTime = current
      ? Date.parse(String(current.location_time || "")) || 0
      : -1;
    if (!current || candidateTime >= currentTime) latest.set(key, row);
  }
  return [...latest.values()];
}

const fields =
  "external_id,vehicle_id,driver_external_id,latitude,longitude,speed,bearing,fuel,odometer,engine_hours,location_time,timezone_offset,geocoded_location,synced_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const { user, admin } = await authenticatedContext(req);
    if (req.method !== "GET" && req.method !== "POST") {
      throw new EldHttpError(405, "Method not allowed");
    }

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
    if (connectionError || !connection) {
      throw new EldHttpError(404, "ELD connection not found");
    }

    const provider = String(connection.provider || "").toLowerCase();
    if (provider !== "nextfleet" && provider !== "apollo") {
      throw new EldHttpError(400, "Location provider is not supported");
    }

    if (req.method === "POST") {
      const apiKey = await decryptEldCredential(
        connection.credential_ciphertext,
        connection.credential_iv,
      );
      const now = new Date().toISOString();
      let rows: Record<string, unknown>[] = [];
      let assignments: Array<{
        driver_external_id: string;
        vehicle_id: string;
        trailer_id: string | null;
      }> = [];

      if (provider === "apollo") {
        const normalized = normalizeApolloLocations(
          await apolloDriverRecords(apiKey),
        );
        rows = normalized.rows;
        assignments = normalized.assignments;
      } else {
        rows = (await nextFleetLocations(apiKey)).map((item, index) => ({
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
        }));
      }

      // Apollo can return several driver-event groups for the same tractor. Postgres
      // cannot upsert the same conflict key twice in one statement, so keep only the
      // newest snapshot for each physical truck before writing.
      rows = latestRowsByVehicle(rows);

      const databaseRows = rows.map((row) => ({
        ...row,
        user_id: user.id,
        connection_id: connectionId,
        synced_at: now,
      }));
      if (databaseRows.length) {
        const { error } = await admin
          .from("eld_vehicle_locations")
          .upsert(databaseRows, { onConflict: "connection_id,vehicle_id" });
        if (error) throw new EldHttpError(500, error.message);
      }

      for (const assignment of assignments) {
        const { error } = await admin
          .from("eld_external_drivers")
          .update({
            vehicle_id: assignment.vehicle_id,
            trailer_id: assignment.trailer_id,
            synced_at: now,
          })
          .eq("user_id", user.id)
          .eq("connection_id", connectionId)
          .eq("external_id", assignment.driver_external_id);
        if (error) throw new EldHttpError(500, error.message);
      }

      const { error: connectionUpdateError } = await admin
        .from("eld_connections")
        .update({ last_synced_at: now, updated_at: now })
        .eq("id", connectionId)
        .eq("user_id", user.id);
      if (connectionUpdateError) {
        throw new EldHttpError(500, connectionUpdateError.message);
      }
    }

    const { data, error } = await admin
      .from("eld_vehicle_locations")
      .select(fields)
      .eq("user_id", user.id)
      .eq("connection_id", connectionId)
      .order("vehicle_id");
    if (error) throw new EldHttpError(500, error.message);

    const { data: driverRows, error: driverError } = await admin
      .from("eld_external_drivers")
      .select("external_id,driver_name,vehicle_id,trailer_id,duty_status,last_activity_at")
      .eq("user_id", user.id)
      .eq("connection_id", connectionId);
    if (driverError) throw new EldHttpError(500, driverError.message);

    const enriched = (data || []).map((location) => {
      const exactDriver = (driverRows || []).find((driver) =>
        location.driver_external_id &&
        String(driver.external_id || "") === String(location.driver_external_id)
      );
      const vehicleDrivers = (driverRows || []).filter((driver) =>
        location.vehicle_id &&
        String(driver.vehicle_id || "").trim() === String(location.vehicle_id).trim()
      );
      const matchedDrivers = exactDriver
        ? [exactDriver, ...vehicleDrivers.filter((driver) => driver.external_id !== exactDriver.external_id)]
        : vehicleDrivers;
      const driverNames = [...new Set(
        matchedDrivers.map((driver) => String(driver.driver_name || "").trim()).filter(Boolean),
      )];
      const primaryDriver = exactDriver || matchedDrivers[0] || null;
      return {
        ...location,
        driver_name: primaryDriver?.driver_name || null,
        driver_names: driverNames,
        trailer_id: primaryDriver?.trailer_id || null,
        duty_status: primaryDriver?.duty_status || null,
        driver_last_activity_at: primaryDriver?.last_activity_at || null,
      };
    });

    return reply({ locations: enriched });
  } catch (error) {
    const status = error instanceof EldHttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected location error";
    console.error("eld-location", { status, message });
    return reply({ error: message }, status);
  }
});
