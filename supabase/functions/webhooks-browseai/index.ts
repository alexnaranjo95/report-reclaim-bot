import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const defaults = [
    "https://app.disputelab.io",
    "https://localhost:5173",
    "https://b05e793f-f8ba-43e5-8d44-abd5fb386f93.lovableproject.com",
  ];
  const envList = (Deno.env.get("APP_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = envList.length ? envList : defaults;
  const origin = req.headers.get("origin") || "*";
  const allowOrigin = allowed.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  } as Record<string, string>;
}

function json(res: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(res), { status, headers });
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ ok: false, code: 405, message: "Method not allowed" }, 405, corsHeaders);

  try {
    if (req.method === "GET") {
      return json({ ok: true, message: "BrowseAI webhook is active" }, 200, corsHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const runId = body?.runId || body?.id || body?.taskId || body?.result?.runId || body?.data?.runId || null;
    const collectedAt = new Date().toISOString();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, code: "E_CONFIG", message: "Missing Supabase env" }, 500, corsHeaders);

    const service = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE);

    // Resolve userId from prior start record
    let userId: string | null = null;
    if (runId) {
      const { data: ncr, error: ncrErr } = await service
        .from("normalized_credit_reports")
        .select("user_id")
        .eq("run_id", runId)
        .maybeSingle();
      if (!ncrErr && ncr?.user_id) userId = ncr.user_id as string;
      if (!userId) {
        const { data: raw, error: rawErr } = await service
          .from("credit_reports_raw")
          .select("user_id")
          .eq("run_id", runId)
          .maybeSingle();
        if (!rawErr && raw?.user_id) userId = raw.user_id as string;
      }
    }

    // Always call ingest (fail-open): saves raw_json verbatim and normalizes when possible
    const ingestBody: Record<string, unknown> = { runId, userId, payload: body, collectedAt };
    const { data: ingestData, error: ingestError } = await service.functions.invoke("credit-report-ingest", {
      body: ingestBody,
      headers: { "x-service-role-key": SERVICE_ROLE },
    });

    const ok = !ingestError && (ingestData as any)?.ok !== false;
    const normalized = (ingestData as any)?.normalized !== false;

    return json({ ok, runId, normalized }, 200, corsHeaders);
  } catch (e: any) {
    return json({ ok: false, code: "E_WEBHOOK", message: e?.message || "Unexpected error" }, 500, corsHeaders);
  }
});
