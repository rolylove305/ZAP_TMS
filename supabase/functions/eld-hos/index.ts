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

async function fetchApolloHos(apiKey: string) {
  try {
    return apolloRows(await apolloRequest(
      apiKey,
      "/HOSDashboard/v2.0/GetHoursOfServiceByDriverForClient",
      { HOSDriverId: -1 },
    ));
  } catch (error) {
    if (error instanceof ApolloApiError) throw new HttpError(error.status, error.message);
    throw error;
  }
}

async function fetchApolloDriverRecords(apiKey: string) {
  const endDate = Math.floor(Date.now() / 1000);
  try {
    return apolloRows(await apolloRequest(
      apiKey,
      "/HOSRecord/v2.0/GetDriverRecordsForClient",
      {
        HOSDriverId: -1,
        FromDate: endDate - 16 * 24 * 60 * 60,
        EndDate: endDate,
      },
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apollo driver records unavailable";
    console.warn("apollo-driver-records", { message });
    return [];
  }
}

async function fetchApolloDriverProfiles(apiKey: string) {
  try {
    return apolloRows(await apolloRequest(
      apiKey,
      "/HOSDriver/v2.0/GetHOSDriversForClient",
      {},
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apollo driver profiles unavailable";
    console.warn("apollo-driver-profiles", { message });
    return [];
  }
}

function latestApolloRecordByDriver(records: Record<string, unknown>[]) {
  const latest = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const driverId = text(record, "HOSDriverId");
    if (!driverId) continue;
    const current = latest.get(driverId);
    const timestamp = Number(record.Timestamp || 0);
    const currentTimestamp = Number(current?.Timestamp || 0);
    if (!current || timestamp > currentTimestamp) latest.set(driverId, record);
  }
  return latest;
}

type ApolloCycleConfig = { days: number; limitMinutes: number };

const APOLLO_CYCLE_CONFIG: Record<number, ApolloCycleConfig> = {
  0: { days: 7, limitMinutes: 60 * 60 },
  1: { days: 8, limitMinutes: 70 * 60 },
  2: { days: 8, limitMinutes: 80 * 60 },
  3: { days: 7, limitMinutes: 60 * 60 },
  4: { days: 8, limitMinutes: 70 * 60 },
  5: { days: 7, limitMinutes: 70 * 60 },
  6: { days: 14, limitMinutes: 120 * 60 },
  7: { days: 7, limitMinutes: 70 * 60 },
  9: { days: 7, limitMinutes: 60 * 60 },
  10: { days: 8, limitMinutes: 70 * 60 },
  11: { days: 7, limitMinutes: 70 * 60 },
  12: { days: 8, limitMinutes: 80 * 60 },
  13: { days: 7, limitMinutes: 60 * 60 },
  14: { days: 8, limitMinutes: 70 * 60 },
};

const APOLLO_TIME_ZONES: Record<number, string> = {
  0: "America/New_York",
  1: "America/Chicago",
  2: "America/Denver",
  3: "America/Los_Angeles",
  4: "America/Anchorage",
  5: "Pacific/Honolulu",
  6: "America/Halifax",
  7: "America/Phoenix",
};

function apolloClockPair(value: unknown) {
  const [usedText = "", remainingText = ""] = String(value || "").split("/");
  const parse = (clock: string) => {
    const match = clock.trim().match(/^(\d+):(\d{1,2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  return { used: parse(usedText), remaining: parse(remainingText) };
}

function apolloEpochSeconds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed > 1_000_000_000_000 ? Math.floor(parsed / 1000) : Math.floor(parsed);
}

function apolloCycleConfig(item: Record<string, unknown>, profile?: Record<string, unknown>) {
  const ruleSetId = Number(profile?.HOSRuleSetId ?? item.HOSRuleSetId);
  const config = APOLLO_CYCLE_CONFIG[ruleSetId];
  return config ? { ...config, ruleSetId } : null;
}

function apolloTimeZone(profile?: Record<string, unknown>) {
  const code = Number(profile?.TimeZoneCode);
  return APOLLO_TIME_ZONES[code] || "America/New_York";
}

function dateKey(epochSeconds: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochSeconds * 1000));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDaysToDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function timeZoneOffsetMinutes(epochMs: number, timeZone: string) {
  const zoneName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(new Date(epochMs))
    .find((entry) => entry.type === "timeZoneName")?.value || "GMT";
  if (zoneName === "GMT" || zoneName === "UTC") return 0;
  const match = zoneName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const amount = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "-" ? -amount : amount;
}

function startOfDateKey(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  let result = utcMidnight;
  for (let index = 0; index < 3; index += 1) {
    result = utcMidnight - timeZoneOffsetMinutes(result, timeZone) * 60_000;
  }
  return Math.floor(result / 1000);
}

function isCycleDutyStatus(status: string) {
  const normalized = status.toUpperCase().replace(/[\s_-]+/g, "");
  return ["D", "DRIVING", "ON", "ONDUTY", "YM", "YARDMOVE"].includes(normalized);
}

function apolloCycleTomorrow(
  item: Record<string, unknown>,
  driverId: string,
  records: Record<string, unknown>[],
  profile?: Record<string, unknown>,
) {
  const config = apolloCycleConfig(item, profile);
  const clock = apolloClockPair(item.OnDutyWeekString);
  if (!config || clock.remaining === null) return null;

  const timeZone = apolloTimeZone(profile);
  const todayKey = dateKey(Math.floor(Date.now() / 1000), timeZone);
  const fallingOffDate = addDaysToDateKey(todayKey, -(config.days - 1));
  const start = startOfDateKey(fallingOffDate, timeZone);
  const end = startOfDateKey(addDaysToDateKey(fallingOffDate, 1), timeZone);

  const events = records
    .filter((record) => text(record, "HOSDriverId") === driverId)
    .filter((record) => {
      const eventStatus = Number(record.EventStatus);
      const eventType = Number(record.EventType);
      return (!Number.isFinite(eventStatus) || eventStatus === 1) &&
        (!Number.isFinite(eventType) || eventType === 1);
    })
    .map((record) => ({
      timestamp: apolloEpochSeconds(record.Timestamp),
      status: text(record, "NewDriverStatus"),
    }))
    .filter((event): event is { timestamp: number; status: string } =>
      event.timestamp !== null && Boolean(event.status)
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  let currentStatus = "OFF";
  let cursor = start;
  let dutySeconds = 0;

  for (const event of events) {
    if (event.timestamp <= start) {
      currentStatus = event.status;
      continue;
    }
    if (event.timestamp >= end) break;
    if (isCycleDutyStatus(currentStatus)) dutySeconds += event.timestamp - cursor;
    currentStatus = event.status;
    cursor = event.timestamp;
  }
  if (isCycleDutyStatus(currentStatus)) dutySeconds += end - cursor;

  const fallingOffMinutes = Math.max(0, Math.round(dutySeconds / 60));
  return {
    minutes: Math.min(config.limitMinutes, clock.remaining + fallingOffMinutes),
    fallingOffMinutes,
    fallingOffDate,
    ruleSetId: config.ruleSetId,
    timeZone,
  };
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
    const provider = String(connection.provider || "").toLowerCase();
    if (provider !== "nextfleet" && provider !== "apollo") {
      throw new HttpError(400, "HOS provider is not supported");
    }

    if (req.method === "POST") {
      const { data: existingRows, error: existingError } = await admin
        .from("eld_external_drivers")
        .select("external_id,raw_data")
        .eq("user_id", user.id)
        .eq("connection_id", connectionId);
      if (existingError) throw new HttpError(500, existingError.message);
      const existing = new Map((existingRows || []).map((row) => [String(row.external_id), row.raw_data || {}]));

      const apiKey = await decrypt(connection.credential_ciphertext, connection.credential_iv);
      const profiles = provider === "apollo"
        ? await fetchApolloHos(apiKey)
        : await fetchOfficialHos(apiKey);
      const apolloDriverRecords = provider === "apollo"
        ? await fetchApolloDriverRecords(apiKey)
        : [];
      const latestApolloRecords = latestApolloRecordByDriver(apolloDriverRecords);
      const apolloDriverProfiles = provider === "apollo"
        ? await fetchApolloDriverProfiles(apiKey)
        : [];
      const apolloDriverProfilesById = new Map(
        apolloDriverProfiles.map((profile) => [text(profile, "HOSDriverId"), profile]),
      );
      const now = new Date().toISOString();
      const normalized = profiles.map((item, index) => {
        const externalId = provider === "apollo"
          ? text(item, "HOSDriverId", "HOSUserName") || `apollo-hos-driver-${index}`
          : text(item, "id", "driverId") || `hos-driver-${index}`;
        const priorRaw = existing.get(externalId);
        if (provider === "apollo") {
          const latestRecord = latestApolloRecords.get(externalId);
          const driverProfile = apolloDriverProfilesById.get(externalId);
          const cycleTomorrow = apolloCycleTomorrow(
            item,
            externalId,
            apolloDriverRecords,
            driverProfile,
          );
          const activityAt = apolloEpochToIso(
            latestRecord?.Timestamp || item.LastUpdateTimestamp,
          );
          return {
            user_id: user.id,
            connection_id: connectionId,
            external_id: externalId,
            driver_name: apolloDriverName(item),
            vehicle_id: latestRecord
              ? text(latestRecord, "TractorNumber", "TractorVin", "ELDId")
              : text(item, "AssetNumber", "VehicleNumber", "UnitNumber"),
            trailer_id: latestRecord ? text(latestRecord, "TrailerNumber") : null,
            duty_status: text(item, "CurrentDutyStatus"),
            break_minutes: apolloBreakMinutes(item.Next30BreakTimestamp),
            drive_minutes: apolloClockMinutes(item.DrivingString),
            shift_minutes: apolloClockMinutes(item.OnDutyString),
            cycle_minutes: apolloClockMinutes(item.OnDutyWeekString),
            cycle_tomorrow_minutes: cycleTomorrow?.minutes ?? null,
            last_hos_sync: activityAt || text(item, "LastUpdateTimestamp"),
            last_activity_at: activityAt,
            hos_synced_at: now,
            synced_at: now,
            raw_data: {
              ...(priorRaw && typeof priorRaw === "object" ? priorRaw : {}),
              ...sanitizeApolloRecord(item),
              ...(latestRecord
                ? { LatestDriverRecord: sanitizeApolloRecord(latestRecord) }
                : {}),
              ...(cycleTomorrow
                ? { CycleTomorrowCalculation: cycleTomorrow }
                : {}),
            },
          };
        }
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
