const APOLLO_BASE_URL = "https://content.eldroadmap.com:9103";

export class ApolloApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function messageFrom(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Apollo rejected the request";
  const item = payload as Record<string, unknown>;
  for (const key of ["message", "Message", "error", "Error", "description", "Description"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
  }
  return "Apollo rejected the request";
}

export async function apolloRequest(
  apiKey: string,
  path: string,
  parameters: Record<string, unknown> = {},
): Promise<unknown> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...parameters, HOSClientApiKey: apiKey })) {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  }
  const response = await fetch(`${APOLLO_BASE_URL}${path}?${query.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json", "Cache-Control": "no-store" },
  });

  const raw = await response.text();
  let payload: unknown = raw;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    // Keep the text only long enough to return a safe generic error below.
  }

  const safeMessage = messageFrom(payload).replaceAll(apiKey, "[redacted]");
  if (!response.ok) {
    throw new ApolloApiError(
      response.status,
      `Apollo ELD API error ${response.status}: ${safeMessage}`,
    );
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const item = payload as Record<string, unknown>;
    const code = item.code ?? item.Code;
    if (code !== undefined && Number(code) !== 1) {
      throw new ApolloApiError(502, `Apollo ELD API error: ${safeMessage}`);
    }
  }

  return payload;
}

export function apolloRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["data", "Data", "items", "Items", "results", "Results"]) {
    if (Array.isArray(obj[key])) return apolloRows(obj[key]);
  }
  return [];
}

export function apolloDriverName(item: Record<string, unknown>): string {
  const first = String(item.DriverName ?? item.Name ?? "").trim();
  const last = String(item.DriverLastName ?? item.LastName ?? "").trim();
  return `${first} ${last}`.trim() || String(item.HOSUserName ?? "").trim();
}

export function apolloClockMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const remaining = raw.includes("/") ? raw.split("/").pop() || "" : raw;
  const match = remaining.trim().match(/^(\d+):(\d{1,2})$/);
  if (!match) return Number.isFinite(Number(remaining)) ? Math.max(0, Math.trunc(Number(remaining))) : null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function apolloTimestampMillis(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  const dotNetMatch = raw.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  let millis = typeof value === "number"
    ? value
    : dotNetMatch
    ? Number(dotNetMatch[1])
    : Number(raw);
  if (!Number.isFinite(millis) && raw) millis = Date.parse(raw);
  if (!Number.isFinite(millis) || millis <= 0) return null;
  if (millis < 1_000_000_000_000) millis *= 1000;
  return millis;
}

export function apolloEpochToIso(value: unknown): string | null {
  const millis = apolloTimestampMillis(value);
  if (millis === null) return null;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function apolloBreakMinutes(value: unknown): number | null {
  const millis = apolloTimestampMillis(value);
  if (millis === null) return null;
  return Math.max(0, Math.ceil((millis - Date.now()) / 60_000));
}

export function sanitizeApolloRecord(item: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "HOSClientApiKey",
    "HOSPassword",
    "Password",
    "password",
    "apiKey",
    "ApiKey",
  ]);
  return Object.fromEntries(Object.entries(item).filter(([key]) => !blocked.has(key)));
}
