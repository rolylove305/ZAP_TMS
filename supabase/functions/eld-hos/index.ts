import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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

function value(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const current = raw[key];
    if (typeof current === "string" && current.trim()) return current.trim();
    if (typeof current === "number") return String(current);
  }
  return null;
}

function numberValue(raw: Record<string, unknown>, key: string) {
  const current = raw[key];
  const parsed = typeof current === "number" ? current : Number(current);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalize(row: Record<string, unknown>) {
  const raw = row.raw_data && typeof row.raw_data === "object"
    ? row.raw_data as Record<string, unknown>
    : {};

  return {
    external_id: row.external_id,
    driver_name: row.driver_name || value(raw, "driverName", "name"),
    phone: row.phone || value(raw, "phoneNum", "phone"),
    vehicle_id: row.vehicle_id || value(raw, "vehicleId"),
    trailer_id: row.trailer_id || value(raw, "trailerName", "trailerId"),
    duty_status: row.duty_status || value(raw, "dutyStatus"),
    duty_status_duration: row.duty_status_duration || value(raw, "dutyStatusDuration"),
    break_minutes: row.break_minutes ?? numberValue(raw, "breakTime"),
    drive_minutes: row.drive_minutes ?? numberValue(raw, "driveTime"),
    shift_minutes: row.shift_minutes ?? numberValue(raw, "shiftTime"),
    cycle_minutes: row.cycle_minutes ?? numberValue(raw, "cycleTime"),
    cycle_tomorrow_minutes: row.cycle_tomorrow_minutes ?? numberValue(raw, "cycleTomorrowTime"),
    last_hos_sync: row.last_hos_sync || value(raw, "lastHosSync", "lastSync"),
    last_activity_at: row.last_activity_at || null,
    hos_synced_at: row.hos_synced_at || null,
    cycle_rule: value(raw, "cycleRule"),
  };
}

const warning =
  "Next Fleet accepted the API key for drivers and devices, but its web-only HOS endpoint requires a Next Fleet portal session and returns 401 to API-key requests. Live HOS clocks require an official HOS API endpoint or permission from Next Fleet.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    const { user, admin } = await userAndAdmin(req);
    const url = new URL(req.url);
    const body = req.method === "POST"
      ? await req.json().catch(() => ({})) as Record<string, unknown>
      : {};
    const connectionId = req.method === "POST"
      ? String(body.connection_id || "")
      : String(url.searchParams.get("connection_id") || "");

    if (!connectionId) throw new HttpError(400, "connection_id is required");
    if (req.method !== "GET" && req.method !== "POST") throw new HttpError(405, "Method not allowed");

    const { data: connection, error: connectionError } = await admin
      .from("eld_connections")
      .select("id,provider")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();
    if (connectionError || !connection) throw new HttpError(404, "ELD connection not found");

    const { data, error } = await admin
      .from("eld_external_drivers")
      .select("external_id,driver_name,phone,vehicle_id,trailer_id,duty_status,duty_status_duration,break_minutes,drive_minutes,shift_minutes,cycle_minutes,cycle_tomorrow_minutes,last_hos_sync,last_activity_at,hos_synced_at,raw_data")
      .eq("user_id", user.id)
      .eq("connection_id", connectionId)
      .order("driver_name");
    if (error) throw new HttpError(500, error.message);

    const drivers = (data || []).map((row) => normalize(row as Record<string, unknown>));
    const hasLiveClocks = drivers.some((driver) =>
      driver.break_minutes !== null ||
      driver.drive_minutes !== null ||
      driver.shift_minutes !== null ||
      driver.cycle_minutes !== null ||
      driver.cycle_tomorrow_minutes !== null
    );

    return reply({
      drivers,
      hos_api_available: hasLiveClocks,
      warning: hasLiveClocks ? null : warning,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected HOS error";
    console.error("eld-hos", { status, message });
    return reply({ error: message }, status);
  }
});
