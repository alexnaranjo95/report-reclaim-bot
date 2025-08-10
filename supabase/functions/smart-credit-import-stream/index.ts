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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  } as Record<string, string>;
}

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return new Response(sse({ ok: false, code: 405, message: "Method not allowed" }), { status: 405, headers: corsHeaders });

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  if (!runId) return new Response(sse({ ok: false, code: "E_INPUT", message: "runId required" }), { status: 400, headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return new Response(sse({ ok: false, code: "E_CONFIG", message: "Missing Supabase config" }), { status: 500, headers: corsHeaders });

  const anon = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const service = SERVICE_ROLE ? createSupabaseClient(SUPABASE_URL, SERVICE_ROLE) : null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: any) => controller.enqueue(new TextEncoder().encode(sse(payload)));

      try {
        // Step 1: Connecting
        send({ type: "status", status: "connecting", step: 1 });
        await new Promise((r) => setTimeout(r, 300));

        // Step 2: Scraping (emit progress)
        send({ type: "status", status: "scraping", step: 2 });
        // Optional dry-run ping to warm ingest path
        try {
          await anon.functions.invoke("credit-report-ingest", { body: { dryRun: true, runId } });
        } catch (_) { /* ignore */ }

        // Emit snapshot event to trigger UI refresh
        send({ type: "snapshot", status: "saving", step: 3, runId });

        // If service role available, attempt normalization pass (fail-open)
        if (service) {
          try {
            await service.functions.invoke("credit-report-ingest", {
              body: { runId, collectedAt: new Date().toISOString() },
              headers: { "x-service-role-key": SERVICE_ROLE },
            });
          } catch (_) { /* ignore */ }
        }

        // Final done event
        await new Promise((r) => setTimeout(r, 300));
        send({ type: "done", status: "done", step: 3, runId });
      } catch (e: any) {
        send({ type: "error", status: "error", message: e?.message || "Unexpected error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: corsHeaders });
});
