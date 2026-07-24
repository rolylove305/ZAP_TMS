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
