
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StatusBody = {
  taskId: string;
};

function getAuthHeaderFromKey(key: string) {
  if (key.includes(":")) {
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

  const body = (await req.json().catch(() => ({}))) as StatusBody;
  const { taskId } = body || {};
  if (!taskId) {
    return new Response(JSON.stringify({ error: "taskId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Ensure the run exists and belongs to this user (or superadmin can see all)
  const { data: roleCheck } = await supabaseAdmin
    .rpc("has_role", { _user_id: user.id, _role: "superadmin" })
    .catch(() => ({ data: false }));

  const { data: runRow } = await supabaseAdmin
    .from("browseai_runs")
    .select("*")
    .eq("task_id", taskId)
    .maybeSingle();

  if (!runRow) {
    return new Response(JSON.stringify({ error: "Run not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!roleCheck && runRow.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Poll Browse.ai for status
  const apiBase = "https://api.browse.ai/v2";
  const authHeaderVal = getAuthHeaderFromKey(BROWSEAI_API_KEY);

  const res = await fetch(`${apiBase}/tasks/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: {
      Authorization: authHeaderVal,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json().catch(() => ({}));
  console.log("Browse.ai status response:", res.status, data);

  if (!res.ok) {
    await supabaseAdmin
      .from("browseai_runs")
      .update({ status: "error", error: typeof data === "object" ? JSON.stringify(data) : String(data) })
      .eq("id", runRow.id);
    return new Response(JSON.stringify({ error: "Failed to fetch task status", details: data }), {
      status: res.status || 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Try to read normalized fields
  const status = data?.status || data?.data?.status || "unknown";
  const result = data?.result || data?.data?.result || null;

  // Update run status
  const updatePayload: Record<string, unknown> = { status };
  if (status === "completed" && result) {
    updatePayload.raw_result = result;
    updatePayload.webhook_received_at = new Date().toISOString();
  }
  await supabaseAdmin.from("browseai_runs").update(updatePayload).eq("id", runRow.id);

  // Optionally, minimal mapping placeholder (future: expand to full mapping)
  let creditReportId: string | null = runRow.credit_report_id || null;
  if (status === "completed" && !creditReportId) {
    // Create a basic credit report record to link the run (you can expand this mapping later)
    const { data: report, error: reportErr } = await supabaseAdmin
      .from("credit_reports")
      .insert({
        user_id: runRow.user_id,
        bureau_name: "SmartCredit",
        file_name: "SmartCredit Import",
        extraction_status: "completed",
        report_date: new Date().toISOString().split("T")[0],
        raw_text: null,
      })
      .select()
      .single();

    if (!reportErr && report) {
      creditReportId = report.id;
      await supabaseAdmin.from("browseai_runs").update({ credit_report_id: report.id }).eq("id", runRow.id);
    } else {
      console.error("Failed to create credit_reports record:", reportErr);
    }
  }

  return new Response(JSON.stringify({ status, task: data, credit_report_id: creditReportId }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
