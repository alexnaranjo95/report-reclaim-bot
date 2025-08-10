import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import AccountHeader from "@/components/AccountHeader";
import { fetchLatestWithFallback, ingestCreditReport } from "@/services/NormalizedReportService";
import { CreditReportDashboard, CreditReportData } from "@/components/CreditReportDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { EnhancedProgressBar } from "@/components/EnhancedProgressBar";
import JsonView from "@/components/JsonView";


const FUNCTIONS_BASE = "https://rcrpqdhfawtpjicttgvx.functions.supabase.co/functions/v1";

const defaultDashboardData: CreditReportData = {
  reportHeader: { referenceNumber: "N/A", reportDate: "N/A", alerts: [] },
  personalInfo: { name: "N/A", aliases: [], birthDate: "N/A", addresses: [], employers: [] },
  creditScores: {},
  accountSummary: {
    totalAccounts: 0, openAccounts: 0, closedAccounts: 0,
    delinquentAccounts: 0, collectionsAccounts: 0,
    totalBalances: 0, monthlyPayments: 0, inquiries2Years: 0
  },
  accounts: [],
  inquiries: []
};

const mapToDashboard = (latest: any): CreditReportData => {
  const r = latest?.report ?? {};
  const counts = latest?.counts || {};
  const total = (counts.realEstate || 0) + (counts.revolving || 0) + (counts.other || 0);
  try {
    const accounts: any[] = [
      ...((r.accounts?.realEstate || []).map((a: any) => ({...a, type: "mortgage"}))),
      ...((r.accounts?.revolving || []).map((a: any) => ({...a, type: "revolving"}))),
      ...((r.accounts?.other || []).map((a: any) => ({...a, type: "installment"})))
    ].map((a: any, idx: number) => ({
      id: a.id || String(idx),
      creditor: a.creditor || a.creditor_name || "N/A",
      accountNumber: a.account_number_mask || a.account_number || "••••",
      type: a.type || a.category || "revolving",
      status: a.status || a.account_status || "open",
      balance: Number(a.balance || a.current_balance || 0) || 0,
      limit: Number(a.credit_limit || a.high_credit || 0) || undefined,
      paymentHistory: Array.isArray(a.two_year_history) ? a.two_year_history : [],
      dateOpened: a.opened_on || a.date_opened || "",
      lastReported: a.reported_on || a.last_active || "",
      lastPayment: a.last_payment_on || "",
      paymentAmount: Number(a.payment_amount || a.monthly_payment || 0) || 0,
      bureaus: Array.isArray(a.bureaus) ? a.bureaus : (a.bureau ? [a.bureau] : [])
    }));

    return {
      reportHeader: {
        referenceNumber: r.referenceNumber || latest?.runId || "N/A",
        reportDate: r.reportDate || latest?.collectedAt || new Date().toISOString(),
        alerts: Array.isArray(r.alerts) ? r.alerts : []
      },
      personalInfo: r.personalInfo || defaultDashboardData.personalInfo,
      creditScores: r.scores || r.creditScores || {},
      accountSummary: {
        totalAccounts: total,
        openAccounts: r.summary?.openAccounts || 0,
        closedAccounts: r.summary?.closedAccounts || 0,
        delinquentAccounts: r.summary?.delinquentAccounts || 0,
        collectionsAccounts: r.summary?.collectionsAccounts || 0,
        totalBalances: r.summary?.totalBalances || 0,
        monthlyPayments: r.summary?.monthlyPayments || 0,
        inquiries2Years: r.summary?.inquiries2Years || 0,
      },
      accounts,
      inquiries: r.inquiries || []
    };
  } catch {
    return defaultDashboardData;
  }
};

const CreditReportsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  
  const runId = searchParams.get("runId");

  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [latest, setLatest] = useState<any>(null);
  const [rows, setRows] = useState<number>(0);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  // Progress / SSE
  const [isProcessing, setIsProcessing] = useState<boolean>(!!runId);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = 3;
  const [currentStatus, setCurrentStatus] = useState<string>("connecting");

  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);
  const silenceRef = useRef<number | null>(null);
  const lastEventAtRef = useRef<number>(Date.now());


  const computeRows = (counts?: any) => (counts?.realEstate || 0) + (counts?.revolving || 0) + (counts?.other || 0);

  const refetchLatest = async () => {
    try {
      const data = await fetchLatestWithFallback(runId || undefined);
      const counts = (data as any)?.counts || {};
      const total = computeRows(counts);
      setLatest(data);
      setRows(total);
      setLoadedAt((data as any)?.collectedAt || new Date().toISOString());
      setErrorCode(total > 0 || (data as any)?.report ? null : "E_NO_REPORT");
      console.log("[CreditReports] latest source:", (data as any)?.source, "counts:", counts, "runId:", runId);
      if (total > 0 || (data as any)?.report) {
        setIsProcessing(false);
      }
    } catch (e: any) {
      setErrorCode(e?.code || "E_FETCH_FAILED");
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    refetchLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // SSE + silence fallback
  useEffect(() => {
    if (!runId) return;

    const url = `${FUNCTIONS_BASE}/smart-credit-import-stream?runId=${encodeURIComponent(runId)}`;
    try {
      const es = new EventSource(url);
      esRef.current = es;
      lastEventAtRef.current = Date.now();

      es.onmessage = (evt) => {
        lastEventAtRef.current = Date.now();
        const payload = (() => { try { return JSON.parse(evt.data); } catch { return {}; } })();
        const status = (payload?.status || "connecting") as string;
        // map status to steps
        const step = status === "connecting" ? 1 : status === "scraping" ? 2 : 3;
        setCurrentStep(step);
        setCurrentStatus(status);
        // snapshot/done triggers immediate refresh + custom event
        if (payload?.type === "snapshot" || payload?.type === "done") {
          window.dispatchEvent(new CustomEvent("credit_report_ingested", { detail: { runId } }));
          refetchLatest();
        }
      };
      es.onerror = () => {
        es.close();
        esRef.current = null;
      };

      // 15s silence fallback → start polling
      silenceRef.current = window.setInterval(() => {
        const silentMs = Date.now() - lastEventAtRef.current;
        if (silentMs > 15000 && !pollRef.current) {
          pollRef.current = window.setInterval(refetchLatest, 2000);
        }
      }, 5000);
    } catch {
      // ignore; polling will handle
      if (!pollRef.current) pollRef.current = window.setInterval(refetchLatest, 2000);
    }

    return () => {
      if (esRef.current) esRef.current.close();
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (silenceRef.current) window.clearInterval(silenceRef.current);
      esRef.current = null; pollRef.current = null; silenceRef.current = null;
    };
  }, [runId]);

  // Dry Run action
  const handleDryRun = async () => {
    try {
      await ingestCreditReport({ dryRun: true });
      await refetchLatest();
    } catch {}
  };



  const banner = useMemo(() => {
    if (loading) return null;
    if (errorCode || rows === 0) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
          No credit report data found
        </div>
      );
    }
    return (
      <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-success">
        Saved & Rendered at {loadedAt}
      </div>
    );
  }, [loading, errorCode, rows, loadedAt]);

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      <AccountHeader title={isProcessing ? "Importing Credit Report" : "Credit Report"} subtitle="Lossless view of your latest scraper payload" backTo="/" />
      <div className="container mx-auto px-6 py-8 space-y-6">
        <h1 id="credit-report-title" className="text-2xl font-semibold tracking-tight">{isProcessing ? "Importing Credit Report" : "Credit Report"}</h1>


        {runId && (
          <EnhancedProgressBar
            currentStep={currentStep}
            totalSteps={totalSteps}
            currentStatus={currentStatus}
            isProcessing={isProcessing}
            hasError={false}
          />
        )}

        {banner}

        <Separator />

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <>
            <CreditReportDashboard data={mapToDashboard(latest)} />

            {/* Consumer Statements */}
            <section className="space-y-3" data-testid="credit-report-statements">
              <h3 className="text-lg font-semibold">Consumer Statements</h3>
              <div className="rounded-md border bg-card p-4 space-y-2">
                {(latest?.report?.consumerStatements || []).length === 0 ? (
                  <p className="text-muted-foreground">N/A</p>
                ) : (
                  (latest?.report?.consumerStatements || []).map((s: any, i: number) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{s?.bureau || ""}</span>: {s?.statement || s?.text || "N/A"}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Creditor Addresses */}
            <section className="space-y-3" data-testid="credit-report-addresses">
              <h3 className="text-lg font-semibold">Creditor Addresses</h3>
              <div className="rounded-md border bg-card p-4 space-y-2">
                {(latest?.report?.addresses || []).length === 0 ? (
                  <p className="text-muted-foreground">N/A</p>
                ) : (
                  (latest?.report?.addresses || []).map((a: any, i: number) => (
                    <div key={i} className="text-sm">
                      {a?.creditor ? (<span className="font-medium">{a.creditor}:</span>) : null} {a?.address || a?.text || "N/A"}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* JSON Return panel (fail-open) */}
            <section className="space-y-3" data-testid="credit-report-raw">
              <h3 className="text-lg font-semibold">JSON Return</h3>
              <JsonView data={latest?.report ?? latest?.raw ?? latest?.remote ?? {}} />
            </section>

            {errorCode && (
              <div className="flex items-center gap-3">
                <Button variant="destructive" onClick={handleDryRun}>Dry Run</Button>
                <span className="text-sm text-muted-foreground">Error: {errorCode}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CreditReportsPage;
