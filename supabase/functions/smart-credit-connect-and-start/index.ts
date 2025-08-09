import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseAllowedOrigins() {
  const v = Deno.env.get("APP_ALLOWED_ORIGINS") || "";
  return v.split(",").map((s) => s.trim()).filter(Boolean);
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

function encodeB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function importKeyFromSecret(): Promise<CryptoKey> {
  const b64 = Deno.env.get("SMART_CREDIT_KMS_KEY");
  if (!b64) throw new Error("Missing SMART_CREDIT_KMS_KEY");
  const raw = decodeB64(b64);
  if (raw.byteLength !== 32) throw new Error("SMART_CREDIT_KMS_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptPlaintext(plaintext: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc));
  return { ivB64: encodeB64(iv), ctB64: encodeB64(ct) };
}

function validateBody(body: any): { username?: string; password?: string; errors: string[] } {
  const errors: string[] = [];
  let username: string | undefined;
  let password: string | undefined;

  if (!body || typeof body !== "object") {
    errors.push("Invalid request body");
    return { errors };
  }
  if (typeof body.username !== "string") {
    errors.push("Username must be a string");
  } else {
    username = body.username.trim();
    if (username.length < 3) errors.push("Username must be at least 3 characters");
    if (username.length > 128) errors.push("Username must not exceed 128 characters");
  }
  if (typeof body.password !== "string") {
    errors.push("Password must be a string");
  } else {
    password = body.password;
    if (password.length < 8) errors.push("Password must be at least 8 characters");
    if (password.length > 256) errors.push("Password must not exceed 256 characters");
  }
  return { username, password, errors };
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
      { status: 405, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SMART_CREDIT_KMS_KEY = Deno.env.get("SMART_CREDIT_KMS_KEY");
    const APP_ALLOWED_ORIGINS = Deno.env.get("APP_ALLOWED_ORIGINS");
    const BROWSEAI_API_KEY = Deno.env.get("BROWSEAI_API_KEY");
    const BROWSEAI_WORKSPACE_ID = Deno.env.get("BROWSEAI_WORKSPACE_ID") || undefined;

    if (!SMART_CREDIT_KMS_KEY || !APP_ALLOWED_ORIGINS) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_CONFIG_MISSING", detail: "Server configuration incomplete" }),
        { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    // CORS validation
    const allowed = parseAllowedOrigins();
    const origin = req.headers.get("Origin");
    if (allowed.length && (!origin || !allowed.includes(origin))) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_CORS", detail: "Origin not allowed" }),
        { status: 403, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    // Auth check
    const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: auth, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !auth?.user) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_AUTH_REQUIRED", detail: "Authentication required" }),
        { status: 401, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "1";

    // Parse + validate
    const body = await req.json().catch(() => null);
    const { username, password, errors } = validateBody(body);
    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_SCHEMA_INVALID", detail: errors.join(", ") }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Create runId & import row first
    const runId = crypto.randomUUID();

    const { error: insertError } = await supabaseAdmin.from("smart_credit_imports").insert({
      user_id: auth.user.id,
      run_id: runId,
      status: "starting",
      total_rows: 0,
      started_at: new Date().toISOString(),
    });
    if (insertError) {
      console.error(`[${runId}] Failed to create import record`, insertError?.code);
      return new Response(
        JSON.stringify({ ok: false, code: "E_DB_INSERT", detail: "Failed to create import record" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    // Initial event
    await supabaseAdmin.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "init",
      step: "starting",
      message: "Connect and start initialized",
      progress: 0,
      metadata: { dryRun },
    });

    // Save credentials (encrypt) atomically per user
    let key: CryptoKey;
    try {
      key = await importKeyFromSecret();
    } catch (e) {
      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "encryption",
        message: "Encryption key error",
        progress: 0,
        metadata: { code: "E_KMS_KEY" },
      });
      return new Response(
        JSON.stringify({ ok: false, code: "E_KMS_KEY", detail: "Encryption key error" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } },
      );
    }

    const userEnc = await encryptPlaintext(username!, key);
    const passEnc = await encryptPlaintext(password!, key);

    const { error: upsertError } = await supabaseAdmin
      .from("smart_credit_credentials")
      .upsert(
        {
          user_id: auth.user.id,
          username_enc: userEnc.ctB64,
          password_enc: passEnc.ctB64,
          iv_user: userEnc.ivB64,
          iv_pass: passEnc.ivB64,
          key_version: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      console.error(`[${runId}] Credential upsert error`, upsertError?.code);
      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "credentials",
        message: "Failed to save credentials",
        progress: 0,
        metadata: { code: "E_DB_UPSERT" },
      });
      return new Response(
        JSON.stringify({ ok: false, code: "E_DB_UPSERT", detail: "Failed to save credentials" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } },
      );
    }

    // Dry run path: prove DB/UI wiring without calling BrowseAI
    if (dryRun) {
      await supabaseAdmin.from("smart_credit_imports").update({ status: "running" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "step",
        step: "simulating",
        message: "Generating sample data",
        progress: 50,
        metadata: { phase: "simulation" },
      });

      const nowIso = new Date().toISOString();
      const sampleData = [
        { user_id: auth.user.id, run_id: runId, list_key: "dryRun", item_index: 0, posted_at: nowIso, amount: 42.5, merchant: "DryRun Utilities", item_type: "utility", source: "simulation", payload: { note: "Sample transaction 1" } },
        { user_id: auth.user.id, run_id: runId, list_key: "dryRun", item_index: 1, posted_at: nowIso, amount: 19.99, merchant: "DryRun Subscription", item_type: "subscription", source: "simulation", payload: { note: "Sample transaction 2" } },
      ];
      await supabaseAdmin.from("smart_credit_items").upsert(sampleData, { onConflict: "user_id,posted_at,amount,merchant,item_type,source" });

      await supabaseAdmin.from("smart_credit_imports").update({ status: "done", total_rows: 2, finished_at: new Date().toISOString() }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "done",
        step: "completed",
        message: "Dry run completed successfully",
        progress: 100,
        metadata: { rows: 2, simulatedRows: 2 },
      });

      const responseHeaders = new Headers({ ...headers, "Content-Type": "application/json", "x-run-id": runId });
      return new Response(JSON.stringify({ ok: true, runId, simulatedRows: 2 }), { status: 201, headers: responseHeaders });
    }

    // Start BrowseAI task using provided credentials (diagnostics events with redaction)
    if (!BROWSEAI_API_KEY) {
      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      return new Response(
        JSON.stringify({ ok: false, code: "E_CONFIG_MISSING", detail: "BROWSEAI_API_KEY not configured" }),
        { status: 503, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } },
      );
    }

    // Get robot ID from admin_settings
    const { data: robotSetting } = await supabaseAdmin
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "browseai.robot_id")
      .maybeSingle();
    const robotId = robotSetting?.setting_value?.value || robotSetting?.setting_value;
    if (!robotId) {
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
        { status: 500, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } },
      );
    }

    const browseHeaders: HeadersInit = { "Content-Type": "application/json", Authorization: `Bearer ${BROWSEAI_API_KEY}` };
    if (BROWSEAI_WORKSPACE_ID) (browseHeaders as any)["X-Workspace-Id"] = BROWSEAI_WORKSPACE_ID;

    const taskPayload = {
      inputParameters: { username, password },
      tags: [`run:${runId}`],
    } as const;

    // Emit redacted request diagnostic
    await supabaseAdmin.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "diagnostic",
      step: "browseai.request",
      message: "Dispatching BrowseAI task",
      progress: 5,
      metadata: {
        url: `https://api.browse.ai/v2/robots/${robotId}/tasks`,
        method: "POST",
        headers: { authorization: "Bearer ****", ...(BROWSEAI_WORKSPACE_ID ? { "X-Workspace-Id": "***" } : {}) },
        payloadKeys: ["username", "password"],
      },
    });

    const resp = await fetch(`https://api.browse.ai/v2/robots/${encodeURIComponent(String(robotId))}/tasks`, { method: "POST", headers: browseHeaders, body: JSON.stringify(taskPayload) });
    const taskResult = await resp.json().catch(() => ({}));

    // Emit response diagnostic (redacted)
    await supabaseAdmin.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "diagnostic",
      step: "browseai.response",
      message: "BrowseAI responded",
      progress: 7,
      metadata: { status: resp.status, taskId: taskResult?.result?.id ?? null, jobId: taskResult?.result?.jobId ?? null, message: taskResult?.message },
    });

    if (!resp.ok) {
      let code = "E_UPSTREAM_UNAVAILABLE";
      if (resp.status === 401 || resp.status === 403) code = "E_AUTH_BAD_KEY";
      else if (resp.status === 404) code = "E_ROBOT_NOT_FOUND";
      else if (resp.status === 400 || resp.status === 422) code = "E_INPUT_INVALID";

      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "task_creation",
        message: taskResult?.message || `BrowseAI error: ${resp.status}`,
        progress: 0,
        metadata: { code, status: resp.status },
      });

      return new Response(
        JSON.stringify({ ok: false, code, detail: taskResult?.message || `BrowseAI error: ${resp.status}` }),
        { status: 502, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } },
      );
    }

    const taskId: string | undefined = taskResult?.result?.id;
    const jobId: string | undefined = taskResult?.result?.jobId ?? taskResult?.result?.job?.id;

    // Record browseai_runs with the same runId for 1:1 correlation
    try {
      const sanitizedInput = { username };
      await supabaseAdmin.from("browseai_runs").insert({
        id: runId,
        user_id: auth.user.id,
        robot_id: String(robotId),
        task_id: taskId,
        status: taskResult?.status || "queued",
        input_params: sanitizedInput,
      });
    } catch (err) {
      console.warn(`[${runId}] Failed to insert browseai_runs:`, err);
    }

    await supabaseAdmin.from("smart_credit_imports").update({ status: "running", task_id: taskId, job_id: jobId }).eq("run_id", runId);
    await supabaseAdmin.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "step",
      step: "running",
      message: "BrowseAI task started",
      progress: 10,
      metadata: { taskId, jobId },
    });

    const responseHeaders = new Headers({ ...headers, "Content-Type": "application/json", "x-run-id": runId });
    return new Response(JSON.stringify({ ok: true, runId, browseai: { taskId, jobId } }), { status: 201, headers: responseHeaders });
  } catch (e) {
    console.error("connect-and-start error:", e);
    return new Response(
      JSON.stringify({ ok: false, code: "E_INTERNAL", detail: "Internal server error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }
});