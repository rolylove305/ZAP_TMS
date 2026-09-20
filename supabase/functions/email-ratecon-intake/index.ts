import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";

/*
 * Receives Rate Con PDFs forwarded by email. The actual mail parsing (MIME,
 * attachment extraction) happens in a Cloudflare Email Worker, which POSTs
 * here with the recipient address and each attachment as base64. This
 * function:
 *   1. Verifies the shared secret (only our own Worker knows it).
 *   2. Resolves the recipient's inbox code (the local part of the "to"
 *      address) back to a user via profiles.ratecon_inbox_code.
 *   3. Uploads each PDF attachment and calls parse-ratecon (using the same
 *      shared-secret path added there) to get AI-extracted, ORS-enriched
 *      fields — reusing that pipeline instead of duplicating it.
 *   4. Matches the carrier by MC/DOT number (or a loose name match) and
 *      creates the load directly, flagged for the dispatcher to review.
 */

class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new AppError(500, `Missing server secret: ${name}`);
  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function safeFileName(name: string): string {
  return (name || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function mcDotTokens(s: unknown): string[] {
  return String(s ?? "").match(/\d{4,8}/g) || [];
}

function nameWords(s: unknown): string[] {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

type Carrier = {
  id: string;
  name: string;
  mc_dot: string | null;
  commission: number | null;
};

function matchCarrier(
  carriers: Carrier[],
  carrierDetails: { company?: string; mc_number?: string; dot_number?: string } | undefined,
): Carrier | null {
  if (!carrierDetails) return null;
  const wantTokens = new Set([
    ...mcDotTokens(carrierDetails.mc_number),
    ...mcDotTokens(carrierDetails.dot_number),
  ]);
  if (wantTokens.size) {
    const byNumber = carriers.find((c) => mcDotTokens(c.mc_dot).some((t) => wantTokens.has(t)));
    if (byNumber) return byNumber;
  }
  const wantWords = nameWords(carrierDetails.company);
  if (wantWords.length) {
    const byName = carriers.find((c) => {
      const haveWords = nameWords(c.name);
      if (!haveWords.length) return false;
      const shared = wantWords.filter((w) => haveWords.includes(w));
      return shared.length >= Math.min(2, wantWords.length, haveWords.length);
    });
    if (byName) return byName;
  }
  return null;
}

type Attachment = { filename?: string; contentType?: string; contentBase64: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      throw new AppError(405, "Method not allowed.");
    }

    const intakeSecret = required("EMAIL_INTAKE_SECRET");
    const providedSecret = req.headers.get("X-Intake-Secret")?.trim();
    if (!providedSecret || providedSecret !== intakeSecret) {
      throw new AppError(401, "Invalid intake secret.");
    }

    const supabaseUrl = required("SUPABASE_URL");
    const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() || "";

    const body = await req.json().catch(() => ({})) as {
      to?: string;
      attachments?: Attachment[];
    };

    const to = String(body.to || "").trim().toLowerCase();
    const code = to.split("@")[0]?.trim();
    if (!code) throw new AppError(400, "Missing or invalid 'to' address.");

    const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
      .filter((a) => a && a.contentBase64 &&
        (/pdf/i.test(a.contentType || "") || /\.pdf$/i.test(a.filename || "")));
    if (!attachments.length) {
      return jsonResponse({ ok: true, skipped: "no PDF attachments found" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,default_organization_id")
      .eq("ratecon_inbox_code", code)
      .maybeSingle();
    if (profileError) throw new AppError(500, profileError.message);
    if (!profile) {
      return jsonResponse({ ok: true, skipped: `no user matches inbox code "${code}"` });
    }

    const userId = profile.id as string;
    const results: Array<Record<string, unknown>> = [];

    for (const attachment of attachments) {
      try {
        const fileName = safeFileName(attachment.filename || "ratecon.pdf");
        const bytes = Uint8Array.from(atob(attachment.contentBase64), (c) => c.charCodeAt(0));
        const path = `${userId}/ratecon-inbox/${Date.now()}_email_${fileName}`;

        const upload = await admin.storage.from("load-documents").upload(path, bytes, {
          contentType: "application/pdf",
        });
        if (upload.error) throw new Error(`Storage upload failed: ${upload.error.message}`);

        const docInsert = await admin
          .from("load_documents")
          .insert({
            user_id: userId,
            load_id: null,
            file_name: `[Rate Confirmation] ${fileName}`,
            file_type: "application/pdf",
            storage_bucket: "load-documents",
            storage_path: path,
            uploaded_by: "email",
          })
          .select("id")
          .single();
        if (docInsert.error) throw new Error(`Could not save document record: ${docInsert.error.message}`);
        const documentId = docInsert.data.id as string;

        const parseRes = await fetch(`${supabaseUrl}/functions/v1/parse-ratecon`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${publishableKey}`,
            "apikey": publishableKey,
            "X-Intake-Secret": intakeSecret,
          },
          body: JSON.stringify({ storage_path: path, user_id: userId }),
        });
        const ai = await parseRes.json().catch(() => null);
        if (!parseRes.ok || !ai || ai.error) {
          throw new Error(ai?.error ? String(ai.error) : "AI could not read this Rate Con.");
        }

        const { data: carriers, error: carriersError } = await admin
          .from("carriers")
          .select("id,name,mc_dot,commission")
          .eq("user_id", userId);
        if (carriersError) throw new Error(carriersError.message);

        const matched = matchCarrier((carriers || []) as Carrier[], ai.carrier_details);
        const carrierName = matched?.name ||
          ai.carrier_details?.company ||
          "UNKNOWN CARRIER - check email";
        const commissionPct = matched ? Number(matched.commission) || 0 : 0;

        const reviewNote = matched
          ? ""
          : "\n\n⚠ Carrier could not be auto-matched — set it manually.";
        const milesNote = ai.milesEstimated
          ? "\n\nℹ Miles were not on the Rate Con — estimated from the addresses."
          : "";

        const loadInsert = await admin
          .from("loads")
          .insert({
            user_id: userId,
            organization_id: profile.default_organization_id || null,
            carrier: carrierName,
            carrier_id: matched?.id || null,
            broker: ai.broker || "",
            pickup: ai.pickup || "",
            delivery: ai.delivery || "",
            pickup_date: ai.pickupDate || null,
            delivery_date: ai.deliveryDate || null,
            pickup_time: ai.pickupTime || null,
            delivery_time: ai.deliveryTime || null,
            pickup_address: ai.pickupAddress || "",
            delivery_address: ai.deliveryAddress || "",
            pickup_number: ai.pickupNumber || "",
            delivery_number: ai.deliveryNumber || "",
            equipment: ai.equipment || "",
            miles: ai.miles || null,
            rate: ai.rate || 0,
            commission_pct: commissionPct,
            load_number: ai.loadNumber || "",
            status: "Booked",
            notes: `📧 Created automatically from an emailed Rate Con — please review.${reviewNote}${milesNote}${
              ai.notes ? `\n\n${ai.notes}` : ""
            }`,
            stops: Array.isArray(ai.stops) ? ai.stops : [],
          })
          .select("id")
          .single();
        if (loadInsert.error) throw new Error(`Load could not be created: ${loadInsert.error.message}`);
        const loadId = loadInsert.data.id as string;

        const link = await admin
          .from("load_documents")
          .update({ load_id: loadId })
          .eq("id", documentId);
        if (link.error) throw new Error(`Document linking failed: ${link.error.message}`);

        results.push({ ok: true, fileName, loadId, carrierMatched: !!matched, milesEstimated: !!ai.milesEstimated });
      } catch (error) {
        results.push({
          ok: false,
          fileName: attachment.filename || "unknown.pdf",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return jsonResponse({ ok: true, userId, results });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error("email-ratecon-intake", { status, message });
    return jsonResponse({ error: message }, status);
  }
});
