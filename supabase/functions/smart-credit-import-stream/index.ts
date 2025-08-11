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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  
  if (req.method !== "POST") {
    return new Response(sse({ ok: false, code: 405, message: "Method not allowed" }), { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  // Parse request body for runId
  let body: any = {};
  try {
    body = await req.json();
  } catch (error) {
    return new Response(sse({ ok: false, code: "E_INPUT", message: "Invalid JSON body" }), { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  const { runId } = body;
  
  if (!runId) {
    return new Response(sse({ ok: false, code: "E_INPUT", message: "runId is required" }), { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  // Get user context from JWT
  const authHeader = req.headers.get("authorization");
  const deviceId = req.headers.get("x-device-id");
  
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
  
  // Get user ID from JWT or use device ID
  let userId: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { data: { user } } = await service.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id || null;
    } catch (error) {
      console.warn("[SSE] Could not parse JWT:", error);
    }
  }
  
  const userIdentifier = userId || deviceId;
  if (!userIdentifier) {
    return new Response(sse({ ok: false, code: "E_AUTH", message: "User authentication required" }), { 
      status: 401, 
      headers: corsHeaders 
    });
  }

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
        console.log(`[SSE] Starting BrowseAI monitoring for runId: ${runId}, user: ${userIdentifier}`);
        
        // Step 1: Connecting
        send({ type: "status", status: "connecting", step: 1, runId });
        
        // Step 2: Scraping - Poll BrowseAI for task completion
        send({ type: "status", status: "scraping", step: 2, runId });
        
        let browseAiTaskResult: any = null;
        let attempts = 0;
        const MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes overall timeout
        const startTs = Date.now();
        let lastProgressEmit = 0;

        // Poll BrowseAI for task completion with adaptive interval
        while (Date.now() - startTs < MAX_WAIT_MS) {
          // Adaptive poll interval: start fast, then slow down up to 10s
          const intervalMs = Math.min(10_000, 1_000 + attempts * 250);
          await new Promise((r) => setTimeout(r, intervalMs));
          attempts++;

          try {
            const statusUrl = `https://api.browse.ai/v2/robots/${BROWSE_AI_ROBOT_ID}/tasks/${runId}`;
            const statusResponse = await fetch(statusUrl, {
              headers: { Authorization: `Bearer ${BROWSE_AI_API_KEY}` },
            });

            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              browseAiTaskResult = statusData?.result || statusData?.task || statusData;

              console.log(`[SSE] Task status check #${attempts}:`, {
                status: browseAiTaskResult?.status,
                runId,
              });

              // Emit progress roughly every 5 seconds
              const elapsed = Date.now() - startTs;
              if (elapsed - lastProgressEmit > 5_000) {
                lastProgressEmit = elapsed;
                const progress = Math.min(95, Math.round((elapsed / MAX_WAIT_MS) * 100));
                send({ type: "status", status: "scraping", step: 2, runId, progress });
              }

              if (browseAiTaskResult?.status === "successful") {
                console.log(`[SSE] BrowseAI task completed successfully`);
                break;
              } else if (browseAiTaskResult?.status === "failed") {
                const errorMsg =
                  browseAiTaskResult?.userFriendlyError ||
                  browseAiTaskResult?.error ||
                  "Task failed";
                console.error(`[SSE] BrowseAI task failed:`, errorMsg);

                if (errorMsg.includes("authentication") || errorMsg.includes("login")) {
                  throw new Error("AUTH_BAD_CREDENTIALS: Invalid email or password");
                } else if (errorMsg.includes("robot") || errorMsg.includes("not found")) {
                  throw new Error("ROBOT_NOT_FOUND: BrowseAI robot configuration error");
                } else {
                  throw new Error(`RUN_FAILED: ${errorMsg}`);
                }
              }
            } else if (statusResponse.status === 404) {
              // Task might still be initializing early on
              if (attempts < 5) {
                continue;
              } else {
                throw new Error("ROBOT_NOT_FOUND: BrowseAI task not found");
              }
            } else {
              console.warn(`[SSE] Status check failed: ${statusResponse.status}`);
            }
          } catch (fetchError) {
            console.warn(`[SSE] Status check attempt ${attempts} failed:`, fetchError);
            if (fetchError instanceof Error && fetchError.message.includes("AUTH_BAD_")) {
              // Re-throw auth errors immediately
              throw fetchError;
            }
          }
        }

        if (!browseAiTaskResult || browseAiTaskResult.status !== "successful") {
          throw new Error("RUN_TIMEOUT: BrowseAI task did not complete within 15 minutes");
        }

        // Step 3: Saving & Rendering - Send snapshot event
        send({ type: "snapshot", status: "saving", step: 3, runId });

        // Helper: small randomized delay (200–600ms) to reduce spikes
        const jitter = () => new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 400)));

        // Download captured data if available with exponential backoff (0s, 30s, 90s)
        let capturedData: any = null;
        if (browseAiTaskResult.capturedDataTemporaryUrl) {
          const downloadDelays = [0, 30_000, 90_000];
          for (let i = 0; i < downloadDelays.length; i++) {
            if (downloadDelays[i] > 0) await new Promise((r) => setTimeout(r, downloadDelays[i]));
            try {
              await jitter();
              const dataResponse = await fetch(browseAiTaskResult.capturedDataTemporaryUrl);
              if (dataResponse.ok) {
                capturedData = await dataResponse.json();
                console.log(`[SSE] Downloaded captured data (attempt ${i + 1})`);
                break;
              } else {
                console.warn(`[SSE] Captured data fetch failed (attempt ${i + 1}):`, dataResponse.status);
              }
            } catch (downloadError) {
              console.warn(`[SSE] Could not download captured data (attempt ${i + 1}):`, downloadError);
            }
          }
        }
        
        // Validate readiness: ensure three bureaus detected with non-empty score entries
        const lists = capturedData?.capturedLists || browseAiTaskResult?.capturedLists || {};
        const scoreList: any[] = Array.isArray(lists?.["Credit Score HTML"]) ? lists["Credit Score HTML"] : [];
        const bureauSeen = new Set<string>();

        for (const item of scoreList) {
          const text = String(item?.["Credit Score per bureau"] || item?.["Credit Scores"] || "").toLowerCase();
          if (text.includes("transunion") && /\d{2,3}/.test(text)) bureauSeen.add("transunion");
          if (text.includes("experian") && /\d{2,3}/.test(text)) bureauSeen.add("experian");
          if (text.includes("equifax") && /\d{2,3}/.test(text)) bureauSeen.add("equifax");
        }

        const requiredBureaus = ["equifax", "experian", "transunion"];
        const missingBureaus = requiredBureaus.filter((b) => !bureauSeen.has(b));
        const isPartial = missingBureaus.length > 0;

        if (isPartial) {
          console.warn("[SSE] Data validation indicates partial result. Missing bureaus:", missingBureaus);
          send({
            type: "partial",
            status: "partial",
            runId,
            missingBureaus,
            message: "One or more bureaus missing or incomplete; proceeding as partial",
          });
        }

        // Prepare payload for ingestion
        const creditReportPayload = {
          runId,
          status: isPartial ? "partial" : "completed",
          missingBureaus: isPartial ? missingBureaus : undefined,
          capturedLists: lists,
          capturedTexts: capturedData?.capturedTexts || browseAiTaskResult?.capturedTexts || {},
          capturedDataTemporaryUrl: browseAiTaskResult.capturedDataTemporaryUrl,
          rawBrowseAiResult: browseAiTaskResult,
        };

        // Ingest the credit report data
        try {
          const ingestPayload = { 
            runId, 
            userId: userIdentifier,
            collectedAt: new Date().toISOString(),
            payload: creditReportPayload
          };

          const { data: ingestData, error: ingestError } = await service.functions.invoke("credit-report-ingest", {
            body: ingestPayload,
            headers: { "x-service-role-key": SUPABASE_SERVICE_ROLE_KEY }
          });

          if (ingestError) {
            console.error("[SSE] Ingest error:", ingestError);
            throw new Error(`Failed to ingest credit report: ${ingestError.message || "Unknown error"}`);
          } else {
            console.log("[SSE] Ingest success:", ingestData);
          }
        } catch (ingestError) {
          console.error("[SSE] Ingest exception:", ingestError);
          throw ingestError;
        }

        // Broadcast completion event (for real-time UI updates)
        try {
          await service.from("normalized_credit_reports")
            .select("run_id")
            .eq("run_id", runId)
            .maybeSingle();
          // This helps trigger any real-time subscriptions
        } catch (broadcastError) {
          console.warn("[SSE] Broadcast error:", broadcastError);
        }

        // Final done event
        await new Promise((r) => setTimeout(r, 300));
        send({ type: "done", status: "done", step: 3, runId, timestamp: new Date().toISOString() });
        
        console.log(`[SSE] Stream completed successfully for runId: ${runId}`);
      } catch (error: any) {
        console.error("[SSE] Stream error:", error);
        
        // Map error messages for frontend
        let errorCode = "UNKNOWN_ERROR";
        let errorMessage = error?.message || "Unexpected error during import";
        
        if (errorMessage.includes("AUTH_BAD_KEY")) {
          errorCode = "AUTH_BAD_KEY";
          errorMessage = "Invalid BrowseAI API key";
        } else if (errorMessage.includes("AUTH_BAD_CREDENTIALS")) {
          errorCode = "AUTH_BAD_CREDENTIALS";
          errorMessage = "Invalid email or password for credit report access";
        } else if (errorMessage.includes("ROBOT_NOT_FOUND")) {
          errorCode = "ROBOT_NOT_FOUND";
          errorMessage = "BrowseAI robot configuration error";
        } else if (errorMessage.includes("RUN_FAILED")) {
          errorCode = "RUN_FAILED";
          errorMessage = errorMessage.replace("RUN_FAILED: ", "");
        } else if (errorMessage.includes("RUN_TIMEOUT")) {
          errorCode = "RUN_TIMEOUT";
          errorMessage = "Credit report scraping timed out";
        }
        
        send({ 
          type: "error", 
          status: "error", 
          code: errorCode,
          message: errorMessage,
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