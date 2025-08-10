import { supabase } from "@/integrations/supabase/client";
import type { CreditReport } from "./BrowseAINormalizer";

function isCreditReportRoute() {
  if (typeof window === 'undefined') return true;
  const p = window.location?.pathname || '';
  return p === '/credit-report' || p === '/credit-report/';
}

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

  // Upsert accounts across categories; unique (user_id, bureau, creditor, account_number_mask, opened_on, category)
  const allAccounts = [
    ...(report.accounts?.realEstate || []).map((a: any) => ({ ...a, category: 'realEstate' })),
    ...(report.accounts?.revolving || []).map((a: any) => ({ ...a, category: 'revolving' })),
    ...(report.accounts?.other || []).map((a: any) => ({ ...a, category: 'other' })),
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
      category: a.category ?? null,
      payload: a,
    }));
    const { error } = await supabase.from("normalized_credit_accounts").upsert(rows);
    if (error) throw new Error(error.message);
  }
}

export async function fetchLatestNormalized(runId: string) {
  if (!isCreditReportRoute()) {
    return { runId: null, collectedAt: null, version: "v1", report: null, counts: { realEstate: 0, revolving: 0, other: 0 } };
  }
  const { data, error } = await supabase.functions.invoke("credit-report-latest", {
    body: { runId },
  });
  if (error) {
    const status = (error as any)?.context?.response?.status;
    const code = (data as any)?.code;
    if (status === 404 || code === "E_NOT_FOUND") {
      return {
        runId: null,
        collectedAt: null,
        version: "v1",
        report: null,
        counts: { realEstate: 0, revolving: 0, other: 0 },
      };
    }
    const message = ((data as any)?.message || (data as any)?.error || error.message) as string;
    throw new Error(message);
  }
  const rawCounts = (data as any)?.counts;
  const flattenedCounts = rawCounts?.accounts ? rawCounts.accounts : rawCounts;
  return { ...(data as any), counts: flattenedCounts } as { runId: string | null; collectedAt: string | null; version: string; report: any; counts?: any };
}

export async function fetchLatestNormalizedByUser(userId: string) {
  if (!isCreditReportRoute()) {
    return { runId: null, collectedAt: null, version: "v1", report: null, counts: { realEstate: 0, revolving: 0, other: 0 } };
  }
  const { data, error } = await supabase.functions.invoke("credit-report-latest", {
    body: { userId },
  });
  if (error) {
    const status = (error as any)?.context?.response?.status;
    const code = (data as any)?.code;
    if (status === 404 || code === "E_NOT_FOUND") {
      return {
        runId: null,
        collectedAt: null,
        version: "v1",
        report: null,
        counts: { realEstate: 0, revolving: 0, other: 0 },
      };
    }
    const message = ((data as any)?.message || (data as any)?.error || error.message) as string;
    throw new Error(message);
  }
  const rawCounts = (data as any)?.counts;
  const flattenedCounts = rawCounts?.accounts ? rawCounts.accounts : rawCounts;
  return { ...(data as any), counts: flattenedCounts } as { runId: string | null; collectedAt: string | null; version: string; report: any; counts?: any };
}
export async function fetchAccountsByCategory(category: string, limit = 50, cursor?: string) {
  if (!isCreditReportRoute()) {
    return { items: [], nextCursor: null } as { items: any[]; nextCursor?: string | null };
  }
  const { data, error } = await supabase.functions.invoke("credit-report-accounts", {
    body: { category, limit, cursor },
  });
  if (error) throw new Error(((data as any)?.error as string) || error.message);
  return data as { items: any[]; nextCursor?: string | null };
}

export async function ingestCreditReport(payload: any) {
  const { data, error } = await supabase.functions.invoke("credit-report-ingest", {
    body: payload,
  });
  if (error) throw new Error(((data as any)?.message as string) || error.message);
  return data as { ok: boolean; runId: string };
}
