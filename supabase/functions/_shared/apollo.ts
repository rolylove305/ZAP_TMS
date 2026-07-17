const APOLLO_HOST = "content.eldroadmap.com";
const APOLLO_PORT = 9103;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Apollo request timed out")), milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function joinBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function findCrlf(bytes: Uint8Array, start = 0): number {
  for (let index = start; index + 1 < bytes.byteLength; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10) return index;
  }
  return -1;
}

function findHeaderEnd(bytes: Uint8Array): number {
  for (let index = 0; index + 3 < bytes.byteLength; index += 1) {
    if (
      bytes[index] === 13 &&
      bytes[index + 1] === 10 &&
      bytes[index + 2] === 13 &&
      bytes[index + 3] === 10
    ) return index;
  }
  return -1;
}

function decodeChunkedBody(body: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let cursor = 0;
  while (cursor < body.byteLength) {
    const lineEnd = findCrlf(body, cursor);
    if (lineEnd < 0) throw new Error("Invalid Apollo chunked response");
    const sizeText = decoder.decode(body.subarray(cursor, lineEnd)).split(";", 1)[0].trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size < 0) throw new Error("Invalid Apollo chunk size");
    cursor = lineEnd + 2;
    if (size === 0) break;
    if (cursor + size > body.byteLength) throw new Error("Incomplete Apollo response");
    chunks.push(body.slice(cursor, cursor + size));
    cursor += size;
    if (body[cursor] !== 13 || body[cursor + 1] !== 10) {
      throw new Error("Invalid Apollo chunk delimiter");
    }
    cursor += 2;
  }
  return joinBytes(chunks);
}

async function writeAll(connection: Deno.TlsConn, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = await withTimeout(connection.write(bytes.subarray(offset)), 15_000);
    if (written <= 0) throw new Error("Apollo connection closed while sending");
    offset += written;
  }
}

async function apolloTransport(path: string, requestBody: string): Promise<{ status: number; raw: string }> {
  let connection: Deno.TlsConn | null = null;
  try {
    connection = await withTimeout(
      Deno.connectTls({ hostname: APOLLO_HOST, port: APOLLO_PORT }),
      15_000,
    );

    const bodyBytes = encoder.encode(requestBody);
    const requestHeaders = [
      `GET ${path} HTTP/1.1`,
      `Host: ${APOLLO_HOST}:${APOLLO_PORT}`,
      "Accept: application/json",
      "Content-Type: application/json; charset=utf-8",
      `Content-Length: ${bodyBytes.byteLength}`,
      "Cache-Control: no-store",
      "Connection: close",
      "",
      "",
    ].join("\r\n");

    await writeAll(connection, encoder.encode(requestHeaders));
    await writeAll(connection, bodyBytes);

    const chunks: Uint8Array[] = [];
    const buffer = new Uint8Array(16_384);
    while (true) {
      const count = await withTimeout(connection.read(buffer), 15_000);
      if (count === null) break;
      chunks.push(buffer.slice(0, count));
    }

    const responseBytes = joinBytes(chunks);
    const headerEnd = findHeaderEnd(responseBytes);
    if (headerEnd < 0) throw new Error("Invalid Apollo HTTP response");
    const headerText = decoder.decode(responseBytes.subarray(0, headerEnd));
    const headerLines = headerText.split("\r\n");
    const statusMatch = headerLines[0]?.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
    if (!statusMatch) throw new Error("Invalid Apollo HTTP status");

    const headers = new Map<string, string>();
    for (const line of headerLines.slice(1)) {
      const separator = line.indexOf(":");
      if (separator > 0) {
        headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
      }
    }

    let responseBody = responseBytes.slice(headerEnd + 4);
    if (headers.get("transfer-encoding")?.toLowerCase().includes("chunked")) {
      responseBody = decodeChunkedBody(responseBody);
    }
    return { status: Number(statusMatch[1]), raw: decoder.decode(responseBody) };
  } catch (error) {
    if (error instanceof ApolloApiError) throw error;
    const timedOut = error instanceof Error && error.message.includes("timed out");
    throw new ApolloApiError(
      timedOut ? 504 : 502,
      timedOut ? "Apollo ELD API timed out" : "Could not reach Apollo ELD API",
    );
  } finally {
    try {
      connection?.close();
    } catch {
      // The connection may already be closed by the server.
    }
  }
}


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
  const { status, raw } = await apolloTransport(path, requestBody);
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
