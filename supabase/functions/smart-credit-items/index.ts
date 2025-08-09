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

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);
    const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
    const search = url.searchParams.get("q")?.trim();
    const sort = url.searchParams.get("sort") || "posted_at.desc"; // e.g., posted_at.desc or amount.asc

    const [sortCol, sortDir] = sort.split(".");

    let query = supabaseAuth
      .from("smart_credit_items")
      .select("id,run_id,source,item_type,posted_at,amount,merchant,memo,payload")
      .eq("user_id", auth.user.id)
      .order(sortCol as any, { ascending: sortDir === "asc" })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike("merchant", `%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) return new Response(JSON.stringify({ ok: false, code: "E_DB", detail: error.message }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ ok: true, items: data || [], nextOffset: (data?.length || 0) < limit ? null : offset + limit }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("smart-credit-items error:", e);
    return new Response(JSON.stringify({ ok: false, code: "E_INTERNAL" }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  }
});