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
    return new Response(JSON.stringify({ ok: false, code: "E_METHOD_NOT_ALLOWED" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const SMART_CREDIT_KMS_KEY = Deno.env.get("SMART_CREDIT_KMS_KEY");
    const BROWSEAI_API_KEY = Deno.env.get("BROWSEAI_API_KEY");
    const APP_ALLOWED_ORIGINS = Deno.env.get("APP_ALLOWED_ORIGINS");

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "1";

    const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: auth } = await supabaseAuth.auth.getUser();

    const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const checks: Record<string, any> = {
      env: {
        SMART_CREDIT_KMS_KEY: !!SMART_CREDIT_KMS_KEY,
        BROWSEAI_API_KEY: !!BROWSEAI_API_KEY,
        APP_ALLOWED_ORIGINS: !!APP_ALLOWED_ORIGINS,
      },
      tables: {},
      auth: { hasUser: !!auth?.user?.id },
    };

    for (const t of ["smart_credit_imports", "smart_credit_items", "smart_credit_import_events"]) {
      const { error } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true }).limit(1);
      checks.tables[t] = { ok: !error };
    }

    if (dryRun) {
      if (!auth?.user) {
        return new Response(JSON.stringify({ ok: false, code: "E_AUTH_REQUIRED", detail: "Authentication required for dryRun" }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
      }
      const runId = crypto.randomUUID();
      await supabaseAdmin.from("smart_credit_imports").insert({
        run_id: runId,
        user_id: auth.user.id,
        status: "running",
        rows: 0,
        started_at: new Date().toISOString(),
      });
      const nowIso = new Date().toISOString();
      const sampleData = [
        { user_id: auth.user.id, run_id: runId, posted_at: nowIso, amount: 12.34, merchant: "HealthCheck One", item_type: "health", source: "health", payload: { note: "sample1" } },
        { user_id: auth.user.id, run_id: runId, posted_at: nowIso, amount: 56.78, merchant: "HealthCheck Two", item_type: "health", source: "health", payload: { note: "sample2" } },
      ];
      await supabaseAdmin.from("smart_credit_items").upsert(sampleData, { onConflict: "user_id,posted_at,amount,merchant,item_type,source" });
      await supabaseAdmin.from("smart_credit_imports").update({ status: "done", rows: 2, finished_at: new Date().toISOString() }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({ run_id: runId, type: "done", step: "completed", message: "Health dry run seeded", progress: 100, metrics: { rows: 2 } });

      return new Response(JSON.stringify({ ok: true, runId, seeded: 2, checks }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, checks }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("smart-credit-import-health error:", e);
    return new Response(JSON.stringify({ ok: false, code: "E_INTERNAL" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});