import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
};

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return new Response(sse({ ok: false, code: 405, message: "Method not allowed" }), { status: 405, headers: corsHeaders });

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  if (!runId) return new Response(sse({ ok: false, code: "E_INPUT", message: "runId required" }), { status: 400, headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return new Response(sse({ ok: false, code: "E_CONFIG", message: "Missing Supabase config" }), { status: 500, headers: corsHeaders });

  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: any) => controller.enqueue(new TextEncoder().encode(sse(payload)));

      try {
        // Step 1: Connecting
        send({ type: "status", status: "connecting", step: 1 });
        await new Promise((r) => setTimeout(r, 500));

        // Step 2: Scraping (simulate and trigger ingest dry run)
        send({ type: "status", status: "scraping", step: 2 });
        const { data: ingestData, error: ingestError } = await supabase.functions.invoke("credit-report-ingest", {
          body: { dryRun: true, runId },
        });
        if (ingestError) {
          send({ type: "error", status: "error", message: ingestError.message || "ingest failed" });
        } else {
          send({ type: "snapshot", status: "saving", step: 3, runId: ingestData?.runId || runId });
        }

        // Step 3: Saving & Rendering
        await new Promise((r) => setTimeout(r, 400));
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
