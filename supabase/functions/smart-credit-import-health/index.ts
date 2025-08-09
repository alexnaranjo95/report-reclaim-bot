import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
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
  if (!allowed.length) headers.set("Access-Control-Allow-Origin", "*");
  else if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
}

serve(async (req: Request) => {
  const headers = new Headers(cors);
  if (req.method === "OPTIONS") {
    setCors(req, headers);
    return new Response(null, { headers });
  }
  if (req.method !== "GET") {
    setCors(req, headers);
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const env = {
      SMART_CREDIT_KMS_KEY: !!Deno.env.get("SMART_CREDIT_KMS_KEY"),
      APP_ALLOWED_ORIGINS: !!Deno.env.get("APP_ALLOWED_ORIGINS"),
    };

    // DB reachability
    const db = { imports: false, items: false, policies: false } as { imports: boolean; items: boolean; policies: boolean };

    const { error: impErr } = await supabaseAdmin.from("smart_credit_imports").select("run_id").limit(1);
    db.imports = !impErr;
    const { error: itemErr } = await supabaseAdmin.from("smart_credit_items").select("id").limit(1);
    db.items = !itemErr;

    // Best-effort policy signal: if both tables are accessible and env set, we assume policies configured
    db.policies = db.imports && db.items;

    setCors(req, headers);
    return new Response(JSON.stringify({ env, db }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e: any) {
    setCors(req, headers);
    return new Response(JSON.stringify({ env: { SMART_CREDIT_KMS_KEY: !!Deno.env.get("SMART_CREDIT_KMS_KEY"), APP_ALLOWED_ORIGINS: !!Deno.env.get("APP_ALLOWED_ORIGINS") }, db: { imports: false, items: false, policies: false }, error: e?.message || String(e) }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
