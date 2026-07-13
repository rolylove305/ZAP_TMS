import {
  createClient,
  type User,
} from "npm:@supabase/supabase-js@2.95.0";

import {
  corsHeaders,
} from "npm:@supabase/supabase-js@2.95.0/cors";

const STORAGE_BUCKET = "load-documents";
const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Modelo estable actual.
// Puede cambiarse sin modificar código usando el secret GEMINI_MODEL.
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

const RETRYABLE_GEMINI_STATUSES = new Set([
  429,
  500,
  502,
  503,
  504,
]);

class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

type EnvConfig = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  geminiApiKey: string;
  geminiModel: string;
};

const responseSchema = {
  type: "OBJECT",

  propertyOrdering: [
    "broker",
    "loadNumber",
    "rate",
    "equipment",
    "miles",
    "pickup",
    "pickupAddress",
    "pickupDate",
    "pickupTime",
    "pickupNumber",
    "delivery",
    "deliveryAddress",
    "deliveryDate",
    "deliveryTime",
    "deliveryNumber",
    "notes",
    "stops",
    "broker_details",
    "_meta",
  ],

  properties: {
    broker: {
      type: "STRING",
    },

    loadNumber: {
      type: "STRING",
    },

    rate: {
      type: "NUMBER",
    },

    equipment: {
      type: "STRING",
    },

    miles: {
      type: "NUMBER",
    },

    pickup: {
      type: "STRING",
    },

    pickupAddress: {
      type: "STRING",
    },

    pickupDate: {
      type: "STRING",
    },

    pickupTime: {
      type: "STRING",
    },

    pickupNumber: {
      type: "STRING",
    },

    delivery: {
      type: "STRING",
    },

    deliveryAddress: {
      type: "STRING",
    },

    deliveryDate: {
      type: "STRING",
    },

    deliveryTime: {
      type: "STRING",
    },

    deliveryNumber: {
      type: "STRING",
    },

    notes: {
      type: "STRING",
    },

    stops: {
      type: "ARRAY",

      items: {
        type: "OBJECT",

        propertyOrdering: [
          "address",
          "num",
          "time",
          "date",
        ],

        properties: {
          address: {
            type: "STRING",
          },

          num: {
            type: "STRING",
          },

          time: {
            type: "STRING",
          },

          date: {
            type: "STRING",
          },
        },

        required: [
          "address",
          "num",
          "time",
          "date",
        ],
      },
    },

    _meta: {
      type: "OBJECT",

      propertyOrdering: [
        "confidence",
        "needsReview",
      ],

      properties: {
        confidence: {
          type: "NUMBER",
        },

        needsReview: {
          type: "BOOLEAN",
        },
      },

      required: [
        "confidence",
        "needsReview",
      ],
    },

    broker_details: {
      type: "OBJECT",

      propertyOrdering: [
        "company",
        "contact",
        "phone",
        "email",
      ],

      properties: {
        company: {
          type: "STRING",
        },

        contact: {
          type: "STRING",
        },

        phone: {
          type: "STRING",
        },

        email: {
          type: "STRING",
        },
      },

      required: [
        "company",
        "contact",
        "phone",
        "email",
      ],
    },
  },

  required: [
    "broker",
    "loadNumber",
    "rate",
    "equipment",
    "miles",
    "pickup",
    "pickupAddress",
    "pickupDate",
    "pickupTime",
    "pickupNumber",
    "delivery",
    "deliveryAddress",
    "deliveryDate",
    "deliveryTime",
    "deliveryNumber",
    "notes",
    "stops",
    "broker_details",
    "_meta",
  ],
} as const;

const extractionPrompt = `
You are extracting information from a trucking Rate Confirmation PDF
for a Transportation Management System.

Return only the JSON object required by the response schema.

Rules:

- Do not invent information.
- Use an empty string for an unknown string value.
- Use 0 for an unknown numeric value.
- rate must be the total agreed carrier/load rate.
- rate must not contain dollar signs or commas.
- miles must be the loaded miles shown in the document.
- Use 0 when miles are not provided.
- pickup and delivery should be concise city/state labels.
- pickupAddress and deliveryAddress must contain the complete facility
  address when available.
- pickupDate, deliveryDate, and every stop date must use YYYY-MM-DD.
- pickupTime, deliveryTime, and every stop time must use 24-hour HH:MM.
- Use an empty string when an exact appointment time is not provided.
- pickupNumber should contain the pickup, PU, PO, or reference number
  associated with pickup.
- deliveryNumber should contain the delivery, PO, or reference number
  associated with delivery.
- stops must contain only intermediate stops.
- Do not include the primary pickup or final delivery inside stops.
- notes should include important instructions, accessorial rules,
  detention rules, temperature requirements, tracking requirements,
  appointment warnings, or special handling instructions.
- _meta.confidence must be between 0 and 1.
- _meta.needsReview must be true when a critical value is missing,
  ambiguous, inconsistent, or confidence is below 0.85.
- broker_details.company is the brokerage company issuing the Rate
  Confirmation (not the shipper or consignee).
- broker_details.contact, phone, and email are the broker agent's name,
  phone number, and email address.
- Use an empty string for any broker detail that is not present.
`.trim();

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  throw new AppError(
    500,
    `Missing required server secret: ${names.join(" or ")}`,
  );
}

function getConfig(): EnvConfig {
  return {
    supabaseUrl: envValue("SUPABASE_URL"),

    publishableKey: envValue(
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
    ),

    serviceRoleKey: envValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
    ),

    geminiApiKey: envValue("GEMINI_API_KEY"),

    geminiModel:
      Deno.env.get("GEMINI_MODEL")?.trim() ||
      DEFAULT_GEMINI_MODEL,
  };
}

function buildCorsHeaders(): Record<string, string> {
  return {
    ...corsHeaders,

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Max-Age":
      "86400",
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,

      headers: {
        ...buildCorsHeaders(),

        "Content-Type":
          "application/json; charset=utf-8",

        ...extraHeaders,
      },
    },
  );
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function stringValue(
  value: unknown,
): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function numberValue(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(
      value.replace(/[$,\s]/g, ""),
    );

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function booleanValue(
  value: unknown,
): boolean {
  return value === true || value === "true";
}

function isIsoDate(
  value: string,
): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function is24HourTime(
  value: string,
): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(
    value,
  );
}

function normalizeResult(
  value: unknown,
) {
  const raw = asRecord(value);

  const rawMeta = asRecord(
    raw["_meta"],
  );

  const rawBroker = asRecord(
    raw["broker_details"],
  );

  const rawStops = Array.isArray(
      raw["stops"],
    )
    ? raw["stops"]
    : [];

  const stops = rawStops.map(
    (stop) => {
      const item = asRecord(stop);

      return {
        address: stringValue(
          item["address"],
        ),

        num: stringValue(
          item["num"],
        ),

        time: stringValue(
          item["time"],
        ),

        date: stringValue(
          item["date"],
        ),
      };
    },
  );

  const result = {
    broker:
      stringValue(raw["broker"]),

    loadNumber:
      stringValue(raw["loadNumber"]),

    rate:
      Math.max(
        0,
        numberValue(raw["rate"]),
      ),

    equipment:
      stringValue(raw["equipment"]),

    miles:
      Math.max(
        0,
        numberValue(raw["miles"]),
      ),

    pickup:
      stringValue(raw["pickup"]),

    pickupAddress:
      stringValue(raw["pickupAddress"]),

    pickupDate:
      stringValue(raw["pickupDate"]),

    pickupTime:
      stringValue(raw["pickupTime"]),

    pickupNumber:
      stringValue(raw["pickupNumber"]),

    delivery:
      stringValue(raw["delivery"]),

    deliveryAddress:
      stringValue(raw["deliveryAddress"]),

    deliveryDate:
      stringValue(raw["deliveryDate"]),

    deliveryTime:
      stringValue(raw["deliveryTime"]),

    deliveryNumber:
      stringValue(raw["deliveryNumber"]),

    notes:
      stringValue(raw["notes"]),

    stops,

    _meta: {
      confidence:
        Math.min(
          1,
          Math.max(
            0,
            numberValue(
              rawMeta["confidence"],
            ),
          ),
        ),

      needsReview:
        booleanValue(
          rawMeta["needsReview"],
        ),
    },

    broker_details: {
      company:
        stringValue(rawBroker["company"]),

      contact:
        stringValue(rawBroker["contact"]),

      phone:
        stringValue(rawBroker["phone"]),

      email:
        stringValue(rawBroker["email"]),
    },
  };

  const criticalMissing =
    !result.broker ||
    !result.loadNumber ||
    result.rate <= 0 ||
    !result.pickup ||
    !result.pickupAddress ||
    !result.pickupDate ||
    !result.delivery ||
    !result.deliveryAddress ||
    !result.deliveryDate;

  const invalidFormats =
    (
      !!result.pickupDate &&
      !isIsoDate(result.pickupDate)
    ) ||
    (
      !!result.deliveryDate &&
      !isIsoDate(result.deliveryDate)
    ) ||
    (
      !!result.pickupTime &&
      !is24HourTime(result.pickupTime)
    ) ||
    (
      !!result.deliveryTime &&
      !is24HourTime(
        result.deliveryTime,
      )
    ) ||
    result.stops.some(
      (stop) =>
        (
          !!stop.date &&
          !isIsoDate(stop.date)
        ) ||
        (
          !!stop.time &&
          !is24HourTime(stop.time)
        ),
    );

  result._meta.needsReview =
    result._meta.needsReview ||
    result._meta.confidence < 0.85 ||
    criticalMissing ||
    invalidFormats;

  return result;
}

function bytesToBase64(
  bytes: Uint8Array,
): string {
  let binary = "";

  const chunkSize = 0x8000;

  for (
    let index = 0;
    index < bytes.length;
    index += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        index,
        index + chunkSize,
      ),
    );
  }

  return btoa(binary);
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, milliseconds),
  );
}

async function authenticateUser(
  req: Request,
  config: EnvConfig,
): Promise<User> {
  const authorization =
    req.headers
      .get("Authorization")
      ?.trim() || "";

  const match =
    /^Bearer\s+(.+)$/i.exec(
      authorization,
    );

  if (!match?.[1]) {
    throw new AppError(
      401,
      "Missing Authorization bearer token.",
    );
  }

  const authClient = createClient(
    config.supabaseUrl,
    config.publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const {
    data,
    error,
  } = await authClient.auth.getUser(
    match[1],
  );

  if (error || !data.user) {
    throw new AppError(
      401,
      "Invalid or expired Supabase session.",
    );
  }

  return data.user;
}

function normalizeStoragePath(
  value: unknown,
  userId: string,
): string {
  const storagePath =
    stringValue(value).replace(
      /^\/+/,
      "",
    );

  if (!storagePath) {
    throw new AppError(
      400,
      "storage_path is required.",
    );
  }

  if (
    storagePath.includes("..") ||
    storagePath.includes("\\")
  ) {
    throw new AppError(
      400,
      "Invalid storage_path.",
    );
  }

  /*
   * El frontend guarda los archivos así:
   * userId/loadId/timestamp_filename.pdf
   *
   * Esta validación evita que un usuario
   * trate de leer documentos de otro usuario
   * mediante la Service Role Key.
   */
  if (
    !storagePath.startsWith(
      `${userId}/`,
    )
  ) {
    throw new AppError(
      403,
      "You cannot access another user's document.",
    );
  }

  return storagePath;
}

async function callGemini(
  config: EnvConfig,
  pdfBase64: string,
): Promise<Record<string, unknown>> {
  const endpoint =
    "https://generativelanguage.googleapis.com/" +
    `v1beta/models/${encodeURIComponent(config.geminiModel)}` +
    `:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;

  const requestBody = {
    contents: [
      {
        role: "user",

        parts: [
          {
            text: extractionPrompt,
          },

          {
            inlineData: {
              mimeType:
                "application/pdf",

              data:
                pdfBase64,
            },
          },
        ],
      },
    ],

    generationConfig: {
      temperature: 0,

      maxOutputTokens: 4096,

      // La extracción es una tarea de salida estructurada, no de razonamiento.
      // Desactivar el "thinking" hace que Gemini responda mucho más rápido y
      // evita que la Edge Function exceda su límite de tiempo (error 546 WORKER_LIMIT).
      thinkingConfig: {
        thinkingBudget: 0,
      },

      responseMimeType:
        "application/json",

      responseSchema,
    },
  };

  // Presupuesto de tiempo acotado: cada llamada se corta a los 40s y hacemos
  // como máximo 2 intentos. Así el tiempo total (2×40s + backoff) siempre cabe
  // bajo el límite de la Edge Function y nunca volvemos a morir por 546.
  const PER_CALL_TIMEOUT_MS = 40000;
  const MAX_ATTEMPTS = 2;

  let lastStatus = 502;
  let lastMessage =
    "Gemini request failed.";

  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS;
    attempt += 1
  ) {
    let response: Response;

    try {
      response = await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(requestBody),

          // AbortSignal.timeout aborta el fetch si Gemini se cuelga o va lento,
          // en vez de dejar el worker esperando hasta que la plataforma lo mate.
          signal:
            AbortSignal.timeout(
              PER_CALL_TIMEOUT_MS,
            ),
        },
      );
    } catch (fetchErr) {
      // Timeout (AbortSignal) o fallo de red: reintento acotado, nunca cuelga.
      lastStatus = 504;
      lastMessage =
        (fetchErr as Error)?.name ===
          "TimeoutError"
          ? "The document took too long for the AI to read. Please try again."
          : `Network error contacting the AI: ${
            (fetchErr as Error)?.message ??
              String(fetchErr)
          }`;

      if (attempt === MAX_ATTEMPTS - 1) {
        break;
      }

      await sleep(
        600 * (2 ** attempt),
      );
      continue;
    }

    const responseText =
      await response.text();

    if (response.ok) {
      try {
        return JSON.parse(
          responseText,
        ) as Record<string, unknown>;
      } catch {
        throw new AppError(
          502,
          "Gemini returned an unreadable response envelope.",
        );
      }
    }

    lastStatus = response.status;

    try {
      const errorPayload =
        asRecord(
          JSON.parse(responseText),
        );

      const nestedError =
        asRecord(
          errorPayload["error"],
        );

      lastMessage =
        stringValue(
          nestedError["message"],
        ) ||
        responseText.slice(0, 800);
    } catch {
      lastMessage =
        responseText.slice(0, 800) ||
        `HTTP ${response.status}`;
    }

    // 429 (cuota) no se recupera dentro de la misma petición: reintentarlo solo
    // quema el reloj (era una de las causas del 546). Fallamos rápido y el
    // frontend muestra el mensaje amigable de "AI limit reached".
    const shouldRetry =
      RETRYABLE_GEMINI_STATUSES.has(
        response.status,
      ) &&
      response.status !== 429;

    if (
      !shouldRetry ||
      attempt === MAX_ATTEMPTS - 1
    ) {
      break;
    }

    await sleep(
      600 * (2 ** attempt),
    );
  }

  throw new AppError(
    lastStatus,
    `Gemini API error: ${lastMessage}`,
  );
}

function extractGeminiJson(
  envelope: Record<string, unknown>,
): unknown {
  const candidates =
    Array.isArray(
        envelope["candidates"],
      )
      ? envelope["candidates"]
      : [];

  const firstCandidate =
    asRecord(candidates[0]);

  const content =
    asRecord(
      firstCandidate["content"],
    );

  const parts =
    Array.isArray(
        content["parts"],
      )
      ? content["parts"]
      : [];

  const text = parts
    .map(
      (part) =>
        stringValue(
          asRecord(part)["text"],
        ),
    )
    .filter(Boolean)
    .join("")
    .trim();

  if (!text) {
    const promptFeedback =
      asRecord(
        envelope["promptFeedback"],
      );

    const reason =
      stringValue(
        promptFeedback["blockReason"],
      ) ||
      stringValue(
        firstCandidate["finishReason"],
      ) ||
      "No candidate text returned";

    throw new AppError(
      502,
      `Gemini did not return structured data: ${reason}.`,
    );
  }

  /*
   * responseMimeType debería evitar Markdown.
   * Esto solamente protege contra respuestas
   * inesperadas de la API.
   */
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AppError(
      502,
      "Gemini returned invalid JSON despite structured-output mode.",
    );
  }
}

Deno.serve(
  async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(
        null,
        {
          status: 204,

          headers:
            buildCorsHeaders(),
        },
      );
    }

    try {
      if (
        req.method !== "GET" &&
        req.method !== "POST"
      ) {
        return jsonResponse(
          {
            error:
              "Method not allowed. Use GET, POST, or OPTIONS.",
          },
          405,
          {
            Allow:
              "GET, POST, OPTIONS",
          },
        );
      }

      const config = getConfig();

      /*
       * Valida el JWT real del usuario.
       * No confía solamente en que exista
       * un Authorization header.
       */
      const user =
        await authenticateUser(
          req,
          config,
        );

      /*
       * GET autenticado para comprobar
       * que la función está funcionando.
       */
      if (req.method === "GET") {
        return jsonResponse({
          ok: true,

          model:
            config.geminiModel,

          userId:
            user.id,
        });
      }

      let requestBody:
        Record<string, unknown>;

      try {
        requestBody = asRecord(
          await req.json(),
        );
      } catch {
        throw new AppError(
          400,
          "Request body must be valid JSON.",
        );
      }

      const storagePath =
        normalizeStoragePath(
          requestBody["storage_path"],
          user.id,
        );

      /*
       * La Service Role Key se utiliza únicamente
       * en el servidor. Nunca se envía al frontend.
       */
      const admin = createClient(
        config.supabaseUrl,
        config.serviceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );

      /*
       * Verifica que el storage_path corresponda
       * a un documento registrado por este usuario.
       */
      const {
        data: documentRow,
        error: documentError,
      } = await admin
        .from("load_documents")
        .select("id")
        .eq("user_id", user.id)
        .eq(
          "storage_bucket",
          STORAGE_BUCKET,
        )
        .eq(
          "storage_path",
          storagePath,
        )
        .maybeSingle();

      if (documentError) {
        console.error(
          "load_documents lookup failed",
          documentError,
        );

        throw new AppError(
          500,
          "Unable to verify the uploaded document.",
        );
      }

      if (!documentRow) {
        throw new AppError(
          404,
          "Document record not found.",
        );
      }

      const {
        data: pdfBlob,
        error: downloadError,
      } = await admin.storage
        .from(STORAGE_BUCKET)
        .download(storagePath);

      if (
        downloadError ||
        !pdfBlob
      ) {
        console.error(
          "Storage download failed",
          downloadError,
        );

        throw new AppError(
          404,
          "PDF could not be downloaded from Storage.",
        );
      }

      const mimeType =
        (pdfBlob.type || "")
          .split(";")[0]
          .toLowerCase();

      const looksLikePdf =
        mimeType ===
          "application/pdf" ||
        storagePath
          .toLowerCase()
          .endsWith(".pdf");

      if (!looksLikePdf) {
        throw new AppError(
          415,
          "The selected Rate Confirmation must be a PDF.",
        );
      }

      if (pdfBlob.size <= 0) {
        throw new AppError(
          400,
          "The uploaded PDF is empty.",
        );
      }

      if (
        pdfBlob.size >
        MAX_PDF_BYTES
      ) {
        throw new AppError(
          413,
          "The PDF exceeds the 10 MB limit.",
        );
      }

      const pdfBytes =
        new Uint8Array(
          await pdfBlob.arrayBuffer(),
        );

      const pdfBase64 =
        bytesToBase64(pdfBytes);

      const geminiEnvelope =
        await callGemini(
          config,
          pdfBase64,
        );

      const rawExtractedData =
        extractGeminiJson(
          geminiEnvelope,
        );

      const extractedData =
        normalizeResult(
          rawExtractedData,
        );

      /*
       * Devuelve directamente el objeto esperado
       * por app.js, no lo envuelve en { data: ... }.
       */
      return jsonResponse(
        extractedData,
      );
    } catch (error) {
      const status =
        error instanceof AppError
          ? error.status
          : 500;

      const message =
        error instanceof AppError
          ? error.message
          : "Unexpected server error.";

      console.error(
        "parse-ratecon error",
        error,
      );

      return jsonResponse(
        {
          error: message,
        },
        status,
      );
    }
  },
);