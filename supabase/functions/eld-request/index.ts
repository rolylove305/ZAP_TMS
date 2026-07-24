import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function tokenFromRequest(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    throw new Error("Missing Authorization bearer token");
  }
  return auth.slice(7).trim();
}

function serviceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] as string)
  );
}

/*
 * Email notification via Resend. Best-effort: if RESEND_API_KEY is not set
 * or the send fails, the request is still saved — we only log the problem.
 * With the sandbox sender (onboarding@resend.dev) Resend only delivers to
 * the email that owns the Resend account; verify the zapdispatch.com domain
 * in Resend to use ELD_NOTIFY_FROM=notifications@zapdispatch.com and any TO.
 */
async function notifyAdmin(request: {
  eld_name: string;
  eld_website: string | null;
  api_documentation: string | null;
  notes: string | null;
  company_id: string;
  id: string;
}, requesterEmail: string | undefined): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.log("RESEND_API_KEY not set; skipping email notification");
    return;
  }

  const to = Deno.env.get("ELD_NOTIFY_TO") || "rytransport.llc@gmail.com";
  const from = Deno.env.get("ELD_NOTIFY_FROM") || "ZAP Dispatch <onboarding@resend.dev>";

  const rows: Array<[string, string]> = [
    ["ELD", request.eld_name],
    ["Requested by", requesterEmail || "unknown"],
    ["Company", request.company_id],
    ["Website", request.eld_website || "—"],
    ["API docs", request.api_documentation || "—"],
    ["Notes", request.notes || "—"],
    ["Request ID", request.id],
  ];

  const html =
    `<h2>New ELD integration request</h2><table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, v]) =>
      `<tr><td style="font-weight:bold;border:1px solid #ddd">${escapeHtml(k)}</td>` +
      `<td style="border:1px solid #ddd">${escapeHtml(v)}</td></tr>`
    ).join("") +
    `</table><p>Review it in the local admin dashboard (admin-eld-requests.html).</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `ELD request: ${request.eld_name}`,
      html,
    }),
  });

  if (!res.ok) {
    console.error(`Resend error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  } else {
    console.log(`Notification email sent to ${to}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = tokenFromRequest(req);
    const admin = serviceClient();

    // Get authenticated user
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json() as {
      eld_name: string;
      eld_website?: string;
      api_documentation?: string;
      notes?: string;
      company_id?: string;
    };

    if (!payload.eld_name || payload.eld_name.trim().length === 0) {
      return json({ error: "ELD name is required" }, 400);
    }

    // Insert request into database
    const { data: request, error: insertError } = await admin
      .from("eld_integration_requests")
      .insert({
        user_id: userData.user.id,
        company_id: payload.company_id || "unknown",
        eld_name: payload.eld_name.trim(),
        eld_website: payload.eld_website || null,
        api_documentation: payload.api_documentation || null,
        notes: payload.notes || null,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return json({ error: `Database error: ${insertError.message}` }, 500);
    }

    console.log(`New ELD request: ${payload.eld_name} from ${userData.user.email}`);

    try {
      await notifyAdmin(request, userData.user.email);
    } catch (notifyError) {
      console.error("Email notification failed:", notifyError);
    }

    return json({
      success: true,
      request_id: request.id,
      message: "ELD integration request submitted successfully",
    });
  } catch (error) {
    console.error("Error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
