import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function parseAllowedOrigins() {
  const v = Deno.env.get("APP_ALLOWED_ORIGINS") || "";
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
function setCors(req: Request, headers: Headers) {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin");
  if (!allowed.length) headers.set("Access-Control-Allow-Origin", "*");
  else if (origin && allowed.includes(origin)) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
}

serve(async (req: Request) => {
  const headers = new Headers(corsHeaders);
  setCors(req, headers);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET") return new Response(JSON.stringify({ ok: false, code: "E_METHOD_NOT_ALLOWED" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: auth, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !auth?.user) return new Response(JSON.stringify({ ok: false, code: "E_AUTH_REQUIRED" }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });

    const { data: lastImport } = await supabaseAuth
      .from("smart_credit_imports")
      .select("run_id,status,rows,started_at,finished_at,task_id,job_id")
      .eq("user_id", auth.user.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: totalItems } = await supabaseAuth
      .from("smart_credit_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.user.id);

    return new Response(JSON.stringify({ ok: true, summary: { lastImport, totalItems: totalItems || 0 } }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("smart-credit-summary error:", e);
    return new Response(JSON.stringify({ ok: false, code: "E_INTERNAL" }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  }
});