import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnon) {
      return new Response(JSON.stringify({ error: "Missing Supabase config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    let runId: string | null = null;
    let userId: string | null = null;
    if (req.method === "GET") {
      runId = url.searchParams.get("runId");
      userId = url.searchParams.get("userId");
    } else {
      const body = await req.json().catch(() => ({}));
      runId = body?.runId ?? null;
      userId = body?.userId ?? null;
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    if (!runId && !userId) {
      return new Response(JSON.stringify({ error: "runId or userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (runId) {
      const { data, error } = await supabase
        .from("normalized_credit_reports")
        .select("run_id, user_id, collected_at, version, report_json")
        .eq("run_id", runId)
        .maybeSingle();

      if (error) {
        const msg = error.message || "Database error";
        const isRls = /permission denied/i.test(msg);
        const code = isRls ? "E_RLS_DENIED" : "E_DB_SELECT";
        const status = isRls ? 403 : 500;
        return new Response(JSON.stringify({ code, message: msg }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!data) {
        return new Response(JSON.stringify({ code: "E_NOT_FOUND", message: "Report not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          runId: data.run_id,
          collectedAt: data.collected_at,
          version: data.version,
          report: data.report_json,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Latest by user
    const { data: latest, error: latestErr } = await supabase
      .from("normalized_credit_reports")
      .select("run_id, user_id, collected_at, version, report_json")
      .eq("user_id", userId)
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      const msg = latestErr.message || "Database error";
      const isRls = /permission denied/i.test(msg);
      const code = isRls ? "E_RLS_DENIED" : "E_DB_SELECT";
      const status = isRls ? 403 : 500;
      return new Response(JSON.stringify({ code, message: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!latest) {
      return new Response(
        JSON.stringify({
          runId: null,
          collectedAt: null,
          version: "v1",
          report: null,
          counts: { realEstate: 0, revolving: 0, other: 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Derived counts
    const [reCnt, rvCnt, otCnt] = await Promise.all([
      supabase.from("normalized_credit_accounts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("category", "realEstate"),
      supabase.from("normalized_credit_accounts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("category", "revolving"),
      supabase.from("normalized_credit_accounts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("category", "other"),
    ]);

    const counts = {
      accounts: {
        realEstate: reCnt.count ?? 0,
        revolving: rvCnt.count ?? 0,
        other: otCnt.count ?? 0,
      },
    };

    return new Response(
      JSON.stringify({
        runId: latest.run_id,
        collectedAt: latest.collected_at,
        version: latest.version,
        report: latest.report_json,
        counts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("credit-report-latest error", (err as any)?.message || err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
