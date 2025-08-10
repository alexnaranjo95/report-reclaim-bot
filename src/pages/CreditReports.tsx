import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import AccountHeader from "@/components/AccountHeader";
import { fetchLatestNormalized, ingestCreditReport } from "@/services/NormalizedReportService";
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
  const navigate = useNavigate();
  const runId = searchParams.get("runId");

  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [latest, setLatest] = useState<any>(null);
  const [rows, setRows] = useState<number>(0);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  // Progress / SSE
  const [isProcessing, setIsProcessing] = useState<boolean>(!!runId);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = 10;
  const [currentStatus, setCurrentStatus] = useState<string>("uploading");

  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);
  const silenceRef = useRef<number | null>(null);
  const lastEventAtRef = useRef<number>(Date.now());

  // Credentials UI
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [credsSaved, setCredsSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const computeRows = (counts?: any) => (counts?.realEstate || 0) + (counts?.revolving || 0) + (counts?.other || 0);

  const refetchLatest = async () => {
    try {
      const data = await fetchLatestNormalized(runId || undefined as any);
      const counts = (data as any)?.counts || {};
      const total = computeRows(counts);
      setLatest(data);
      setRows(total);
      setLoadedAt((data as any)?.collectedAt || new Date().toISOString());
      setErrorCode(total > 0 || (data as any)?.report ? null : "E_NO_REPORT");
      console.log("[CreditReports] latest counts:", counts, "runId:", runId);
      if (total > 0) {
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
        // advance progress heuristically
        setCurrentStep((s) => Math.min(totalSteps, s + 1));
        setCurrentStatus(payload?.status || "parsing");
        // snapshot/done triggers immediate refresh
        if (payload?.type === "snapshot" || payload?.type === "done") {
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

  // Save credentials
  const saveCreds = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/smart-credit-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) {
        setCredsSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };
  const resetCreds = async () => {
    await fetch(`${FUNCTIONS_BASE}/smart-credit-credentials/reset`, { method: "POST" });
    setCredsSaved(false);
    setUsername("");
    setPassword("");
  };

  // Start Import flow
  const startImport = async () => {
    const res = await fetch(`${FUNCTIONS_BASE}/smart-credit-connect-and-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const j = await res.json().catch(() => ({}));
    if (j?.ok && j?.runId) {
      navigate(`/credit-report?runId=${encodeURIComponent(j.runId)}`);
    }
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
        Loaded {rows} rows at {loadedAt}
      </div>
    );
  }, [loading, errorCode, rows, loadedAt]);

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      <AccountHeader title="Credit Report" subtitle="Lossless view of your latest scraper payload" backTo="/" />
      <div className="container mx-auto px-6 py-8 space-y-6">
        <h1 id="credit-report-title" className="text-2xl font-semibold tracking-tight">Credit Report</h1>

        {/* Credentials + Import Controls (does not block rendering) */}
        <div className="rounded-lg border bg-card text-card-foreground p-4">
          {!credsSaved ? (
            <div className="flex flex-col md:flex-row items-start md:items-end gap-3">
              <div className="flex flex-col gap-1 w-full md:w-64">
                <label className="text-sm text-muted-foreground">Username</label>
                <input className="px-3 py-2 rounded-md border bg-background" value={username} onChange={e=>setUsername(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1 w-full md:w-64">
                <label className="text-sm text-muted-foreground">Password</label>
                <input className="px-3 py-2 rounded-md border bg-background" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
              </div>
              <Button onClick={saveCreds} disabled={saving || !username || !password}>Save</Button>
              <Button variant="secondary" onClick={startImport} disabled={!username || !password}>Connect & Import</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm">Credentials saved • {username ? `${username.slice(0,2)}***` : "***"}</div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={startImport}>Start Import</Button>
                <Button variant="outline" onClick={resetCreds}>Reset</Button>
              </div>
            </div>
          )}
        </div>

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

            {/* Raw JSON viewer */}
            <section className="space-y-3" data-testid="credit-report-raw">
              <h3 className="text-lg font-semibold">Raw JSON</h3>
              <JsonView data={latest?.report ?? {}} />
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
