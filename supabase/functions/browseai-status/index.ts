import "https://deno.land/x/xhr@0.1.0/mod.ts"; import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", };

serve(async (req: Request) => { if (req.method === "OPTIONS") { return new Response(null, { headers: corsHeaders }); }

try { const apiKey = Deno.env.get("BROWSE_AI_API_KEY"); if (!apiKey) { return new Response(JSON.stringify({ error: "Missing BROWSE_AI_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, }); }

const workspaceId = Deno.env.get("BROWSE_AI_WORKSPACE_ID");
const { robotId: robotIdFromBody, runId } = await req.json();

const robotId =
  (robotIdFromBody && String(robotIdFromBody).trim()) ||
  Deno.env.get("BROWSE_AI_ROBOT_ID");

if (!runId) {
  return new Response(JSON.stringify({ status: "failed", errorMessage: "runId is required" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

if (!robotId) {
  return new Response(
    JSON.stringify({
      status: "failed",
      errorMessage:
        "Robot ID is required. Provide robotId in the request body or set BROWSE_AI_ROBOT_ID in Supabase secrets.",
    }),
    {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

console.log("browseai-status: fetching task status", {
  robotIdSuffix: String(robotId).slice(-6),
  runIdSuffix: String(runId).slice(-6),
  robotIdSource: robotIdFromBody ? "request" : "secret",
  hasWorkspaceId: !!workspaceId,
});

const url = `https://api.browse.ai/v2/robots/${encodeURIComponent(robotId)}/tasks/${encodeURIComponent(runId)}`;

const res = await fetch(url, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
});

if (res.status === 401 || res.status === 403) {
  console.warn("browseai-status unauthorized", { status: res.status });
  return new Response(
    JSON.stringify({ status: "failed", errorMessage: "Unauthorized. Check API key or robot permissions." }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

if (res.status === 404) {
  console.warn("browseai-status task not found", { status: res.status });
  return new Response(
    JSON.stringify({ status: "failed", errorMessage: "Task not found. Verify Robot ID and Task ID (runId)." }),
    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

if (!res.ok) {
  const text = await res.text();
  console.error("browseai-status non-ok response", { status: res.status, body: text });
  return new Response(
    JSON.stringify({ status: "failed", errorMessage: `Status check failed (${res.status}): ${text}` }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

const data = await res.json();
const task = (data && (data.result || data.task || data)) || {};
const status = (task.status as "queued" | "in-progress" | "successful" | "failed") || "in-progress";
let errorMessage: string | undefined;
if (status === "failed") {
  errorMessage = task.userFriendlyError || task.errorMessage || task.message || "Run failed";
}

console.log("browseai-status result", { status, hasResult: !!task });

return new Response(
  JSON.stringify({ status, result: task, errorMessage }),
  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
} catch (error) { console.error("browseai-status error", error && (error as any).message); return new Response(JSON.stringify({ status: "failed", errorMessage: "Unexpected error checking status" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, }); } });
