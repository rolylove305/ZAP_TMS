// supabase/functions/parse-ratecon/index.ts
//
// Reads a Rate Confirmation PDF from Supabase Storage, sends it to Gemini with
// native PDF vision + a strict responseSchema, and returns JSON mapped 1:1 to
// the ZAP-TMS frontend load model (camelCase).
//
// Secrets required (Supabase project -> Edge Functions -> Secrets):
//   GEMINI_API_KEY        (you set this)
//   GEMINI_MODEL          (optional, default "gemini-1.5-pro")
// Auto-injected by Supabase (do NOT set manually):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:  supabase functions deploy parse-ratecon
// (or via the Management API). It is called by app.js after a Rate Con upload.

import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI, SchemaType } from "npm:@google/generative-ai";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-1.5-pro";

const SYSTEM_INSTRUCTION =
  "Eres un extractor de datos experto en logística y transporte en EE.UU. Tu única tarea es " +
  "analizar el documento PDF de confirmación de carga (Rate Confirmation) provisto y extraer la " +
  "información estructurada con precisión milimétrica. Formatea todas las fechas como YYYY-MM-DD y " +
  "las horas como HH:MM en formato de 24h. Si un campo no existe en el documento, devuélvelo como " +
  "un string vacío o null según corresponda. No inventes datos. Pon especial atención a extraer " +
  "correctamente el arreglo de 'stops' secundarios si existen, mapeando sus direcciones completas. " +
  "En _meta.confidence pon un número 0..1 con tu confianza global; en _meta.needsReview pon true " +
  "salvo que estés totalmente seguro de todos los campos monetarios y de fechas.";

// Mapped 1:1 to the frontend load model (camelCase) so it feeds map.loads.toDb directly.
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    broker: { type: SchemaType.STRING },
    loadNumber: { type: SchemaType.STRING },
    rate: { type: SchemaType.NUMBER },
    equipment: { type: SchemaType.STRING },
    miles: { type: SchemaType.NUMBER },
    pickup: { type: SchemaType.STRING },
    pickupAddress: { type: SchemaType.STRING },
    pickupDate: { type: SchemaType.STRING },
    pickupTime: { type: SchemaType.STRING },
    pickupNumber: { type: SchemaType.STRING },
    delivery: { type: SchemaType.STRING },
    deliveryAddress: { type: SchemaType.STRING },
    deliveryDate: { type: SchemaType.STRING },
    deliveryTime: { type: SchemaType.STRING },
    deliveryNumber: { type: SchemaType.STRING },
    notes: { type: SchemaType.STRING },
    stops: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          address: { type: SchemaType.STRING },
          num: { type: SchemaType.STRING },
          time: { type: SchemaType.STRING },
          date: { type: SchemaType.STRING },
        },
        required: ["address"],
      },
    },
    _meta: {
      type: SchemaType.OBJECT,
      properties: {
        confidence: { type: SchemaType.NUMBER },
        needsReview: { type: SchemaType.BOOLEAN },
      },
      required: ["confidence", "needsReview"],
    },
  },
  required: ["broker", "loadNumber", "rate", "pickup", "delivery"],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Verify the caller's JWT and get the user (this is the RLS identity).
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid session" }, 401);

    // 2) Read the storage_path from the body.
    const body = await req.json().catch(() => ({}));
    const storagePath: string | undefined = body?.storage_path;
    if (!storagePath || typeof storagePath !== "string") {
      return json({ error: "storage_path is required" }, 400);
    }
    // Security: the file must live in THIS user's folder ({user_id}/...).
    if (!storagePath.startsWith(user.id + "/")) {
      return json({ error: "Forbidden: path does not belong to you" }, 403);
    }

    // 3) Download the PDF using the service role (bucket is private).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: file, error: dlErr } = await admin
      .storage.from("load-documents").download(storagePath);
    if (dlErr || !file) {
      return json({ error: "Could not read document: " + (dlErr?.message ?? "not found") }, 404);
    }
    const base64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));

    // 4) Ask Gemini to extract the structured load data.
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured (missing GEMINI_API_KEY)" }, 500);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const result = await model.generateContent([
      { inlineData: { mimeType: "application/pdf", data: base64 } },
      { text: "Extract the structured data from the attached Rate Confirmation." },
    ]);

    const text = result.response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "AI returned invalid JSON", raw: text }, 502);
    }

    return json(parsed, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
