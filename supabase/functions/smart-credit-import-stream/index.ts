import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Content-Type": "text/event-stream",
};

const encoder = new TextEncoder();

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const robotId = url.searchParams.get("robotId") || Deno.env.get("BROWSE_AI_ROBOT_ID") || Deno.env.get("BROWSEAI_ROBOT_ID") || undefined;

  if (!runId) {
    return new Response(JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "runId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const heartbeat = () => send({ type: "heartbeat", ts: Date.now() });

      send({ type: "init", runId, robotId: robotId ?? null, ts: Date.now() });

      let lastPercent = 0;
      let rowsSent = 0;
      const heartbeatId = setInterval(heartbeat, 5000);

      const abort = () => {
        clearInterval(heartbeatId);
        try { controller.close(); } catch {}
      };

      const poll = async () => {
        try {
          // Call existing proxy function to avoid duplicating auth logic
          const statusRes = await fetch("https://rcrpqdhfawtpjicttgvx.functions.supabase.co/functions/v1/browseai-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId, robotId }),
          });

          if (!statusRes.ok) {
            const txt = await statusRes.text();
            send({ type: "warn", code: "UPSTREAM_UNAVAILABLE", message: txt });
            return;
          }
          const status = await statusRes.json();
          const s = (status?.status as string) || "in-progress";

          // Progress mapping heuristic
          if (s === "queued") lastPercent = Math.max(lastPercent, 5);
          if (s === "in-progress") lastPercent = Math.max(lastPercent + 5, 10);
          if (s === "successful") lastPercent = 100;

          send({ type: "progress", status: s, percent: Math.min(lastPercent, 99), ts: Date.now() });

          // Emit data snapshot if present and not yet emitted too many rows
          const result = status?.result;
          let items: any[] | undefined = undefined;
          if (Array.isArray(result?.items)) items = result.items;
          else if (Array.isArray(result?.capturedLists)) items = result.capturedLists;

          if (items && items.length > 0 && rowsSent < items.length) {
            const next = items.slice(rowsSent, Math.min(items.length, rowsSent + 25));
            rowsSent += next.length;
            send({ type: "data:snapshot", rows: next, total: items.length, ts: Date.now() });
          }

          if (s === "failed") {
            send({ type: "error", code: status?.errorMessage ? "UPSTREAM_UNAVAILABLE" : "UNKNOWN", message: status?.errorMessage || "Task failed" });
            abort();
            return;
          }
          if (s === "successful") {
            send({ type: "done", rows: rowsSent, ts: Date.now() });
            abort();
            return;
          }
        } catch (e) {
          send({ type: "error", code: "UNKNOWN", message: (e as Error).message });
          // keep stream alive; next tick will retry
        }
      };

      // Poll loop
      const loop = async () => {
        while (true) {
          await poll();
          await new Promise((r) => setTimeout(r, 2000));
        }
      };

      loop();
    },
    cancel() {},
  });

  return new Response(stream, { headers: corsHeaders });
});
