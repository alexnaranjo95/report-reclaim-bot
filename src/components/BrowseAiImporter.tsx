import React, { useCallback, useEffect, useRef, useState } from "react";
import JsonView from "@/components/JsonView";
import TableView from "@/components/TableView";
import DashboardView from "@/components/DashboardView";
import { APP_CONFIG, isMockMode } from "@/config";
import { getRunStatus, startRun, BrowseAiStatus } from "@/lib/browseAi";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const Button = (
  {
    children,
    variant = "default",
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "secondary" | "outline" }
) => {
  const base = "inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4";
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:opacity-90 border border-transparent",
    secondary: "bg-secondary text-secondary-foreground hover:opacity-90 border border-transparent",
    outline: "border bg-transparent hover:bg-muted",
  };
  return (
    <button className={`${base} ${variants[variant] ?? variants.default}`} {...props}>
      {children}
    </button>
  );
};

const BrowseAiImporter: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<"form" | "loading" | "results" | "error">("form");
  const [statusText, setStatusText] = useState("Idle");
  const [elapsed, setElapsed] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug] = useState<boolean>(() => new URL(window.location.href).searchParams.get("debug") === "1");

  const canSubmit = Boolean(username.trim() && password.trim());
  const navigate = useNavigate();

  const intervalRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);

  const reset = useCallback(() => {
    setPhase("form");
    setStatusText("Idle");
    setElapsed(0);
    setRunId(null);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  const mockFlow = useCallback(async () => {
    setStatusText("Starting run…");
    await new Promise((r) => setTimeout(r, 1000));
    setStatusText("Polling status…");
    await new Promise((r) => setTimeout(r, 1000));
    const fakeId = "mock-" + Math.random().toString(36).slice(2);
    setRunId(fakeId);
    setResult({ 
      id: fakeId, 
      status: "successful", 
      items: [ 
        { name: "Example A", value: 1 }, 
        { name: "Example B", value: 2 } 
      ], 
      summary: "Mock result after 2s." 
    });
    setPhase("results");
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    if (isMockMode()) {
      setPhase("loading");
      startTsRef.current = Date.now();
      setElapsed(0);
      await mockFlow();
      return;
    }

    try {
      setPhase("loading");
      startTsRef.current = Date.now();
      setElapsed(0);
      setStatusText("Starting run…");
      
      const start = await startRun({ username: username.trim(), password });
      setRunId(start.runId);

      // Immediately redirect to Credit Reports page to show live progress
      navigate(`/credit-report?runId=${encodeURIComponent(start.runId)}`);
      
      toast.success("Import started successfully", {
        description: "Redirecting to view real-time progress..."
      });
      
      return;

    } catch (err: any) {
      const message = err?.message || "Unknown error";
      setError(message);
      toast.error("Failed to start run", { description: message });
      setPhase("error");
    } finally {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    }
  }, [canSubmit, mockFlow, password, username, navigate]);

  const keepPolling = useCallback(async () => {
    if (!runId) return;
    setStatusText("Polling status…");
    const deadline = Date.now() + APP_CONFIG.POLL_TIMEOUT_MS;
    let currentStatus: BrowseAiStatus = "in-progress";
    
    while (Date.now() < deadline) {
      const status = isMockMode() ? { status: "successful" as BrowseAiStatus, result } : await getRunStatus({ runId });
      currentStatus = status.status;
      
      if (currentStatus === "successful") {
        setResult(status.result);
        setPhase("results");
        break;
      }
      if (currentStatus === "failed") {
        const msg = status.errorMessage || "Run failed";
        setError(msg);
        toast.error("Run failed", { description: msg });
        setPhase("error");
        break;
      }
      await new Promise((r) => setTimeout(r, APP_CONFIG.POLL_INTERVAL_MS));
    }
  }, [result, runId]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Smart Credit Import</h2>
        <p className="text-muted-foreground text-sm">
          Connect to Smart Credit to import your latest credit report data. Credentials are sent securely and not stored.
        </p>
      </header>

      {phase === "form" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="username">Smart Credit Username</label>
              <input 
                id="username" 
                className="h-9 rounded-md border bg-background px-3" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="password">Smart Credit Password</label>
              <input 
                id="password" 
                type="password" 
                className="h-9 rounded-md border bg-background px-3" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Button type="submit" disabled={!canSubmit}>
              Connect & Import
            </Button>
          </div>
        </form>
      )}

      {debug && (
        <div className="rounded-md border bg-card text-card-foreground p-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Status:</span> {statusText}</div>
            <div><span className="text-muted-foreground">Elapsed:</span> {elapsed}s</div>
            <div className="col-span-2"><span className="text-muted-foreground">Run ID:</span> {runId ?? "-"}</div>
            {error && (<div className="col-span-2"><span className="text-muted-foreground">Error:</span> {error}</div>)}
          </div>
        </div>
      )}

      {phase === "loading" && (
        <div className="space-y-6">
          <div className="rounded-md border bg-card text-card-foreground p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-medium">{statusText}</p>
              </div>
              <div className="space-x-3">
                <Button variant="secondary" onClick={keepPolling} disabled={!runId}>Keep polling</Button>
                <Button variant="outline" onClick={reset}>Cancel</Button>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">Elapsed: {elapsed}s — Run ID: {runId ?? "-"}</div>
          </div>

          {result && (
            <>
              <DashboardView result={result} runId={runId ?? undefined} />
              <TableView data={result?.items ?? result?.capturedLists ?? result} />
              <JsonView data={result} />
            </>
          )}
        </div>
      )}

      {phase === "results" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => {
              const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `smart-credit-result-${runId || "unknown"}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}>Download JSON</Button>
            <Button variant="secondary" onClick={reset}>Import Again</Button>
          </div>
          <DashboardView result={result} runId={runId ?? undefined} />
          <TableView data={result?.items ?? result?.capturedLists ?? result} />
          <JsonView data={result} />
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-4 rounded-md border bg-card p-6 text-card-foreground">
          <h3 className="text-lg font-medium">Import failed</h3>
          <p className="text-muted-foreground">{error}</p>
          <div className="flex gap-3">
            <Button onClick={reset}>Try Again</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrowseAiImporter;