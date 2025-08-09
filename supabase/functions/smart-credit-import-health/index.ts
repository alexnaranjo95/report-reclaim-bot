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

function setCors(req: Request, headers: Headers) {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin");
  if (!allowed.length) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
}

serve(async (req: Request) => {
  const headers = new Headers(corsHeaders);
  setCors(req, headers);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check environment variables
    const env = {
      SMART_CREDIT_KMS_KEY: !!Deno.env.get("SMART_CREDIT_KMS_KEY"),
      APP_ALLOWED_ORIGINS: !!Deno.env.get("APP_ALLOWED_ORIGINS"),
      BROWSEAI_API_KEY: !!Deno.env.get("BROWSEAI_API_KEY"),
      BROWSEAI_WORKSPACE_ID: !!Deno.env.get("BROWSEAI_WORKSPACE_ID"),
    };

    // Check database access and RLS policies
    const db = { 
      imports: false, 
      items: false, 
      credentials: false, 
      events: false,
      policies: false 
    };

    try {
      const { error: impErr } = await supabaseAdmin
        .from("smart_credit_imports")
        .select("run_id")
        .limit(1);
      db.imports = !impErr;

      const { error: itemErr } = await supabaseAdmin
        .from("smart_credit_items")
        .select("id")
        .limit(1);
      db.items = !itemErr;

      const { error: credErr } = await supabaseAdmin
        .from("smart_credit_credentials")
        .select("user_id")
        .limit(1);
      db.credentials = !credErr;

      const { error: evtErr } = await supabaseAdmin
        .from("smart_credit_import_events")
        .select("id")
        .limit(1);
      db.events = !evtErr;

      // Check if tables are accessible (basic RLS validation)
      db.policies = db.imports && db.items && db.credentials && db.events;
    } catch (e) {
      console.error("Database health check error:", e);
    }

    const overallHealth = {
      status: env.SMART_CREDIT_KMS_KEY && env.APP_ALLOWED_ORIGINS && db.policies ? "healthy" : "degraded",
      env,
      db,
      timestamp: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify(overallHealth),
      { 
        status: overallHealth.status === "healthy" ? 200 : 503,
        headers: { ...headers, "Content-Type": "application/json" }
      }
    );

  } catch (e: any) {
    console.error("Health check error:", e);
    return new Response(
      JSON.stringify({
        status: "error",
        error: e?.message || String(e),
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});