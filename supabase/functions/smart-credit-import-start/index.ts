import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ulid } from "https://deno.land/x/ulid@v0.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseAllowedOrigins() {
  const v = Deno.env.get("APP_ALLOWED_ORIGINS") || "";
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

function setCors(req: Request, headers: Headers) {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin");
  if (!allowed.length) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
}

function decodeB64(b64: string): Uint8Array {
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}

async function importKeyFromSecret(): Promise<CryptoKey> {
  const b64 = Deno.env.get("SMART_CREDIT_KMS_KEY");
  if (!b64) throw new Error("Missing SMART_CREDIT_KMS_KEY");
  const raw = decodeB64(b64);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}

async function decryptCipher(ivB64: string, ctB64: string, key: CryptoKey) {
  const iv = decodeB64(ivB64);
  const ct = decodeB64(ctB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

serve(async (req: Request) => {
  const headers = new Headers(corsHeaders);
  setCors(req, headers);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, code: "E_METHOD_NOT_ALLOWED", detail: "Only POST requests allowed" }),
      { status: 405, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BROWSEAI_API_KEY = Deno.env.get("BROWSEAI_API_KEY")!;
    const BROWSEAI_WORKSPACE_ID = Deno.env.get("BROWSEAI_WORKSPACE_ID");

    // Auth check
    const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    const { data: auth, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !auth?.user) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_AUTH_REQUIRED", detail: "Authentication required" }),
        { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "1";
    const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate runId and create import record first
    const runId = ulid();
    console.log(`[${runId}] Starting Smart Credit import for user ${auth.user.id}, dryRun=${dryRun}`);

    const { error: insertError } = await supabaseAdmin
      .from("smart_credit_imports")
      .insert({
        user_id: auth.user.id,
        run_id: runId,
        status: "starting",
        total_rows: 0,
        started_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`[${runId}] Failed to create import record:`, insertError);
      return new Response(
        JSON.stringify({ ok: false, code: "E_DB_INSERT", detail: "Failed to create import record" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Emit initial events
    await supabaseAdmin.from("smart_credit_import_events").insert([
      {
        run_id: runId,
        type: "init",
        step: "starting",
        message: "Import initialized",
        progress: 0,
        metadata: { dryRun },
      },
    ]);

    // Handle dry run
    if (dryRun) {
      console.log(`[${runId}] Processing dry run`);
      
      await supabaseAdmin.from("smart_credit_imports").update({ status: "running" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "step",
        step: "simulating",
        message: "Generating sample data",
        progress: 50,
        metadata: { phase: "simulation" },
      });

      // Insert sample data
      const nowIso = new Date().toISOString();
      const sampleData = [
        {
          user_id: auth.user.id,
          run_id: runId,
          list_key: "dryRun",
          item_index: 0,
          posted_at: nowIso,
          amount: 42.50,
          merchant: "DryRun Utilities",
          item_type: "utility",
          source: "simulation",
          payload: { note: "Sample transaction 1" },
        },
        {
          user_id: auth.user.id,
          run_id: runId,
          list_key: "dryRun",
          item_index: 1,
          posted_at: nowIso,
          amount: 19.99,
          merchant: "DryRun Subscription",
          item_type: "subscription",
          source: "simulation",
          payload: { note: "Sample transaction 2" },
        },
      ];

      await supabaseAdmin.from("smart_credit_items").upsert(sampleData, {
        onConflict: "user_id,posted_at,amount,merchant,item_type,source",
      });

      // Complete dry run
      await supabaseAdmin.from("smart_credit_imports")
        .update({ status: "done", rows: 2, finished_at: new Date().toISOString() })
        .eq("run_id", runId);

      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "done",
        step: "completed",
        message: "Dry run completed successfully",
        progress: 100,
        metadata: { rows: 2, simulatedRows: 2 },
      });

      console.log(`[${runId}] Dry run completed with 2 sample rows`);
      
      const responseHeaders = new Headers({ ...headers, "Content-Type": "application/json", "x-run-id": runId });
      return new Response(
        JSON.stringify({ ok: true, runId, simulatedRows: 2 }),
        { status: 201, headers: responseHeaders }
      );
    }

    // Real import: get credentials
    const { data: cred } = await supabaseAdmin
      .from("smart_credit_credentials")
      .select("username_enc, password_enc, iv_user, iv_pass")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!cred || !cred.iv_user || !cred.iv_pass) {
      console.error(`[${runId}] No credentials found for user`);
      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "credentials",
        message: "No Smart Credit credentials found",
        progress: 0,
        metadata: { code: "E_NO_CREDENTIALS" },
      });
      return new Response(
        JSON.stringify({ ok: false, code: "E_NO_CREDENTIALS", detail: "No Smart Credit credentials found" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Decrypt credentials
    const key = await importKeyFromSecret();
    const username = await decryptCipher(cred.iv_user, cred.username_enc, key);
    const password = await decryptCipher(cred.iv_pass, cred.password_enc, key);

    // Get robot ID
    const { data: robotSetting } = await supabaseAdmin
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "browseai.robot_id")
      .maybeSingle();

    const robotId = robotSetting?.setting_value?.value || robotSetting?.setting_value;
    if (!robotId) {
      console.error(`[${runId}] No robot ID configured`);
      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "config",
        message: "Robot ID not configured",
        progress: 0,
        metadata: { code: "E_NO_ROBOT_ID" },
      });
      return new Response(
        JSON.stringify({ ok: false, code: "E_NO_ROBOT_ID", detail: "Robot ID not configured" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Start Browse.ai task
    console.log(`[${runId}] Starting Browse.ai task with robot ${robotId}`);
    
    const browseHeaders: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BROWSEAI_API_KEY}`,
    };
    if (BROWSEAI_WORKSPACE_ID) browseHeaders["x-browseai-workspace-id"] = BROWSEAI_WORKSPACE_ID;

    const taskPayload = {
      robotId,
      inputParameters: {
        smartCreditUsername: username,
        smartCreditPassword: password,
      },
      tags: [`run:${runId}`],
    };

    const resp = await fetch("https://api.browse.ai/v2/tasks", {
      method: "POST",
      headers: browseHeaders,
      body: JSON.stringify(taskPayload),
    });

    const taskResult = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error(`[${runId}] Browse.ai task creation failed:`, resp.status, taskResult);
      
      let code = "E_UPSTREAM_ERROR";
      if (resp.status === 401 || resp.status === 403) code = "E_AUTH_BAD_KEY";
      else if (resp.status === 404) code = "E_ROBOT_NOT_FOUND";
      else if (resp.status >= 500) code = "E_UPSTREAM_UNAVAILABLE";

      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "task_creation",
        message: taskResult?.message || `Browse.ai error: ${resp.status}`,
        progress: 0,
        metadata: { code, status: resp.status },
      });

      return new Response(
        JSON.stringify({ ok: false, code, detail: taskResult?.message || `Browse.ai error: ${resp.status}` }),
        { status: 502, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const taskId = taskResult?.result?.id;
    console.log(`[${runId}] Browse.ai task created: ${taskId}`);

    // Update status to running
    await supabaseAdmin.from("smart_credit_imports")
      .update({ task_id: taskId, status: "running" })
      .eq("run_id", runId);

    await supabaseAdmin.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "step",
      step: "running",
      message: "Browse.ai task started successfully",
      progress: 10,
      metadata: { taskId },
    });

    console.log(`[${runId}] Import started successfully`);
    
    const responseHeaders = new Headers({ ...headers, "Content-Type": "application/json", "x-run-id": runId });
    return new Response(
      JSON.stringify({ ok: true, runId }),
      { status: 201, headers: responseHeaders }
    );

  } catch (e: any) {
    console.error("smart-credit-import-start error:", e);
    return new Response(
      JSON.stringify({ ok: false, code: "E_INTERNAL", detail: "Internal server error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});