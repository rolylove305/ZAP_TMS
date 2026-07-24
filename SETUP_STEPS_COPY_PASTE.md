# Setup ELD Integration Requests - Copy & Paste Steps

**Time:** 5 minutes | **Difficulty:** Easy

---

## ✅ Step 1: Run SQL Migration

1. Go to: https://app.supabase.com/project/nhttbtvjcwtkecdlxpzk/sql
2. Click **New Query**
3. Copy & paste this SQL:

```sql
-- ELD Integration Requests table
create table if not exists public.eld_integration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id text not null,
  eld_name text not null,
  eld_website text,
  api_documentation text,
  notes text,
  status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'rejected')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes
create index if not exists idx_eld_requests_user_id on public.eld_integration_requests(user_id);
create index if not exists idx_eld_requests_status on public.eld_integration_requests(status);
create index if not exists idx_eld_requests_created on public.eld_integration_requests(created_at desc);

-- RLS Policies
alter table public.eld_integration_requests enable row level security;

create policy if not exists "Users can view their own ELD requests"
  on public.eld_integration_requests
  for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert their own ELD requests"
  on public.eld_integration_requests
  for insert
  with check (auth.uid() = user_id);
```

4. Click **Run** (▶️ button)
5. ✅ You should see "Success" message

---

## ✅ Step 2: Deploy Edge Function

1. Go to: https://app.supabase.com/project/nhttbtvjcwtkecdlxpzk/functions
2. Click **Create a new function**
3. Name: `eld-request`
4. Copy & paste this code:

```typescript
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
```

5. Click **Deploy** (blue button at bottom right)
6. Wait for "✅ Function deployed successfully"

---

## ✅ Step 3: Test It

1. Open your app: https://app.zapdispatch.com
2. Login
3. Go to **Settings** (bottom nav → ⚙️)
4. Scroll down → Look for **"ELD Integrations"** section
5. Click **"+ Request ELD"**
6. Fill form:
   - ELD Name: `Test ELD`
   - Website: `https://test.com`
   - Notes: `Testing the system`
7. Click **Submit Request**
8. You should see: ✅ "Request submitted!"

---

## ✅ Step 4: View Submissions (Admin Dashboard)

1. Open: `/Users/rolandotrujillo/Documents/ZAP_TMS/admin-eld-requests.html`
   (Double-click or drag to browser)
2. You should see a table with your test request
3. Click **View** to see details
4. Try changing the status

---

## ✅ Done!

**Summary of what just happened:**
- ✅ Database table created (stores ELD requests)
- ✅ Edge Function deployed (processes submissions)
- ✅ Frontend UI ready (eld-request.js already in app)
- ✅ Admin dashboard working (admin-eld-requests.html)

**Users can now:**
1. Request ELD integrations from Settings
2. See Coming Soon ELDs (Geotab, Samsara, etc.)
3. Submit their own ELD if not listed

**You can:**
1. View all submissions in admin dashboard
2. Change status (pending → in_progress → completed)
3. Add more ELDs to "Coming Soon" list

---

## 🐛 If something fails:

**Error: "Missing Authorization bearer token"**
- Verify you're logged in to the app
- Refresh the page
- Try again

**Error: "Unauthorized"**
- Logout and login again
- Check your session is valid

**Admin dashboard empty**
- Refresh the page (Ctrl+R)
- Check browser console (F12) for errors
- Make sure you submitted a test request first

**Function deploy fails**
- Copy paste the code again carefully
- Check no extra characters at start/end
- Try deploying again

---

**All set? You're ready to go! 🚀**
