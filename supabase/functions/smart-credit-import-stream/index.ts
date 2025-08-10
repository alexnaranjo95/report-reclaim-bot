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
  const BROWSE_AI_API_KEY = Deno.env.get("BROWSE_AI_API_KEY");
  const BROWSE_AI_ROBOT_ID = Deno.env.get("BROWSE_AI_ROBOT_ID");
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(sse({ ok: false, code: "E_CONFIG", message: "Missing Supabase config" }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }

  if (!BROWSE_AI_API_KEY || !BROWSE_AI_ROBOT_ID) {
    return new Response(sse({ ok: false, code: "E_CONFIG", message: "Missing BrowseAI config" }), { 
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
        
        // Get userId from the normalized_credit_reports table
        let userId: string | null = null;
        try {
          const { data: reportData } = await service
            .from("normalized_credit_reports")
            .select("user_id")
            .eq("run_id", runId)
            .maybeSingle();
          userId = reportData?.user_id || null;
        } catch (error) {
          console.warn("[SSE] Could not resolve userId:", error);
        }

        if (!userId) {
          throw new Error("Could not resolve user ID for this runId");
        }
        
        // Step 1: Connecting - Check if BrowseAI task already exists
        send({ type: "status", status: "connecting", step: 1, runId });
        
        let browseAiTaskResult: any = null;
        try {
          // Check if we already have the task result by checking the status
          const statusUrl = `https://api.browse.ai/v2/robots/${BROWSE_AI_ROBOT_ID}/tasks/${runId}`;
          const statusResponse = await fetch(statusUrl, {
            headers: { Authorization: `Bearer ${BROWSE_AI_API_KEY}` }
          });
          
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            browseAiTaskResult = statusData?.result || statusData?.task || statusData;
            console.log(`[SSE] Found existing BrowseAI task:`, { status: browseAiTaskResult?.status });
          }
        } catch (error) {
          console.warn("[SSE] Could not check existing BrowseAI status:", error);
        }

        // Step 2: Scraping - Get the actual data from BrowseAI
        send({ type: "status", status: "scraping", step: 2, runId });
        
        if (!browseAiTaskResult || browseAiTaskResult.status !== "successful") {
          // If no successful task found, we need to wait or create one
          // For now, let's assume the task exists but may be in progress
          let attempts = 0;
          const maxAttempts = 30; // 30 seconds max wait
          
          while (attempts < maxAttempts && (!browseAiTaskResult || browseAiTaskResult.status === "in-progress")) {
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
            
            try {
              const statusUrl = `https://api.browse.ai/v2/robots/${BROWSE_AI_ROBOT_ID}/tasks/${runId}`;
              const statusResponse = await fetch(statusUrl, {
                headers: { Authorization: `Bearer ${BROWSE_AI_API_KEY}` }
              });
              
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                browseAiTaskResult = statusData?.result || statusData?.task || statusData;
                
                if (browseAiTaskResult?.status === "successful") {
                  break;
                } else if (browseAiTaskResult?.status === "failed") {
                  throw new Error(`BrowseAI task failed: ${browseAiTaskResult?.userFriendlyError || "Unknown error"}`);
                }
              }
            } catch (error) {
              console.warn(`[SSE] Status check attempt ${attempts} failed:`, error);
            }
          }
        }

        if (!browseAiTaskResult || browseAiTaskResult.status !== "successful") {
          throw new Error("BrowseAI task did not complete successfully within timeout");
        }

        // Step 3: Saving & Rendering
        send({ type: "snapshot", status: "saving", step: 3, runId });
        
        // Extract the actual credit report data from BrowseAI result
        const creditReportPayload = {
          runId,
          status: "completed",
          capturedLists: browseAiTaskResult?.capturedLists || {},
          capturedTexts: browseAiTaskResult?.capturedTexts || {},
          rawBrowseAiResult: browseAiTaskResult
        };

        // Ingest the real credit report data
        try {
          const { data: ingestData, error: ingestError } = await service.functions.invoke("credit-report-ingest", {
            body: { 
              runId, 
              userId,
              collectedAt: new Date().toISOString(),
              payload: creditReportPayload
            },
            headers: { "x-service-role-key": SUPABASE_SERVICE_ROLE_KEY }
          });

          if (ingestError) {
            console.error("[SSE] Ingest error:", ingestError);
            throw new Error(`Failed to ingest credit report: ${ingestError.message}`);
          } else {
            console.log("[SSE] Ingest success:", ingestData);
          }
        } catch (ingestError) {
          console.error("[SSE] Ingest exception:", ingestError);
          throw ingestError;
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