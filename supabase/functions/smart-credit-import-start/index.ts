import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function redact(obj: Record<string, unknown>) {
  const clone: Record<string, unknown> = { ...obj };
  for (const k of Object.keys(clone)) {
    if (k.toLowerCase().includes("password") || k.toLowerCase().includes("pass")) {
      clone[k] = "******";
    }
  }
  return clone;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BROWSEAI_API_KEY = Deno.env.get("BROWSEAI_API_KEY")!;
  const BROWSEAI_WORKSPACE_ID = Deno.env.get("BROWSEAI_WORKSPACE_ID");

  const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: auth } = await supabaseAuth.auth.getUser();
    if (!auth?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    let robotId: string | undefined = body.robotId;
    const inputParameters: Record<string, unknown> = body.inputParameters || {};
    const tags: string[] | undefined = body.tags;

    if (!robotId) {
      const { data } = await supabaseAdmin
        .from("admin_settings")
        .select("setting_key, setting_value")
        .eq("setting_key", "browseai.robot_id")
        .maybeSingle();
      robotId = (data?.setting_value as any)?.value ?? (typeof data?.setting_value === "string" ? (data?.setting_value as string) : undefined);
    }

    if (!robotId) {
      return new Response(JSON.stringify({ error: "Missing robotId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create initial run row as the user (RLS will allow)
    const { data: runInsert, error: runErr } = await supabaseAuth
      .from("browseai_runs")
      .insert({ user_id: auth.user.id, robot_id: robotId, status: "queued", input_params: redact(inputParameters) })
      .select("id")
      .single();

    if (runErr || !runInsert) {
      console.error("Failed to create run:", runErr);
      return new Response(JSON.stringify({ error: "Failed to create run" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const runId = runInsert.id as string;

    // Log init event
    await supabaseAuth.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "init",
      step: "initialize",
      message: "Starting Smart Credit import",
      progress: 0,
      metrics: {},
    });

    // Trigger Browse.ai task
    const browseHeaders: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BROWSEAI_API_KEY}`,
    };
    if (BROWSEAI_WORKSPACE_ID) browseHeaders["x-browseai-workspace-id"] = BROWSEAI_WORKSPACE_ID;

    const resp = await fetch("https://api.browse.ai/v2/tasks", {
      method: "POST",
      headers: browseHeaders,
      body: JSON.stringify({ robotId, inputParameters, tags }),
    });

    const bodyJson = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Browse.ai task creation failed:", resp.status, bodyJson);
      await supabaseAdmin.from("browseai_runs").update({ status: "failed", error: `Create task failed: ${resp.status}` }).eq("id", runId);
      await supabaseAuth.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "create_task",
        message: bodyJson?.messageCode || "Failed to create task",
        progress: 0,
      });
      return new Response(JSON.stringify({ error: "Browse.ai create task failed", runId }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const taskId = bodyJson?.result?.id as string | undefined;

    await supabaseAdmin
      .from("browseai_runs")
      .update({ task_id: taskId ?? null, status: bodyJson?.result?.status ?? "in-progress" })
      .eq("id", runId);

    await supabaseAuth.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "step",
      step: "start",
      message: "Browse.ai task started",
      progress: 5,
      metrics: {},
    });

    return new Response(JSON.stringify({ runId, taskId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("smart-credit-import-start error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
