import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-role-key",
};

type IngestBody = {
  runId?: string;
  userId?: string;
  collectedAt?: string;
  payload?: any;
  dryRun?: boolean | number | string;
};

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripHtml(input: any): { text: string | null; html: string | null } {
  if (input == null) return { text: null, html: null };
  const html = String(input);
  const text = html.replace(/<[^>]*>/g, "").trim();
  return { text, html };
}

function toDateISO(v?: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ code: "E_CONFIG", message: "Missing Supabase config" }, 500);
    }

    // Enforce service role only via custom header
    const providedServiceKey = req.headers.get("x-service-role-key");
    if (!providedServiceKey || providedServiceKey !== serviceKey) {
      return json({ code: "E_RLS_DENIED", message: "Service role required" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as IngestBody;
    const runId = body.runId?.trim();
    const userId = body.userId?.trim();
    const dryRun = body.dryRun === true || body.dryRun === 1 || body.dryRun === "1";

    if (!dryRun) {
      if (!runId || !userId || !body.payload) {
        return json({ code: "E_SCHEMA_INVALID", message: "runId, userId and payload are required" }, 400);
      }
    }

    const supabaseService = createClient(supabaseUrl, serviceKey);

    const collectedAt = toDateISO(body.collectedAt) ?? new Date().toISOString();

    // Sample data path for dry run
    if (dryRun) {
      const sampleRunId = runId ?? `dry_${Date.now()}`;
      const sampleUserId = userId ?? crypto.randomUUID();

      const sampleReport = {
        runId: sampleRunId,
        collectedAt,
        version: "v1",
        report: {
          scores: [
            { bureau: "TransUnion", score: 712, status: "ACTIVE", position: 1 },
            { bureau: "Equifax", score: 705, status: "ACTIVE", position: 2 },
            { bureau: "Experian", score: 698, status: "ACTIVE", position: 3 },
          ],
          consumerStatements: [
            { bureau: "TransUnion", statement: null },
            { bureau: "Experian", statement: null },
            { bureau: "Equifax", statement: null },
          ],
          accounts: {
            realEstate: [
              {
                bureau: "TransUnion",
                creditor: "ABC Mortgage",
                account_number_mask: "****1234",
                opened_on: collectedAt,
                reported_on: collectedAt,
                balance: 250000,
                high_balance: 300000,
                credit_limit: null,
                past_due: 0,
                status: "Open",
                account_status: "Current",
                payment_status: "Pays as agreed",
                remarks: [],
                two_year_history: {},
                days_late_7y: { "30": 0, "60": 0, "90": 0 },
                position: 1,
                category: "realEstate",
              },
            ],
            revolving: [
              {
                bureau: "Experian",
                creditor: "XYZ Bank",
                account_number_mask: "****5678",
                opened_on: collectedAt,
                reported_on: collectedAt,
                balance: 450,
                high_balance: 1200,
                credit_limit: 2000,
                past_due: 0,
                status: "Open",
                account_status: "Current",
                payment_status: "Pays as agreed",
                remarks: ["No late payments"],
                two_year_history: {},
                days_late_7y: { "30": 0, "60": 0, "90": 0 },
                position: 1,
                category: "revolving",
              },
            ],
            other: [],
          },
          rawSections: {},
        },
      };

      // Raw payload row
      await supabaseService.from("credit_reports_raw").upsert({
        run_id: sampleRunId,
        user_id: sampleUserId,
        collected_at: collectedAt,
        raw_json: sampleReport.report,
      }, { onConflict: "run_id" });

      // Report row (normalized_credit_reports)
      await supabaseService.from("normalized_credit_reports").delete().eq("run_id", sampleRunId).eq("user_id", sampleUserId);
      const { error: insRepErr } = await supabaseService.from("normalized_credit_reports").insert({
        run_id: sampleRunId,
        user_id: sampleUserId,
        collected_at: collectedAt,
        version: "v1",
        report_json: sampleReport.report,
      });
      if (insRepErr) return json({ code: "E_DB_UPSERT", message: insRepErr.message }, 500);

      // Scores
      const scoresRows = sampleReport.report.scores.map((s: any, i: number) => ({
        user_id: sampleUserId,
        run_id: sampleRunId,
        bureau: s.bureau,
        score: s.score,
        status: s.status,
        position: s.position ?? i + 1,
        collected_at: collectedAt,
      }));
      const { error: scErr } = await supabaseService
        .from("normalized_credit_scores")
        .upsert(scoresRows, { onConflict: "user_id,bureau,run_id" });
      if (scErr) return json({ code: "E_DB_UPSERT", message: scErr.message }, 500);

      // Accounts
      const allAcc: any[] = [
        ...sampleReport.report.accounts.realEstate,
        ...sampleReport.report.accounts.revolving,
        ...sampleReport.report.accounts.other,
      ];
      const accRows = allAcc.map((a: any) => ({
        user_id: sampleUserId,
        run_id: sampleRunId,
        bureau: a.bureau ?? null,
        creditor: a.creditor ?? null,
        account_number_mask: a.account_number_mask ?? null,
        opened_on: a.opened_on ? a.opened_on.substring(0, 10) : null,
        reported_on: a.reported_on ? a.reported_on.substring(0, 10) : null,
        last_activity_on: a.last_activity_on ? a.last_activity_on.substring(0, 10) : null,
        balance: a.balance,
        high_balance: a.high_balance,
        credit_limit: a.credit_limit,
        closed_on: a.closed_on ? a.closed_on.substring(0, 10) : null,
        account_status: a.account_status,
        payment_status: a.payment_status,
        dispute_status: a.dispute_status,
        past_due: a.past_due,
        payment_amount: a.payment_amount,
        last_payment_on: a.last_payment_on ? a.last_payment_on.substring(0, 10) : null,
        term_length_months: a.term_length_months,
        account_type: a.account_type,
        payment_frequency: a.payment_frequency,
        account_rating: a.account_rating,
        description: a.description,
        remarks: a.remarks || [],
        two_year_history: a.two_year_history || {},
        days_late_7y: a.days_late_7y || { "30": 0, "60": 0, "90": 0 },
        status: a.status,
        position: a.position,
        collected_at: collectedAt,
        category: a.category ?? null,
        payload: a,
      }));
      const { error: accErr } = await supabaseService
        .from("normalized_credit_accounts")
        .upsert(accRows, { onConflict: "user_id,creditor,account_number_mask,bureau,opened_on,category" });
      if (accErr) return json({ code: "E_DB_UPSERT", message: accErr.message }, 500);

      return json({ ok: true, runId: sampleRunId });
    }

    // Normal path
    const rawPayload = body.payload;

    // Basic validation
    if (typeof rawPayload !== "object") {
      return json({ code: "E_SCHEMA_INVALID", message: "payload must be an object" }, 400);
    }

    // Persist raw
    {
      const { error } = await supabaseService.from("credit_reports_raw").upsert(
        { run_id: runId!, user_id: userId!, collected_at: collectedAt, raw_json: rawPayload },
        { onConflict: "run_id" },
      );
      if (error) return json({ code: "E_DB_UPSERT", message: error.message }, 500);
    }

    // Normalize minimal: preserve raw in rawSections for audit
    const report = { rawSections: rawPayload, scores: [] as any[], consumerStatements: [] as any[], accounts: { realEstate: [] as any[], revolving: [] as any[], other: [] as any[] }, inquiries: [], collections: [], addresses: [] } as any;

    // Extremely permissive mapping for scores
    try {
      const lists: any[] = rawPayload?.capturedLists ?? [];
      for (const lst of lists) {
        const name = String(lst?.name ?? "").toLowerCase();
        if (name.includes("score")) {
          const items = lst?.items ?? [];
          for (const it of items) {
            const braw = it?.bureau ?? it?.Bureau ?? it?.source ?? "";
            const bureau = String(braw).match(/experian|equifax|transunion/i)?.[0] ?? "";
            const scoreVal = Number(String(it?.score ?? it?.value ?? it?.Score ?? "").replace(/[^0-9]/g, "")) || null;
            report.scores.push({ bureau: bureau ? bureau[0].toUpperCase() + bureau.slice(1).toLowerCase() : "", score: scoreVal, status: it?.status ?? it?.Status ?? null, position: it?.position ?? null });
          }
        }
        if (name.startsWith("consumer stateme")) {
          const items = lst?.items ?? [];
          for (const it of items) {
            report.consumerStatements.push({ bureau: it?.bureau ?? it?.Bureau ?? null, statement: stripHtml(it?.statement ?? it?.Statement).text });
          }
        }
        if (name.startsWith("real estate") || name.startsWith("revolving") || name.startsWith("other")) {
          const category = name.startsWith("real estate") ? "realEstate" : name.startsWith("revolving") ? "revolving" : "other";
          const items = lst?.items ?? [];
          for (const it of items) {
            const base = {
              bureau: it?.bureau ?? it?.Bureau ?? null,
              creditor: it?.creditor ?? it?.Creditor ?? it?.name ?? null,
              account_number_mask: it?.account_number_mask ?? it?.mask ?? it?.account ?? null,
              opened_on: toDateISO(it?.opened_on ?? it?.opened ?? it?.["date opened"]) ?? null,
              reported_on: toDateISO(it?.reported_on ?? it?.reported ?? it?.["last reported"]) ?? null,
              last_activity_on: toDateISO(it?.last_activity_on ?? it?.["last active"]) ?? null,
              balance: Number(it?.balance ?? it?.Balance ?? it?.current_balance ?? null) || null,
              high_balance: Number(it?.high_balance ?? it?.highest_balance ?? null) || null,
              credit_limit: Number(it?.credit_limit ?? it?.limit ?? null) || null,
              past_due: Number(it?.past_due ?? it?.past_due_amount ?? 0) || 0,
              status: it?.status ?? null,
              account_status: it?.account_status ?? null,
              payment_status: it?.payment_status ?? null,
              description: it?.description ?? null,
              remarks: it?.remarks ?? [],
              two_year_history: it?.two_year_history ?? {},
              days_late_7y: it?.days_late_7y ?? { "30": 0, "60": 0, "90": 0 },
              position: it?.position ?? null,
              category,
            };
            (report.accounts[category] as any[]).push(base);
          }
        }
      }
    } catch (_) {
      // If mapping fails, continue with raw only
    }

    // Upsert normalized report (delete then insert to ensure idempotency without unique)
    await supabaseService.from("normalized_credit_reports").delete().eq("run_id", runId!).eq("user_id", userId!);
    {
      const { error } = await supabaseService.from("normalized_credit_reports").insert({
        run_id: runId!,
        user_id: userId!,
        collected_at: collectedAt,
        version: "v1",
        report_json: report,
      });
      if (error) return json({ code: "E_DB_UPSERT", message: error.message }, 500);
    }

    // Upsert scores
    if (Array.isArray(report.scores) && report.scores.length) {
      const rows = report.scores.map((s: any, i: number) => ({
        user_id: userId!,
        run_id: runId!,
        bureau: s.bureau,
        score: s.score ?? null,
        status: s.status ?? null,
        position: s.position ?? i + 1,
        collected_at: collectedAt,
      }));
      const { error } = await supabaseService
        .from("normalized_credit_scores")
        .upsert(rows, { onConflict: "user_id,bureau,run_id" });
      if (error) return json({ code: "E_DB_UPSERT", message: error.message }, 500);
    }

    // Upsert accounts
    const allAccounts: any[] = [
      ...(report.accounts?.realEstate || []),
      ...(report.accounts?.revolving || []),
      ...(report.accounts?.other || []),
    ];
    if (allAccounts.length) {
      const rows = allAccounts.map((a: any) => ({
        user_id: userId!,
        run_id: runId!,
        bureau: a.bureau ?? null,
        creditor: a.creditor ?? null,
        account_number_mask: a.account_number_mask ?? null,
        opened_on: a.opened_on ? a.opened_on.substring(0, 10) : null,
        reported_on: a.reported_on ? a.reported_on.substring(0, 10) : null,
        last_activity_on: a.last_activity_on ? a.last_activity_on.substring(0, 10) : null,
        balance: a.balance,
        high_balance: a.high_balance,
        credit_limit: a.credit_limit,
        closed_on: a.closed_on ? a.closed_on.substring(0, 10) : null,
        account_status: a.account_status,
        payment_status: a.payment_status,
        dispute_status: a.dispute_status,
        past_due: a.past_due,
        payment_amount: a.payment_amount,
        last_payment_on: a.last_payment_on ? a.last_payment_on.substring(0, 10) : null,
        term_length_months: a.term_length_months,
        account_type: a.account_type,
        payment_frequency: a.payment_frequency,
        account_rating: a.account_rating,
        description: a.description,
        remarks: a.remarks || [],
        two_year_history: a.two_year_history || {},
        days_late_7y: a.days_late_7y || { "30": 0, "60": 0, "90": 0 },
        status: a.status,
        position: a.position,
        collected_at: collectedAt,
        category: a.category ?? null,
        payload: a,
      }));
      const { error } = await supabaseService
        .from("normalized_credit_accounts")
        .upsert(rows, { onConflict: "user_id,creditor,account_number_mask,bureau,opened_on,category" });
      if (error) return json({ code: "E_DB_UPSERT", message: error.message }, 500);
    }

    return json({ ok: true, runId });
  } catch (err) {
    console.error("credit-report-ingest error", err);
    return json({ code: "E_UNEXPECTED", message: (err as any)?.message || "Unexpected error" }, 500);
  }
});
