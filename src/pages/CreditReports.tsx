import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import AccountHeader from "@/components/AccountHeader";
import { fetchLatestWithFallback, ingestCreditReport } from "@/services/NormalizedReportService";
import { CreditReportDashboard, CreditReportData } from "@/components/CreditReportDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { EnhancedProgressBar } from "@/components/EnhancedProgressBar";
import JsonView from "@/components/JsonView";
import { startRun } from "@/lib/browseAi";
import { toast } from "sonner";

const FUNCTIONS_BASE = "https://rcrpqdhfawtpjicttgvx.functions.supabase.co";

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

    // Extract credit scores from the report
    const creditScores: any = {};
    if (Array.isArray(r.scores)) {
      r.scores.forEach((score: any) => {
        const bureau = score.bureau?.toLowerCase();
        if (bureau && score.score) {
          creditScores[bureau] = {
            score: score.score,
            rank: score.status || "Unknown",
            factors: []
          };
        }
      });
    }

    return {
      reportHeader: {
        referenceNumber: r.referenceNumber || latest?.runId || "N/A",
        reportDate: r.reportDate || latest?.collectedAt || new Date().toISOString(),
        alerts: Array.isArray(r.alerts) ? r.alerts : []
      },
      personalInfo: r.personalInfo || defaultDashboardData.personalInfo,
      creditScores,
      accountSummary: {
        totalAccounts: total,
        openAccounts: accounts.filter(a => a.status === 'open').length,
        closedAccounts: accounts.filter(a => a.status === 'closed').length,
        delinquentAccounts: accounts.filter(a => a.status === 'delinquent').length,
        collectionsAccounts: accounts.filter(a => a.status === 'collection').length,
        totalBalances: accounts.reduce((sum, a) => sum + a.balance, 0),
        monthlyPayments: accounts.reduce((sum, a) => sum + a.paymentAmount, 0),
        inquiries2Years: (r.inquiries || []).length,
      },
      accounts,
      inquiries: (r.inquiries || []).map((inq: any, idx: number) => ({
        id: String(idx),
        creditor: inq.inquirer_name || inq.creditor || "N/A",
        date: inq.inquiry_date || inq.date || "",
        type: inq.inquiry_type || inq.type || "hard",
        purpose: inq.purpose || ""
      }))
    };
  } catch (error) {
    console.error("Error mapping dashboard data:", error);
    return defaultDashboardData;
  }
};

const CreditReportsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const runId = searchParams.get("runId");

  // Form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Data state
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [latest, setLatest] = useState<any>(null);
  const [rows, setRows] = useState<number>(0);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  // Progress state
  const [isProcessing, setIsProcessing] = useState<boolean>(!!runId);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = 3;
  const [currentStatus, setCurrentStatus] = useState<string>("connecting");

  // Refs for cleanup
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
      
      // Log data counts for verification
      console.log(`[CreditReports] Data loaded - Source: ${(data as any)?.source}, Accounts: ${total}, RunId: ${runId}`);
      
      if (total > 0 || (data as any)?.report) {
        setIsProcessing(false);
        setCurrentStep(3);
        setCurrentStatus("done");
      }
    } catch (e: any) {
      console.error("[CreditReports] Fetch error:", e);
      setErrorCode(e?.code || "E_FETCH_FAILED");
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    refetchLatest();
  }, [runId]);

  // SSE + silence fallback for real-time updates
  useEffect(() => {
    if (!runId) return;

    const url = `${FUNCTIONS_BASE}/smart-credit-import-stream?runId=${encodeURIComponent(runId)}`;
    
    try {
      const es = new EventSource(url);
      esRef.current = es;
      lastEventAtRef.current = Date.now();

      es.onmessage = (evt) => {
        lastEventAtRef.current = Date.now();
        
        try {
          const payload = JSON.parse(evt.data);
          const status = (payload?.status || "connecting") as string;
          
          // Map status to progress steps
          const step = status === "connecting" ? 1 : status === "scraping" ? 2 : 3;
          setCurrentStep(step);
          setCurrentStatus(status);
          
          // Trigger refresh on snapshot/done events
          if (payload?.type === "snapshot" || payload?.type === "done") {
            window.dispatchEvent(new CustomEvent("credit_report_ingested", { detail: { runId } }));
            refetchLatest();
          }
        } catch (parseError) {
          console.warn("[CreditReports] SSE parse error:", parseError);
        }
      };

      es.onerror = () => {
        console.log("[CreditReports] SSE connection error, closing");
        es.close();
        esRef.current = null;
      };

      // 15s silence fallback → start polling
      silenceRef.current = window.setInterval(() => {
        const silentMs = Date.now() - lastEventAtRef.current;
        if (silentMs > 15000 && !pollRef.current) {
          console.log("[CreditReports] SSE silent for 15s, starting polling");
          setCurrentStatus("checking");
          pollRef.current = window.setInterval(refetchLatest, 2000);
        }
      }, 5000);
    } catch (sseError) {
      console.warn("[CreditReports] SSE setup failed, using polling:", sseError);
      if (!pollRef.current) {
        pollRef.current = window.setInterval(refetchLatest, 2000);
      }
    }

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (silenceRef.current) {
        window.clearInterval(silenceRef.current);
        silenceRef.current = null;
      }
    };
  }, [runId]);

  // Form submission handler
  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsStarting(true);
    
    try {
      const { runId: newRunId } = await startRun({ username, password });
      
      // Immediately navigate to show progress
      navigate(`/credit-report?runId=${encodeURIComponent(newRunId)}`);
      
      // Set processing state
      setIsProcessing(true);
      setCurrentStep(1);
      setCurrentStatus("connecting");
      
      toast.success("Import started successfully");
    } catch (err: any) {
      console.error("[CreditReports] Start error:", err);
      setFormError(err?.message || "Failed to start import");
      toast.error("Failed to start import", { description: err?.message });
    } finally {
      setIsStarting(false);
    }
  };

  // Dry run handler for testing
  const handleDryRun = async () => {
    try {
      await ingestCreditReport({ dryRun: true });
      await refetchLatest();
      toast.success("Dry run completed");
    } catch (error: any) {
      console.error("[CreditReports] Dry run error:", error);
      toast.error("Dry run failed", { description: error?.message });
    }
  };

  // Status banner
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
        Saved & Rendered at {loadedAt ? new Date(loadedAt).toLocaleString() : 'Unknown'}
      </div>
    );
  }, [loading, errorCode, rows, loadedAt]);

  return (
    <div className="min-h-screen bg-gradient-dashboard" data-testid="credit-report-root">
      <AccountHeader 
        title={isProcessing ? "Importing Credit Report" : "Credit Report"} 
        subtitle="Real-time credit data import and analysis" 
        backTo="/" 
      />
      
      <div className="container mx-auto px-6 py-8 space-y-6">
        <h1 id="credit-report-title" className="text-2xl font-semibold tracking-tight">
          {isProcessing ? "Importing Credit Report" : "Credit Report"}
        </h1>

        {/* Smart Credit Connection Form */}
        <section className="rounded-md border bg-card p-4 space-y-3" aria-labelledby="smart-credit-connect">
          <h2 id="smart-credit-connect" className="text-base font-medium">Smart Credit Connection</h2>
          <p className="text-sm text-muted-foreground">
            Enter your Smart Credit credentials to import your latest credit report data
          </p>
          
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={handleStart}>
            <div className="flex flex-col gap-1">
              <label htmlFor="sc-username" className="text-sm font-medium">Username</label>
              <Input 
                id="sc-username" 
                type="text" 
                required 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your Smart Credit username"
                disabled={isStarting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sc-password" className="text-sm font-medium">Password</label>
              <Input 
                id="sc-password" 
                type="password" 
                required 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your Smart Credit password"
                disabled={isStarting}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Button 
                type="submit" 
                disabled={isStarting || !username.trim() || !password.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {isStarting ? "Connecting..." : "Connect & Import"}
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleDryRun}
                disabled={isStarting}
              >
                Dry Run
              </Button>
              
              {formError && (
                <span className="text-destructive text-sm">{formError}</span>
              )}
            </div>
          </form>
        </section>

        {/* Progress Display */}
        <div data-testid="smart-import-progress">
          <EnhancedProgressBar
            currentStep={currentStep}
            totalSteps={totalSteps}
            currentStatus={currentStatus}
            isProcessing={isProcessing}
            hasError={!!errorCode}
            extractedDataPreview={rows > 0 ? {
              personalInfoCount: 1,
              accountsCount: rows,
              inquiriesCount: (latest?.report?.inquiries || []).length,
              negativeItemsCount: 0
            } : undefined}
          />
        </div>

        {/* Status Banner */}
        {banner}

        <Separator />

        {/* Main Content */}
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <>
            {/* Credit Report Dashboard */}
            <div data-testid="credit-report-scores" />
            <div data-testid="credit-report-accounts">
              <CreditReportDashboard data={mapToDashboard(latest)} />
            </div>

            {/* Consumer Statements */}
            <section className="space-y-3" data-testid="credit-report-statements">
              <h3 className="text-lg font-semibold">Consumer Statements</h3>
              <div className="rounded-md border bg-card p-4 space-y-2">
                {(latest?.report?.consumerStatements || []).length === 0 ? (
                  <p className="text-muted-foreground">No consumer statements reported</p>
                ) : (
                  (latest?.report?.consumerStatements || []).map((s: any, i: number) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{s?.bureau || "Unknown Bureau"}</span>: {s?.statement || "NONE REPORTED"}
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
                  <p className="text-muted-foreground">No creditor addresses available</p>
                ) : (
                  (latest?.report?.addresses || []).map((a: any, i: number) => (
                    <div key={i} className="text-sm">
                      {a?.creditor && (
                        <span className="font-medium">{a.creditor}: </span>
                      )}
                      {a?.address || a?.text || "Address not available"}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* JSON Return Panel */}
            <section className="space-y-3" data-testid="credit-report-raw">
              <h3 className="text-lg font-semibold">Raw Data</h3>
              <details className="rounded-md border bg-card p-0">
                <summary className="cursor-pointer list-none rounded-md bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80">
                  Toggle Raw JSON Data
                </summary>
                <div className="p-4">
                  <JsonView data={latest?.report ?? latest?.raw ?? latest ?? {}} />
                </div>
              </details>
            </section>

            {/* Error Actions */}
            {errorCode && (
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-md">
                <Button variant="outline" onClick={handleDryRun}>
                  Test Connection
                </Button>
                <span className="text-sm text-muted-foreground">
                  Error: {errorCode} - Try the test connection to verify the system is working
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CreditReportsPage;