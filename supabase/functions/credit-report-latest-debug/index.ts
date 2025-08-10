import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ code: 405, message: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ code: "E_CONFIG", message: "Missing Supabase config" }, 500);
  }

  // Create client that carries through the user's JWT
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return json({ code: "E_AUTH", message: "Unauthorized" }, 401);
  }
  
  const userId = userData.user.id;

  try {
    // Get latest run for this user from normalized reports
    let lastRunId: string | null = null;
    let hasReport = false;
    let hasRaw = false;

    const { data: latestNorm } = await supabase
      .from("normalized_credit_reports")
      .select("run_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestNorm?.run_id) {
      lastRunId = latestNorm.run_id;
      hasReport = true;
    }

    // Fallback to raw reports if no normalized report found
    if (!lastRunId) {
      const { data: latestRaw } = await supabase
        .from("credit_reports_raw")
        .select("run_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (latestRaw?.run_id) {
        lastRunId = latestRaw.run_id;
        hasRaw = true;
      }
    }

    // Get counts by table for the latest run
    let countsByTable: Record<string, number> = {};
    
    if (lastRunId) {
      const [
        { count: cRep }, 
        { count: cScores }, 
        { count: cAcc }, 
        { count: cRaw }
      ] = await Promise.all([
        supabase.from("normalized_credit_reports").select("run_id", { count: "exact", head: true })
          .eq("user_id", userId).eq("run_id", lastRunId),
        supabase.from("normalized_credit_scores").select("run_id", { count: "exact", head: true })
          .eq("user_id", userId).eq("run_id", lastRunId),
        supabase.from("normalized_credit_accounts").select("run_id", { count: "exact", head: true })
          .eq("user_id", userId).eq("run_id", lastRunId),
        supabase.from("credit_reports_raw").select("run_id", { count: "exact", head: true })
          .eq("user_id", userId).eq("run_id", lastRunId),
      ]);

      countsByTable = {
        normalized_credit_reports: cRep ?? 0,
        normalized_credit_scores: cScores ?? 0,
        normalized_credit_accounts: cAcc ?? 0,
        credit_reports_raw: cRaw ?? 0,
      };
      
      hasReport = (cRep ?? 0) > 0 || hasReport;
      hasRaw = (cRaw ?? 0) > 0 || hasRaw;
    }

    return json({ 
      ok: true, 
      lastRunId, 
      hasRaw, 
      hasReport, 
      countsByTable,
      userId 
    });

  } catch (error: any) {
    console.error("credit-report-latest-debug error:", error);
    return json({ 
      code: "E_UNEXPECTED", 
      message: error?.message || "Unexpected error",
      lastRunId: null,
      hasRaw: false,
      hasReport: false,
      countsByTable: {}
    }, 500);
  }
});