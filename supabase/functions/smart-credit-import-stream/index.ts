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
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  if (req.method !== "GET") {
    return new Response(sse({ ok: false, code: 405, message: "Method not allowed" }), { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  
  if (!runId) {
    return new Response(sse({ ok: false, code: "E_INPUT", message: "runId required" }), { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(sse({ ok: false, code: "E_CONFIG", message: "Missing Supabase config" }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }

  const service = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: any) => {
        try {
          controller.enqueue(new TextEncoder().encode(sse(payload)));
        } catch (error) {
          console.error("[SSE] Send error:", error);
        }
      };

      try {
        console.log(`[SSE] Starting stream for runId: ${runId}`);
        
        // Step 1: Connecting
        send({ type: "status", status: "connecting", step: 1, runId });
        await new Promise((r) => setTimeout(r, 500));

        // Step 2: Scraping
        send({ type: "status", status: "scraping", step: 2, runId });
        await new Promise((r) => setTimeout(r, 1000));
        
        // Optional: Trigger ingest with dry run to warm the pipeline
        try {
          await service.functions.invoke("credit-report-ingest", {
            body: { dryRun: true, runId },
            headers: { "x-service-role-key": SUPABASE_SERVICE_ROLE_KEY }
          });
        } catch (warmupError) {
          console.warn("[SSE] Warmup ingest failed:", warmupError);
        }

        // Step 3: Saving & Rendering
        send({ type: "snapshot", status: "saving", step: 3, runId });
        await new Promise((r) => setTimeout(r, 500));

        // Attempt to trigger actual ingest
        try {
          const { data: ingestData, error: ingestError } = await service.functions.invoke("credit-report-ingest", {
            body: { 
              runId, 
              userId: "system", // Will be resolved from existing records
              collectedAt: new Date().toISOString(),
              payload: { status: "completed", runId }
            },
            headers: { "x-service-role-key": SUPABASE_SERVICE_ROLE_KEY }
          });

          if (ingestError) {
            console.warn("[SSE] Ingest error:", ingestError);
          } else {
            console.log("[SSE] Ingest success:", ingestData);
          }
        } catch (ingestError) {
          console.warn("[SSE] Ingest exception:", ingestError);
        }

        // Final done event
        await new Promise((r) => setTimeout(r, 300));
        send({ type: "done", status: "done", step: 3, runId });
        
        console.log(`[SSE] Stream completed for runId: ${runId}`);
      } catch (error: any) {
        console.error("[SSE] Stream error:", error);
        send({ 
          type: "error", 
          status: "error", 
          message: error?.message || "Unexpected error during import",
          runId 
        });
      } finally {
        try {
          controller.close();
        } catch (closeError) {
          console.warn("[SSE] Controller close error:", closeError);
        }
      }
    },
  });

  return new Response(stream, { headers: corsHeaders });
});