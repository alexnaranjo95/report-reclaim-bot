
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const baseCors = {
  "Access-Control-Allow-Origin": "*", // refined dynamically
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-csrf-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseAllowedOrigins() {
  const v = Deno.env.get("APP_ALLOWED_ORIGINS") || "";
  return v.split(",").map(s => s.trim()).filter(Boolean);
}
function checkOrigin(req: Request, headers: Headers): boolean {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin");
  if (!allowed.length) {
    headers.set("Access-Control-Allow-Origin", "*");
    return true;
  }
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    return true;
  }
  return false;
}
function requireCsrf(req: Request) {
  const token = req.headers.get("x-csrf-token");
  return !!(token && token.length >= 8);
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
  if (raw.byteLength !== 32) throw new Error("SMART_CREDIT_KMS_KEY must be 32 bytes (base64-encoded)");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}
async function decryptCipher(ivB64: string, ctB64: string, key: CryptoKey) {
  const iv = decodeB64(ivB64);
  const ct = decodeB64(ctB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

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
  const headers = new Headers(baseCors);
  if (req.method === "OPTIONS") {
    checkOrigin(req, headers);
    return new Response(null, { headers });
  }
  if (!checkOrigin(req, headers)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  }
  if (!requireCsrf(req)) {
    return new Response(JSON.stringify({ error: "Missing CSRF header" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
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
      return new Response(JSON.stringify({ error: "Missing robotId" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    // Load and decrypt Smart Credit credentials server-side
    const { data: cred } = await supabaseAdmin
      .from("smart_credit_credentials")
      .select("username_enc, password_enc, iv")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!cred) {
      return new Response(JSON.stringify({ error: "No credentials saved" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const [ivUserB64, ivPassB64] = String(cred.iv || "").split(":");
    if (!ivUserB64 || !ivPassB64) {
      return new Response(JSON.stringify({ error: "Corrupt credentials" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const key = await importKeyFromSecret();
    const username = await decryptCipher(ivUserB64, cred.username_enc as string, key);
    const password = await decryptCipher(ivPassB64, cred.password_enc as string, key);

    // Create initial run row as the user (RLS will allow)
    const { data: runInsert, error: runErr } = await supabaseAuth
      .from("browseai_runs")
      .insert({ user_id: auth.user.id, robot_id: robotId, status: "queued", input_params: redact(inputParameters) })
      .select("id")
      .single();

    if (runErr || !runInsert) {
      console.error("Failed to create run:", runErr);
      return new Response(JSON.stringify({ error: "Failed to create run" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
    }
    const runId = runInsert.id as string;

    // Register in smart_credit_imports for tracking
    await supabaseAdmin
      .from("smart_credit_imports")
      .insert({ user_id: auth.user.id, run_id: runId, status: "queued", total_rows: 0 })
      .select("id")
      .maybeSingle();

    // Log init event (existing stream uses events)
    await supabaseAuth.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "init",
      step: "initialize",
      message: "Starting Smart Credit import",
      progress: 0,
      metrics: {},
    });

    // Trigger Browse.ai task, inject credentials into inputParameters (server-side only)
    const browseHeaders: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BROWSEAI_API_KEY}`,
    };
    if (BROWSEAI_WORKSPACE_ID) browseHeaders["x-browseai-workspace-id"] = BROWSEAI_WORKSPACE_ID;

    const payload = {
      robotId,
      inputParameters: { ...inputParameters, smartCreditUsername: username, smartCreditPassword: password },
      tags,
    };

    const resp = await fetch("https://api.browse.ai/v2/tasks", {
      method: "POST",
      headers: browseHeaders,
      body: JSON.stringify(payload),
    });

    const bodyJson = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Browse.ai task creation failed:", resp.status, bodyJson?.message || bodyJson);
      await supabaseAdmin.from("browseai_runs").update({ status: "failed", error: `Create task failed: ${resp.status}` }).eq("id", runId);
      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAuth.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "create_task",
        message: bodyJson?.messageCode || "Failed to create task",
        progress: 0,
      });
      return new Response(JSON.stringify({ error: "Browse.ai create task failed", runId }), { status: 502, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const taskId = bodyJson?.result?.id as string | undefined;

    await supabaseAdmin
      .from("browseai_runs")
      .update({ task_id: taskId ?? null, status: bodyJson?.result?.status ?? "in-progress" })
      .eq("id", runId);

    await supabaseAdmin
      .from("smart_credit_imports")
      .update({ task_id: taskId ?? null, status: bodyJson?.result?.status ?? "in-progress" })
      .eq("run_id", runId);

    await supabaseAuth.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "step",
      step: "start",
      message: "Browse.ai task started",
      progress: 5,
      metrics: {},
    });

    return new Response(JSON.stringify({ runId, taskId }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("smart-credit-import-start error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
