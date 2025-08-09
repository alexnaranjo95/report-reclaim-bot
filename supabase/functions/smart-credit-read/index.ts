
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function parseAllowedOrigins() {
  const v = Deno.env.get("APP_ALLOWED_ORIGINS") || "";
  return v.split(",").map(s => s.trim()).filter(Boolean);
}
function checkOrigin(req: Request, headers: Headers): boolean {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin");
  if (!allowed.length) {
    headers.set("Access-Control-Allow-Origin", "*");
    return true;
  }
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    return true;
  }
  return false;
}

serve(async (req: Request) => {
  const headers = new Headers(corsHeaders);
  if (req.method === "OPTIONS") {
    checkOrigin(req, headers);
    return new Response(null, { headers });
  }
  if (req.method !== "GET") {
    checkOrigin(req, headers);
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  }
  if (!checkOrigin(req, headers)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const url = new URL(req.url);
  const path = url.pathname; // .../functions/v1/smart-credit-read/(summary|items)
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
  }

  try {
    if (path.endsWith("/summary")) {
      const { data, error } = await supabase
        .from("smart_credit_imports")
        .select("run_id, status, runtime_sec, total_rows, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, imports: data || [] }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    }

    if (path.endsWith("/items")) {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
      const cursor = url.searchParams.get("cursor"); // simple cursor = last id
      const runId = url.searchParams.get("runId") || undefined;

      let query = supabase
        .from("smart_credit_items")
        .select("id, run_id, list_key, item_index, payload, created_at")
        .order("id", { ascending: false })
        .limit(limit);

      if (cursor) {
        // fetch items with id < cursor for stable paging
        query = query.lt("id", cursor);
      }
      if (runId) {
        query = query.eq("run_id", runId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const nextCursor = data && data.length ? data[data.length - 1].id : null;
      return new Response(JSON.stringify({ ok: true, items: data || [], nextCursor }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("smart-credit-read error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
