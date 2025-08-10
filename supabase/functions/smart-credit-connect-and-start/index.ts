import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

interface StartBody {
  robotId?: string;
  username?: string;
  password?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED" }), { status: 405, headers: corsHeaders });
    }

    const apiKey = Deno.env.get("BROWSE_AI_API_KEY") || Deno.env.get("BROWSEAI_API_KEY");
    const defaultRobotId = Deno.env.get("BROWSE_AI_ROBOT_ID") || Deno.env.get("BROWSEAI_ROBOT_ID");
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, code: "CONFIG_MISSING", message: "BROWSE_AI_API_KEY is not configured" }), { status: 500, headers: corsHeaders });
    }

    const body = (await req.json().catch(() => ({}))) as StartBody;
    const robotId = body.robotId || defaultRobotId;
    const { username, password } = body;

    if (!robotId) {
      return new Response(JSON.stringify({ ok: false, code: "CONFIG_MISSING", message: "Robot ID not provided or configured" }), { status: 400, headers: corsHeaders });
    }

    // Start a BrowseAI task
    const url = `https://api.browse.ai/v2/robots/${robotId}/tasks`;
    const payload: Record<string, unknown> = {};
    if (username) payload["username"] = username;
    if (password) payload["password"] = password;

    const browseRes = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (browseRes.status === 401 || browseRes.status === 403) {
      return new Response(JSON.stringify({ ok: false, code: "AUTH_BAD_KEY", message: "Invalid BrowseAI API key" }), { status: 401, headers: corsHeaders });
    }
    if (browseRes.status === 404) {
      return new Response(JSON.stringify({ ok: false, code: "ROBOT_NOT_FOUND", message: "Robot not found" }), { status: 404, headers: corsHeaders });
    }
    if (!browseRes.ok) {
      const txt = await browseRes.text();
      return new Response(JSON.stringify({ ok: false, code: "UPSTREAM_UNAVAILABLE", message: txt || "Failed to start robot" }), { status: 502, headers: corsHeaders });
    }

    const data = await browseRes.json();
    const runId = data?.runId || data?.taskId || data?.id || crypto.randomUUID();

    const resp = {
      ok: true,
      runId,
      browseai: {
        taskId: runId,
        jobId: robotId,
      },
    };
    return new Response(JSON.stringify(resp), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("smart-credit-connect-and-start error:", err);
    return new Response(JSON.stringify({ ok: false, code: "UNKNOWN_ERROR", message: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
