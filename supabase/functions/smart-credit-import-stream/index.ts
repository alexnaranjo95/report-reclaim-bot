
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const defaultCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function parseAllowedOrigins() {
  const v = Deno.env.get("APP_ALLOWED_ORIGINS") || "";
  return v.split(",").map(s => s.trim()).filter(Boolean);
}
function setCorsOrigin(req: Request, headers: Headers) {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin");
  if (!allowed.length) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
}

function sseFormat(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const h = new Headers(defaultCors);
    setCorsOrigin(req, h);
    return new Response(null, { headers: h });
  }
  if (req.method !== "GET") {
    const h = new Headers(defaultCors);
    setCorsOrigin(req, h);
    return new Response("Method not allowed", { status: 405, headers: h });
  }

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const accessToken = url.searchParams.get("access_token") || req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";

  if (!runId) {
    const h = new Headers(defaultCors);
    setCorsOrigin(req, h);
    return new Response("Missing runId", { status: 400, headers: h });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: accessToken ? `Bearer ${accessToken}` : (req.headers.get("Authorization") || "") } },
  });

  // Verify access to run
  const { data: run, error: runErr } = await supabaseAuth
    .from("smart_credit_imports")
    .select("run_id")
    .eq("run_id", runId)
    .single();

  if (runErr || !run) {
    const h = new Headers(defaultCors);
    setCorsOrigin(req, h);
    return new Response("Forbidden", { status: 403, headers: h });
  }

  const body = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const h = new Headers(defaultCors);
      setCorsOrigin(req, h);
      let lastTs = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      let lastEventAt = Date.now();
      let closed = false;

      const push = (evt: unknown) => controller.enqueue(encoder.encode(sseFormat(evt)));

      // Send hello
      push({ type: "connected", ts: new Date().toISOString(), runId });

      const poll = async () => {
        if (closed) return;
        const { data, error } = await supabaseAuth
          .from("smart_credit_import_events")
          .select("*")
          .eq("run_id", runId)
          .gt("ts", lastTs)
          .order("ts", { ascending: true })
          .limit(200);
        if (!error && data && data.length) {
          for (const row of data) {
            push(row);
            lastTs = row.ts;
            lastEventAt = Date.now();
          }
        }
      };

      const pollInterval = setInterval(poll, 1500);

      const heartbeat = setInterval(() => {
        if (closed) return;
        push({ type: "heartbeat", ts: new Date().toISOString() });
        if (Date.now() - lastEventAt > 20000) {
          push({ type: "warn", step: "stalled", message: "No events for 20s", ts: new Date().toISOString() });
          lastEventAt = Date.now();
        }
      }, 5000);

      await poll();

      const cancel = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeat);
        controller.close();
      };

      const signal = (req as any).signal as AbortSignal | undefined;
      signal?.addEventListener("abort", cancel);
    },
  });

  const h = new Headers({
    ...defaultCors,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  setCorsOrigin(req, h);

  return new Response(body, { headers: h });
});
