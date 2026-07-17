import { request as httpsRequest } from "node:https";

const APOLLO_HOST = "content.eldroadmap.com";
const APOLLO_PORT = 9103;

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
  const requestBody = JSON.stringify({ ...parameters, HOSClientApiKey: apiKey });
  const { status, raw } = await new Promise<{ status: number; raw: string }>((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: APOLLO_HOST,
        port: APOLLO_PORT,
        path,
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(new TextEncoder().encode(requestBody).byteLength),
          "Cache-Control": "no-store",
          Connection: "close",
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += String(chunk);
        });
        response.on("end", () => {
          resolve({ status: response.statusCode ?? 502, raw: responseBody });
        });
        response.on("aborted", () => {
          reject(new ApolloApiError(502, "Apollo ELD API response was interrupted"));
        });
      },
    );

    request.setTimeout(15_000, () => {
      request.destroy(new Error("Apollo request timed out"));
    });
    request.on("error", (error) => {
      reject(
        new ApolloApiError(
          error.message.includes("timed out") ? 504 : 502,
          error.message.includes("timed out")
            ? "Apollo ELD API timed out"
            : "Could not reach Apollo ELD API",
        ),
      );
    });
    request.write(requestBody);
    request.end();
  });
  let payload: unknown = raw;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    // Keep the text only long enough to return a safe generic error below.
  }

  const safeMessage = messageFrom(payload).replaceAll(apiKey, "[redacted]");
  if (status < 200 || status >= 300) {
    throw new ApolloApiError(
      status,
      `Apollo ELD API error ${status}: ${safeMessage}`,
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
