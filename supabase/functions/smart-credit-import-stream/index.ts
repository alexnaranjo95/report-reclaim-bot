import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "text/event-stream",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const gone = { ok: false, code: "GONE", message: "This SSE endpoint has been removed" };
  return new Response(`data: ${JSON.stringify(gone)}\n\n`, { status: 410, headers: corsHeaders });
});
