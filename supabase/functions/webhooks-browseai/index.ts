import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sanitizePayload(payload: any) {
  try {
    const clone = JSON.parse(JSON.stringify(payload));
    const redactKeys = ["password", "pass", "credential", "secret"];
    const walk = (obj: any) => {
      if (obj && typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          if (redactKeys.some((r) => k.toLowerCase().includes(r))) obj[k] = "******";
          else walk(obj[k]);
        }
      }
    };
    walk(clone);
    return clone;
  } catch {
    return {};
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    // Browse.ai webhook example structure may vary; try common fields
    const taskId: string | undefined = body?.result?.id || body?.taskId || body?.id;
    const status: string | undefined = body?.result?.status || body?.status;
    const createdAtMs: number | undefined = body?.result?.createdAt;
    const finishedAtMs: number | undefined = body?.result?.finishedAt;
    const capturedLists = body?.result?.capturedLists || body?.capturedLists || {};

    if (!taskId) {
      return new Response(JSON.stringify({ error: "Missing taskId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find run by task_id
    const { data: run, error: runErr } = await supabaseAdmin
      .from("browseai_runs")
      .select("id, user_id, status, created_at")
      .eq("task_id", taskId)
      .maybeSingle();

    if (runErr || !run) {
      console.warn("No matching run for taskId", taskId, runErr);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const runId = run.id as string;

    // Progress step
    if (status) {
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: status === "completed" ? "done" : status === "failed" ? "error" : "step",
        step: status,
        message: `Task ${status}`,
        progress: status === "completed" ? 100 : undefined,
      });
    }

    // Snapshot all captured lists and optionally land full rows (24h TTL)
    let totalRowsImported = 0;
    try {
      const listKeys = Object.keys(capturedLists || {});
      for (const key of listKeys) {
        const items: any[] = Array.isArray(capturedLists[key]?.items)
          ? capturedLists[key].items
          : [];
        const count = items.length;
        totalRowsImported += count;

        if (count > 0) {
          // Per-list snapshot event
          await supabaseAdmin.from("smart_credit_import_events").insert({
            run_id: runId,
            type: "data:snapshot",
            step: `data:${key}`,
            message: `Received ${count} rows in ${key}`,
            metrics: { rows: count, list: key },
            sample: items.slice(0, 5),
            payload: sanitizePayload({ key, count }),
          });

          // Bulk land items into temporary rows table
          const rows = items.map((item, idx) => ({
            run_id: runId,
            list_key: key,
            item_index: idx,
            item,
          }));
          // Insert in chunks to avoid payload limits
          const chunkSize = 500;
          for (let i = 0; i < rows.length; i += chunkSize) {
            const batch = rows.slice(i, i + chunkSize);
            const { error: insertErr } = await supabaseAdmin
              .from("smart_credit_import_rows")
              .insert(batch);
            if (insertErr) console.warn("Failed to insert import rows batch:", insertErr);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to process captured lists:", e);
    }

    // Update run row
    const runtimeSec = createdAtMs && finishedAtMs ? Math.max(0, Math.round((finishedAtMs - createdAtMs) / 1000)) : null;
    await supabaseAdmin
      .from("browseai_runs")
      .update({
        status: status ?? run.status,
        raw_result: sanitizePayload(body),
        webhook_received_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (status === "completed") {
      await supabaseAdmin.from("smart_credit_import_events").insert({
        run_id: runId,
        type: "metric",
        step: "summary",
        message: "Import completed",
        progress: 100,
        metrics: { rows: totalRowsImported, runtimeSec },
        payload: sanitizePayload(body?.result || body),
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("webhooks-browseai error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
