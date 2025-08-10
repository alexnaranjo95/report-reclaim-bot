import { supabase } from "@/integrations/supabase/client";
import type { CreditReport } from "./BrowseAINormalizer";

export async function saveRawReport(runId: string, userId: string, raw: any) {
  const { error } = await supabase
    .from("credit_reports_raw")
    .upsert({ run_id: runId, user_id: userId, raw_json: raw })
    .select()
    .single();
  if (error) throw new Error(error.message);
}

export async function saveNormalizedReport(userId: string, report: CreditReport) {
  // Upsert main normalized report
  const { error: repErr } = await supabase
    .from("normalized_credit_reports")
    .upsert({
      run_id: report.runId,
      user_id: userId,
      collected_at: report.collectedAt,
      version: report.version,
      report_json: report as any,
    })
    .select()
    .single();
  if (repErr) throw new Error(repErr.message);

  // Upsert scores (unique by user_id, run_id, bureau, position)
  if (Array.isArray(report.scores)) {
    const rows = report.scores.map((s) => ({
      user_id: userId,
      run_id: report.runId,
      bureau: s.bureau,
      score: s.score,
      status: s.status,
      position: s.position,
      collected_at: report.collectedAt,
    }));
    if (rows.length) {
      const { error } = await supabase.from("normalized_credit_scores").upsert(rows);
      if (error) throw new Error(error.message);
    }
  }

  // Upsert accounts across categories; unique (user_id, bureau, creditor, account_number_mask, opened_on)
  const allAccounts = [
    ...(report.accounts?.realEstate || []),
    ...(report.accounts?.revolving || []),
    ...(report.accounts?.other || []),
  ];
  if (allAccounts.length) {
    const rows = allAccounts.map((a) => ({
      user_id: userId,
      run_id: report.runId,
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
      collected_at: report.collectedAt,
    }));
    const { error } = await supabase.from("normalized_credit_accounts").upsert(rows);
    if (error) throw new Error(error.message);
  }
}

export async function fetchLatestNormalized(runId: string) {
  const { data, error } = await supabase.functions.invoke("credit-report-latest", {
    body: { runId },
  });
  if (error) throw new Error(((data as any)?.error as string) || error.message);
  return data as { runId: string; collectedAt: string; version: string; report: any };
}
