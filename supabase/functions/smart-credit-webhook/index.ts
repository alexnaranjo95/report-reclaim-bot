import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-run-id, x-supabase-api-version, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
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

function redact(obj: any) {
  try {
    const clone: any = JSON.parse(JSON.stringify(obj || {}));
    const mask = (o: any) => {
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (v && typeof v === "object") mask(v);
        const key = k.toLowerCase();
        if (key.includes("password") || key.includes("secret") || key.includes("token")) o[k] = "******";
      }
    };
    mask(clone);
    return clone;
  } catch {
    return {};
  }
}

serve(async (req: Request) => {
  const headers = new Headers(cors);
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Determine runId early to include in all responses
  const url = new URL(req.url);
  const bodyClone = await req.clone().json().catch(() => ({}));
  const runId = url.searchParams.get("runId") || req.headers.get("x-run-id") || bodyClone.runId;

try {
  if (!runId) {
    return new Response(JSON.stringify({ ok: false, code: "MISSING_RUN_ID" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }


    // Ensure import exists and get user
    const { data: imp, error: impErr } = await supabaseAdmin
      .from("smart_credit_imports")
      .select("user_id, status")
      .eq("run_id", runId)
      .maybeSingle();
    if (impErr || !imp) {
      return new Response(JSON.stringify({ ok: false, code: "RUN_NOT_FOUND" }), { status: 404, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } });
    }

    const body = (await req.json().catch(() => ({}))) as any;

    // Extract items
    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    const lists = body?.capturedLists && typeof body.capturedLists === "object" ? body.capturedLists : {};
    const listKeys = Object.keys(lists);

    const normalized: any[] = [];
    let totalIncoming = 0;

    if (items.length) {
      totalIncoming += items.length;
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        const posted = it.posted_at || it.postedAt || it.date || new Date().toISOString();
        const amount = typeof it.amount === "number" ? it.amount : Number(it.amount ?? 0) || null;
        const merchant = it.merchant || it.description || it.name || null;
        const item_type = it.item_type || it.type || "unknown";
        const source = it.source || "scraper";
        normalized.push({
          user_id: imp.user_id,
          run_id: runId,
          list_key: body?.listKey || null,
          item_index: i,
          posted_at: new Date(posted).toISOString(),
          amount,
          merchant,
          item_type,
          source,
          payload: it,
        });
      }
    }

    for (const key of listKeys) {
      const arr: any[] = Array.isArray(lists[key]?.items) ? lists[key].items : [];
      totalIncoming += arr.length;
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i] || {};
        const posted = it.posted_at || it.postedAt || it.date || new Date().toISOString();
        const amount = typeof it.amount === "number" ? it.amount : Number(it.amount ?? 0) || null;
        const merchant = it.merchant || it.description || it.name || null;
        const item_type = it.item_type || it.type || key;
        const source = it.source || "scraper";
        normalized.push({
          user_id: imp.user_id,
          run_id: runId,
          list_key: key,
          item_index: i,
          posted_at: new Date(posted).toISOString(),
          amount,
          merchant,
          item_type,
          source,
          payload: it,
        });
      }
    }

    // If nothing to upsert, still mark running/done and warn
    if (!normalized.length) {
      await supabaseAdmin.from("smart_credit_imports").update({ status: "done", finished_at: new Date().toISOString(), rows: 0 }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "warn",
        step: "empty",
        message: "Webhook received 0 rows",
        metrics: { totalIncoming },
      });
      return new Response(JSON.stringify({ ok: true, runId, rows: 0 }), { status: 200, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } });
    }

    // Upsert deterministically
    const { error: upErr } = await supabaseAdmin
      .from("smart_credit_items")
      .upsert(normalized, { ignoreDuplicates: false, onConflict: "user_id,posted_at,amount,merchant,item_type,source" });
    if (upErr) {
      console.error("webhook upsert error:", upErr);
      await supabaseAdmin.from("smart_credit_imports").update({ status: "failed" }).eq("run_id", runId);
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "error",
        step: "upsert",
        message: "Failed to upsert items",
        payload: { error: upErr.message },
      });
      return new Response(JSON.stringify({ ok: false, code: "E_UPSERT_FAILED" }), { status: 200, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } });
    }

    // Count rows for this run
    const { count } = await supabaseAdmin
      .from("smart_credit_items")
      .select("id", { count: "exact", head: true })
      .eq("run_id", runId);

    // Update import status and counters
    const final = body?.status === "completed" || body?.completed === true || new URL(req.url).searchParams.get("final") === "1";
    await supabaseAdmin
      .from("smart_credit_imports")
      .update({ status: final ? "done" : "running", rows: count ?? normalized.length, finished_at: final ? new Date().toISOString() : null })
      .eq("run_id", runId);

    // Emit snapshot event
    await supabaseAdmin.from("smart_credit_import_events").insert({
      run_id: runId,
      type: "data:snapshot",
      step: final ? "done" : "running",
      message: final ? `Import completed with ${count ?? 0} rows` : `Received ${normalized.length} rows`,
      progress: final ? 100 : 50,
      metrics: { rows: count ?? normalized.length },
      sample: normalized.slice(0, 5).map(r => ({ posted_at: r.posted_at, amount: r.amount, merchant: r.merchant, item_type: r.item_type })),
      payload: { lists: Object.keys(lists), items: totalIncoming },
    });

    return new Response(JSON.stringify({ ok: true, runId, rows: count ?? normalized.length }), { status: 200, headers: { ...headers, "Content-Type": "application/json", "x-run-id": runId } });
  } catch (e: any) {
    console.error("smart-credit-webhook error:", e?.message || e);
    return new Response(JSON.stringify({ ok: false, code: "E_INTERNAL" }), { status: 200, headers: { ...headers, "Content-Type": "application/json", ...(runId ? { "x-run-id": runId } : {}) } });
  }
});
