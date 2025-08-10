import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function uuid() {
  // Simple UUID v4 generator (not cryptographically strong)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: 405, message: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ code: "E_CONFIG", message: "Missing Supabase config" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return json({ code: 401, message: "Unauthorized" }, 401);

    const { username, password } = await req.json().catch(() => ({}));
    if (!username || !password) return json({ code: "E_INPUT", message: "username and password are required" }, 400);

    const runId = uuid();

    // Optionally record a minimal import row for UI visibility (idempotent-ish)
    try {
      await supabase.from("normalized_credit_reports").insert({ run_id: runId, user_id: auth.user.id, collected_at: new Date().toISOString(), version: "v1", report_json: { status: "starting" } });
    } catch (_) {
      // ignore if table/policy prevents insert here; UI will still proceed
    }

    return json({ ok: true, runId });
  } catch (e: any) {
    console.error("smart-credit-connect-and-start error:", e);
    return json({ code: "E_UNEXPECTED", message: e?.message || "Unexpected error" }, 500);
  }
});
