import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Missing server secret: ${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Missing authorization.");
  }
  return auth.slice(7).trim();
}

function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = serviceClient();
    const { data: authData, error: authError } = await admin.auth.getUser(bearerToken(req));
    if (authError || !authData.user) {
      throw new HttpError(401, "Invalid or expired session.");
    }

    const body = await req.json().catch(() => ({}));
    const targetId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!targetId) throw new HttpError(400, "Missing user_id.");
    if (targetId === authData.user.id) {
      throw new HttpError(400, "You cannot delete your own admin account.");
    }

    const { data: requester, error: requesterError } = await admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", authData.user.id)
      .single();
    if (requesterError || !requester || requester.role !== "admin" || requester.is_active !== true) {
      throw new HttpError(403, "Only an active admin can delete users.");
    }

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("email,role,is_active")
      .eq("id", targetId)
      .single();
    if (targetError || !target) throw new HttpError(404, "User profile not found.");
    if (target.role === "admin") throw new HttpError(400, "Admin users cannot be deleted here.");
    if (target.is_active !== false) {
      throw new HttpError(400, "Deactivate the user before deleting them.");
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(targetId, true);
    if (deleteError) throw new HttpError(500, deleteError.message);

    const { error: profileDeleteError } = await admin
      .from("profiles")
      .delete()
      .eq("id", targetId);
    if (profileDeleteError) throw new HttpError(500, profileDeleteError.message);

    return json({ ok: true, deleted_user_id: targetId, email: target.email });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Server error";
    console.error("delete-user error", e);
    return json({ error: message }, status);
  }
});
