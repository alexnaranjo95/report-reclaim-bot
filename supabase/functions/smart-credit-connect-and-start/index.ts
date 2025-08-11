import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const defaults = [
    "https://app.disputelab.io",
    "https://localhost:5173",
    "https://b05e793f-f8ba-43e5-8d44-abd5fb386f93.lovableproject.com",
  ];
  const envList = (Deno.env.get("APP_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = envList.length ? envList : defaults;
  const origin = req.headers.get("origin") || "*";
  const allowOrigin = allowed.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  } as Record<string, string>;
}

function json(req: Request, res: unknown, status = 200) {
  return new Response(JSON.stringify(res), { status, headers: getCorsHeaders(req) });
}

function uuid() {
  // Simple UUID v4 generator (not cryptographically strong)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(req, { code: 405, message: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const BROWSEAI_API_KEY = Deno.env.get("BROWSEAI_API_KEY") || Deno.env.get("BROWSE_AI_API_KEY");
    const BROWSEAI_ROBOT_ID = Deno.env.get("BROWSEAI_ROBOT_ID") || Deno.env.get("BROWSE_AI_ROBOT_ID");
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(req, { code: "E_CONFIG", message: "Missing Supabase config" }, 500);
    if (!BROWSEAI_API_KEY) return json(req, { code: "AUTH_BAD_KEY", message: "Missing BrowseAI API key" }, 500);
    if (!BROWSEAI_ROBOT_ID) return json(req, { code: "ROBOT_NOT_FOUND", message: "Missing BrowseAI robot ID" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const deviceId = req.headers.get("x-device-id");
    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });

    // Get user context
    let userId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const { data: auth } = await supabase.auth.getUser();
        userId = auth?.user?.id || null;
      } catch (error) {
        console.warn("Could not parse JWT:", error);
      }
    }
    
    const userIdentifier = userId || deviceId || null;

    const body = await req.json().catch(() => ({} as any));
    const email = body?.email || body?.username;
    const password = body?.password;
    if (!email || !password) return json(req, { code: "E_INPUT", message: "email and password are required" }, 400);

    let runId = uuid();

    // Test BrowseAI connection by creating a robot task
    try {
      const robotTaskPayload = {
        id: runId,
        robotId: BROWSEAI_ROBOT_ID,
        inputParameters: {
          "Email": email,
          "Password": password,
          "originUrl": "https://www.identityiq.com/",
          "robotSlowMo": 1000,
          "robotTimeout": 240000,
          "dataExtractionTimeoutForAnyElement": 10000,
          "dataExtractionTimeoutForAllElements": 60000
        }
      };

      const createUrl = `https://api.browse.ai/v2/robots/${BROWSEAI_ROBOT_ID}/tasks`;
      const createResponse = await fetch(createUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${BROWSEAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(robotTaskPayload)
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error("BrowseAI task creation failed:", errorText);
        
        if (createResponse.status === 401) {
          return json(req, { code: "AUTH_BAD_KEY", message: "Invalid BrowseAI API key" }, 400);
        } else if (createResponse.status === 404) {
          return json(req, { code: "ROBOT_NOT_FOUND", message: "BrowseAI robot not found" }, 400);
        } else {
          return json(req, { code: "RUN_FAILED", message: `BrowseAI error: ${errorText}` }, 400);
        }
      }

      // Parse response and use the actual task/run id returned by BrowseAI
      let createData: any = null;
      try {
        createData = await createResponse.json();
      } catch (_) {
        createData = null;
      }
      const task = createData?.result || createData?.task || createData;
      const returnedId = task?.id || task?.taskId || task?.data?.id;
      if (returnedId) {
        runId = String(returnedId);
      }

      console.log(`BrowseAI task created successfully, taskId: ${runId}`);
    } catch (error) {
      console.error("BrowseAI connection error:", error);
      return json(req, { code: "RUN_FAILED", message: "Failed to connect to BrowseAI" }, 500);
    }

    // Record initial import row for UI visibility
    try {
      await supabase.from("normalized_credit_reports").insert({ 
        run_id: runId, 
        user_id: userIdentifier, 
        collected_at: new Date().toISOString(), 
        version: "v1", 
        report_json: { status: "starting" } 
      });
    } catch (_) {
      // ignore if table/policy prevents insert here; UI will still proceed
    }

    return json(req, { ok: true, runId });
  } catch (e: any) {
    console.error("smart-credit-connect-and-start error:", e);
    return json(req, { code: "E_UNEXPECTED", message: e?.message || "Unexpected error" }, 500);
  }
});