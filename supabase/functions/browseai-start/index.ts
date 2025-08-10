import "https://deno.land/x/xhr@0.1.0/mod.ts"; import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", };

serve(async (req: Request) => { if (req.method === "OPTIONS") { return new Response(null, { headers: corsHeaders }); }

try { const apiKey = Deno.env.get("BROWSE_AI_API_KEY"); if (!apiKey) { return new Response(JSON.stringify({ error: "Missing BROWSE_AI_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, }); }

const workspaceId = Deno.env.get("BROWSE_AI_WORKSPACE_ID");
const { robotId: robotIdFromBody, username, password } = await req.json();

const robotId =
  (robotIdFromBody && String(robotIdFromBody).trim()) ||
  Deno.env.get("BROWSE_AI_ROBOT_ID");

if (!username || !password) {
  return new Response(JSON.stringify({ error: "username and password are required" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

if (!robotId) {
  return new Response(
    JSON.stringify({
      error:
        "Robot ID is required. Provide robotId in the request body or set BROWSE_AI_ROBOT_ID in Supabase secrets.",
    }),
    {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

console.log("browseai-start input", {
  robotIdSuffix: String(robotId).slice(-6),
  robotIdSource: robotIdFromBody ? "request" : "secret",
  hasWorkspaceId: !!workspaceId,
});

const url = `https://api.browse.ai/v2/robots/${encodeURIComponent(robotId)}/tasks`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    recordVideo: false,
    inputParameters: { username, password },
  }),
});

if (res.status === 404) {
  console.warn("browseai-start robot not found", { status: res.status });
  return new Response(
    JSON.stringify({ error: "Robot not found. Please provide a valid Robot ID (not a Monitor ID)." }),
    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

if (res.status === 401 || res.status === 403) {
  console.warn("browseai-start unauthorized", { status: res.status });
  return new Response(
    JSON.stringify({ error: "Unauthorized. Check API key or robot permissions." }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

if (!res.ok) {
  const text = await res.text();
  console.error("browseai-start non-ok response", { status: res.status, body: text });
  return new Response(JSON.stringify({ error: `Start run failed (${res.status}): ${text}` }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const data = await res.json();
const runId = data?.result?.id;
if (!runId) {
  return new Response(JSON.stringify({ error: "Could not retrieve task id from response." }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

console.log("browseai-start success", {
  robotIdSuffix: String(robotId).slice(-6),
  runId,
  usedSecretRobotId: !robotIdFromBody,
});
return new Response(JSON.stringify({ runId, robotId }), {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
} catch (error) { console.error("browseai-start error", error && (error as any).message); return new Response(JSON.stringify({ error: "Unexpected error starting run" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, }); } });
