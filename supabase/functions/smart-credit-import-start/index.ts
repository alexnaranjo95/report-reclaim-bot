
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ulid } from "https://deno.land/x/ulid@v0.3.0/mod.ts";

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

    const url = new URL(req.url);
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
      .select("username_enc, password_enc, iv, iv_user, iv_pass")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!cred) {
      return new Response(JSON.stringify({ error: "No credentials saved" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const combined = String((cred as any).iv || "");
    const [ivUserLegacy, ivPassLegacy] = combined ? combined.split(":") : [undefined, undefined];
    const ivUserB64 = (cred as any).iv_user || ivUserLegacy;
    const ivPassB64 = (cred as any).iv_pass || ivPassLegacy;
    if (!ivUserB64 || !ivPassB64) {
      return new Response(JSON.stringify({ error: "Corrupt credentials" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const key = await importKeyFromSecret();
    const username = await decryptCipher(ivUserB64, (cred as any).username_enc as string, key);
    const password = await decryptCipher(ivPassB64, (cred as any).password_enc as string, key);

    // Generate ULID runId and register in smart_credit_imports (service role bypasses RLS)
    const runId = ulid();
    await supabaseAdmin
      .from("smart_credit_imports")
      .insert({ user_id: auth.user.id, run_id: runId, status: "starting", total_rows: 0, started_at: new Date().toISOString() })
      .select("id")
      .maybeSingle();

    // Emit init event
    await supabaseAdmin.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "status",
      step: "starting",
      message: "Starting Smart Credit import",
      progress: 0,
      metrics: {},
    });

    // Dry-run simulation path
    const dryRun = url.searchParams.get("dryRun");
    if (dryRun === "1" || dryRun === "true") {
      await supabaseAdmin.from("smart_credit_imports").update({ status: "running" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "status",
        step: "running",
        message: "Dry-run: simulating data",
        progress: 25,
      });

      const nowIso = new Date().toISOString();
      const sample = [
        { posted_at: nowIso, amount: 42.5, merchant: "DryRun Utilities", item_type: "utility", source: "simulation", payload: { note: "sample 1" } },
        { posted_at: nowIso, amount: 19.99, merchant: "DryRun Subscription", item_type: "subscription", source: "simulation", payload: { note: "sample 2" } },
      ];

      await supabaseAdmin.from("smart_credit_items").upsert([
        { user_id: auth.user.id, run_id: runId, list_key: "dryRun", item_index: 0, ...sample[0] },
        { user_id: auth.user.id, run_id: runId, list_key: "dryRun", item_index: 1, ...sample[1] },
      ]);

      await supabaseAdmin
        .from("smart_credit_imports")
        .update({ status: "done", rows: 2, finished_at: new Date().toISOString() })
        .eq("run_id", runId);

      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "status",
        step: "done",
        message: "Dry-run complete",
        progress: 100,
        metrics: { rows: 2 },
      });

      const hdrs = new Headers({ ...headers, "Content-Type": "application/json", "x-run-id": runId });
      return new Response(JSON.stringify({ ok: true, runId, simulatedRows: 2 }), { status: 201, headers: hdrs });
    }

    // Trigger Browse.ai task, inject credentials into inputParameters (server-side only)
    const browseHeaders: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BROWSEAI_API_KEY}`,
    };
    if (BROWSEAI_WORKSPACE_ID) browseHeaders["x-browseai-workspace-id"] = BROWSEAI_WORKSPACE_ID;

    const payload = {
      robotId,
      inputParameters: { ...inputParameters, smartCreditUsername: username, smartCreditPassword: password },
      tags: Array.isArray(tags) ? [...tags, `run:${runId}`] : [`run:${runId}`],
    };

    const resp = await fetch("https://api.browse.ai/v2/tasks", {
      method: "POST",
      headers: browseHeaders,
      body: JSON.stringify(payload),
    });

    const bodyJson = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Browse.ai task creation failed:", resp.status, bodyJson?.message || bodyJson);
      const status = resp.status;
      let code = "UPSTREAM_UNAVAILABLE";
      if (status === 401 || status === 403) code = "AUTH_BAD_KEY";
      else if (status === 404) code = "ROBOT_NOT_FOUND";
      else if (status >= 500) code = "UPSTREAM_UNAVAILABLE";

      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "create_task",
        message: String(bodyJson?.message || bodyJson?.messageCode || code),
        progress: 0,
        metrics: { status },
      });
      const hdrs = new Headers({ ...headers, "Content-Type": "application/json", "x-run-id": runId });
      return new Response(JSON.stringify({ ok: false, code, detail: bodyJson?.message || bodyJson }), { status: 502, headers: hdrs });
    }

    const taskId = bodyJson?.result?.id as string | undefined;

    await supabaseAdmin
      .from("smart_credit_imports")
      .update({ task_id: taskId ?? null, status: "running" })
      .eq("run_id", runId);

    await supabaseAdmin.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "status",
      step: "running",
      message: "Browse.ai task started",
      progress: 10,
      metrics: {},
    });

    const hdrs = new Headers({ ...headers, "Content-Type": "application/json", "x-run-id": runId });
    return new Response(JSON.stringify({ ok: true, runId }), { status: 201, headers: hdrs });
  } catch (e: any) {
    console.error("smart-credit-import-start error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
