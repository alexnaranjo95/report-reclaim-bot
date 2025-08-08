
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TriggerBody = {
  robotId: string;
  inputParameters: Record<string, unknown>;
  tags?: string[];
};

function getAuthHeaderFromKey(key: string) {
  if (key.includes(":")) {
    // key:secret format
    // deno-lint-ignore no-explicit-any
    const basic = (globalThis as any).btoa ? btoa(key) : "";
    return `Basic ${basic}`;
  }
  return `Bearer ${key}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BROWSEAI_API_KEY = Deno.env.get("BROWSEAI_API_KEY")!;

  // Authenticated user (required)
  const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Service client for DB writes
  const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const body = (await req.json().catch(() => ({}))) as TriggerBody;
  const { robotId, inputParameters, tags = ["smartcredit", "import"] } = body || {};
  if (!robotId || !inputParameters) {
    return new Response(JSON.stringify({ error: "robotId and inputParameters are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Normalize keys (convert hyphens to underscores) and sanitize for storage - avoid saving sensitive values like passwords
  const finalInput: Record<string, unknown> = { ...(inputParameters || {}) };
  for (const k of Object.keys(inputParameters || {})) {
    const normalized = k.replace(/-/g, "_");
    if (normalized !== k && !(normalized in finalInput)) {
      // deno-lint-ignore no-explicit-any
      (finalInput as any)[normalized] = (inputParameters as any)[k];
    }
  }
  const sanitizedInput: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(finalInput)) {
    const lower = k.toLowerCase();
    if (lower.includes("password") || lower.includes("pass")) continue;
    sanitizedInput[k] = v;
  }

  const apiBase = "https://api.browse.ai/v2";
  const authHeaderVal = getAuthHeaderFromKey(BROWSEAI_API_KEY);

  // Load optional Workspace ID from admin_settings
  let workspaceId: string | null = null;
  try {
    const { data: wsRow } = await supabaseAdmin
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "browseai.workspace_id")
      .limit(1)
      .single();
    const raw = wsRow?.setting_value as unknown;
    workspaceId = typeof raw === "string" ? raw : (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>) ? String((raw as Record<string, unknown>).value) : null);
  } catch (_err) {
    workspaceId = null;
  }

  // Build headers
  const headers: Record<string, string> = {
    Authorization: authHeaderVal,
    "Content-Type": "application/json",
  };
  if (workspaceId) headers["X-Workspace-Id"] = workspaceId;

  console.log("Triggering Browse.ai task for robot:", robotId, "workspace:", workspaceId || "(none)");
  const res = await fetch(`${apiBase}/robots/${encodeURIComponent(robotId)}/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      inputParameters: finalInput,
      tags,
    }),
  });

  const data = await res.json().catch(() => ({}));
  console.log("Browse.ai trigger response status:", res.status, "body:", data);

  if (!res.ok) {
    // Record failed attempt
    await supabaseAdmin
      .from("browseai_runs")
      .insert({
        user_id: user.id,
        robot_id: robotId,
        status: "failed_to_queue",
        input_params: sanitizedInput,
        error: typeof data === "object" ? JSON.stringify(data) : String(data),
      })
      .select()
      .single()
      .catch(() => null);

    return new Response(JSON.stringify({ error: "Failed to start Browse.ai task", details: data }), {
      status: res.status || 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Try to find task id from response
  const taskId = data?.taskId || data?.id || data?.data?.id || null;
  const status = data?.status || "queued";

  // Record run
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from("browseai_runs")
    .insert({
      user_id: user.id,
      robot_id: robotId,
      task_id: taskId,
      status: status,
      input_params: sanitizedInput,
    })
    .select()
    .single();

  if (runErr) {
    console.error("Error inserting browseai_runs:", runErr);
  }

  return new Response(JSON.stringify({ taskId, status, run: runRow }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
