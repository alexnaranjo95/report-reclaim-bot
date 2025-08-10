import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Extract auth user from bearer for validation
    const authHeader = req.headers.get("authorization");
    let authUserId: string | null = null;
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data } = await supabase.auth.getUser(token);
        authUserId = data.user?.id ?? null;
      } catch (_) {
        // ignore, verify_jwt=true will already block invalid tokens
      }
    }

    // Accept userId/runId via query or body
    const url = new URL(req.url);
    const qpRunId = url.searchParams.get("runId") || undefined;
    const qpUserId = url.searchParams.get("userId") || undefined;

    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};
    const bodyRunId = body?.runId as string | undefined;
    const bodyUserId = body?.userId as string | undefined;

    const runId = bodyRunId ?? qpRunId;
    let userId = bodyUserId ?? qpUserId ?? authUserId ?? undefined;

    if (!userId && !runId) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_INPUT", message: "Provide userId or runId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If userId provided, it must match auth user
    if (userId && authUserId && userId !== authUserId) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_RLS_DENIED", message: "User mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query latest raw payload
    if (runId) {
      const { data, error } = await supabase
        .from("credit_reports_raw")
        .select("run_id, user_id, collected_at, raw_json")
        .eq("run_id", runId)
        .maybeSingle();

      if (error) {
        console.error("DB error", error);
        return new Response(
          JSON.stringify({ ok: false, code: "E_DB_SELECT", message: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({ ok: false, code: "E_NOT_FOUND", message: "No payload for runId" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true, runId: data.run_id, userId: data.user_id, collectedAt: data.collected_at, raw: data.raw_json }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // By userId (use auth user if not explicitly provided)
    userId = userId ?? authUserId!;

    const { data, error } = await supabase
      .from("credit_reports_raw")
      .select("run_id, user_id, collected_at, raw_json")
      .eq("user_id", userId)
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("DB error", error);
      return new Response(
        JSON.stringify({ ok: false, code: "E_DB_SELECT", message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_NOT_FOUND", message: "No payload for user" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, runId: data.run_id, userId: data.user_id, collectedAt: data.collected_at, raw: data.raw_json }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("Unexpected error", e);
    return new Response(
      JSON.stringify({ ok: false, code: "E_UNEXPECTED", message: e?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
