import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { startSmartImport, openSmartImportStream, StartImportResponse } from "@/services/SmartCreditImportService";
import { AlertCircle, CheckCircle2, Download, Pause, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { FixedSizeList as List } from "react-window";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface LogItem { level: "info" | "warn" | "error" | "event"; message: string; ts: number }

const levels: LogItem["level"][] = ["info", "warn", "error", "event"]; 

export const SmartCreditImportMonitor: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState(0);
  const [status, setStatus] = useState<string>("idle");
  const [runInfo, setRunInfo] = useState<StartImportResponse | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [colKeys, setColKeys] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filter, setFilter] = useState<LogItem["level"] | "all">("all");
  const [autoRetry, setAutoRetry] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  const stalled = useMemo(() => running && lastEventAt > 0 && Date.now() - lastEventAt > 20000, [running, lastEventAt]);

  useEffect(() => {
    if (consoleEndRef.current) consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, rows]);

  useEffect(() => {
    const id = setInterval(() => {
      if (stalled && autoRetry && runInfo?.runId) {
        appendLog({ level: "warn", message: "No events for 20s — reconnecting stream", ts: Date.now() });
        reconnect();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [stalled, autoRetry, runInfo?.runId]);

  const appendLog = (l: LogItem) => setLogs((prev) => [...prev, l]);

  const connect = useCallback((r: StartImportResponse) => {
    if (!r.runId) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const es = openSmartImportStream(r.runId, r.browseai?.jobId);
    esRef.current = es;

    const handle = (ev: MessageEvent) => {
      setLastEventAt(Date.now());
      try {
        const data = JSON.parse(ev.data);
        const t = data?.type as string;
        if (!t) return;
        if (t === "init") {
          appendLog({ level: "event", message: `Init for run ${data.runId}`, ts: data.ts || Date.now() });
        } else if (t === "progress") {
          setStatus(data.status || "in-progress");
          setPercent(Math.min(99, data.percent ?? percent));
        } else if (t === "data:snapshot") {
          const newRows: any[] = Array.isArray(data.rows) ? data.rows : [];
          setRows((prev) => {
            const merged = [...prev, ...newRows];
            if (merged.length && colKeys.length === 0) {
              const keys = Object.keys(merged[0] || {});
              setColKeys(keys);
            }
            return merged;
          });
        } else if (t === "warn") {
          appendLog({ level: "warn", message: data.message || "Warning", ts: Date.now() });
        } else if (t === "error") {
          setError(`${data.code || "UNKNOWN"}: ${data.message || "Error"}`);
          appendLog({ level: "error", message: `${data.code || "UNKNOWN"}: ${data.message || "Error"}` , ts: Date.now() });
        } else if (t === "done") {
          setPercent(100);
          setRunning(false);
          setStatus("done");
          appendLog({ level: "event", message: `Done. Rows: ${data.rows ?? rows.length}` , ts: data.ts || Date.now() });
          es.close();
        } else if (t === "heartbeat") {
          // no-op, just update lastEventAt via set above
        }
      } catch (e) {
        appendLog({ level: "error", message: `Parse error: ${(e as Error).message}`, ts: Date.now() });
      }
    };

    es.addEventListener("message", handle);
    es.addEventListener("error", () => {
      appendLog({ level: "warn", message: "SSE connection issue", ts: Date.now() });
    });
  }, [colKeys.length, percent, rows.length]);

  const reconnect = useCallback(() => {
    if (!runInfo?.runId) return;
    connect(runInfo);
  }, [connect, runInfo]);

  const onStart = async () => {
    try {
      setError(null);
      setLogs([]);
      setRows([]);
      setColKeys([]);
      setPercent(0);
      setRunning(true);
      setStatus("queued");
      const resp = await startSmartImport({});
      setRunInfo(resp);
      connect(resp);
    } catch (e: any) {
      setRunning(false);
      setError(e?.message || "Failed to start import");
      appendLog({ level: "error", message: e?.message || "Failed to start import", ts: Date.now() });
    }
  };

  const filteredLogs = useMemo(() => logs.filter(l => filter === "all" || l.level === filter), [logs, filter]);

  const RowRenderer = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style} className="px-3 py-2 border-b text-sm">
      <div className="grid grid-cols-[auto_1fr] gap-4">
        <span className="text-muted-foreground">{index + 1}</span>
        <div className="truncate">
          {colKeys.map((k) => (
            <span key={k} className="mr-4"><span className="text-muted-foreground">{k}:</span> {String(rows[index]?.[k] ?? "")}</span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <section className="w-full" aria-label="Smart Credit Import" data-testid="smart-import-progress">
      {/* Sticky header area */}
      <div className="border-b bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-[var(--header-offset,0px)] z-30">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={status === "done" ? "default" : "secondary"} className={cn(status === "done" && "bg-primary text-primary-foreground")}>{status}</Badge>
              </div>
              <div className="mt-2 flex items-center gap-3" role="status" aria-live="polite">
                <Progress value={percent} className="h-2 w-64" />
                <span className="text-sm text-muted-foreground">{percent}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!running ? (
                <Button onClick={onStart} aria-label="Start Import"><Play className="h-4 w-4 mr-2" />Start Import</Button>
              ) : (
                <Button variant="outline" onClick={reconnect} aria-label="Retry">
                  <RefreshCw className="h-4 w-4 mr-2" />Reconnect
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {stalled && (
        <div className="container mx-auto px-6 pt-3">
          <div className="rounded-md border bg-destructive/10 text-destructive p-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" /> No events for 20s—checking…</div>
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={autoRetry} onChange={(e) => setAutoRetry(e.currentTarget.checked)} /> Auto-retry</label>
              <Button size="sm" variant="outline" onClick={reconnect}>Retry now</Button>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Step Timeline */}
        <Card className="lg:col-span-2" data-testid="smart-import-timeline">
          <CardHeader>
            <CardTitle className="text-base">Step Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {percent === 0 && !running && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              )}
              {percent > 0 && (
                <ul className="space-y-3">
                  {["Init", "Authenticate", "Launch Robot", "Stream Data", "Finalize"].map((label, i) => {
                    const stepPcts = [5, 20, 40, 90, 100];
                    const done = percent >= stepPcts[i];
                    const current = !done && (percent < (stepPcts[i + 1] ?? 100));
                    return (
                      <li key={label} className="flex items-start gap-3">
                        {done ? <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" /> : <Pause className="h-5 w-5 text-muted-foreground mt-0.5" />}
                        <div>
                          <div className={cn("text-sm font-medium", current && "text-foreground")}>{label}</div>
                          <div className="text-xs text-muted-foreground">{done ? "Completed" : current ? "In progress" : "Pending"}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Data Preview */}
        <Card className="lg:col-span-3" data-testid="smart-import-preview">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Live Data Preview</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{rows.length} rows</Badge>
                <Button size="sm" variant="outline" onClick={() => {
                  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `import-${runInfo?.runId || "run"}.json`; a.click(); URL.revokeObjectURL(url);
                }}><Download className="h-4 w-4 mr-2"/>JSON</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">Waiting for rows…</div>
            ) : (
              <div className="border rounded-md overflow-hidden" role="table" aria-rowcount={rows.length}>
                <div className="border-b bg-muted/50 text-xs px-3 py-2 font-medium whitespace-nowrap overflow-x-auto">
                  {colKeys.map((k) => (<span key={k} className="inline-block mr-6">{k}</span>))}
                </div>
                <List height={280} itemCount={rows.length} itemSize={44} width="100%">
                  {RowRenderer}
                </List>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Console */}
        <Card className="lg:col-span-5" data-testid="smart-import-console">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Log Console</CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <select className="h-8 rounded-md border bg-background px-2" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                  <option value="all">All</option>
                  {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => {
                  const data = logs.map(l => ({ ...l, iso: new Date(l.ts).toISOString() }));
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `import-logs-${runInfo?.runId || "run"}.json`; a.click(); URL.revokeObjectURL(url);
                }}><Download className="h-4 w-4 mr-2"/>Download</Button>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(logs.map(l => `${new Date(l.ts).toISOString()} [${l.level}] ${l.message}`).join("\n"))}>Copy</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-sm font-mono" aria-live="polite">
              {filteredLogs.length === 0 ? (
                <div className="text-muted-foreground">No logs yet…</div>
              ) : (
                filteredLogs.map((l, i) => (
                  <div key={i} className={cn("whitespace-pre-wrap", l.level === "error" && "text-destructive", l.level === "warn" && "text-yellow-600 dark:text-yellow-400")}>{new Date(l.ts).toLocaleTimeString()} [{l.level}] {l.message}</div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
            {error && (
              <div className="mt-3 rounded-md border bg-destructive/10 text-destructive p-3 flex items-center gap-2"><AlertCircle className="h-4 w-4"/>{error}</div>
            )}
            {status === "done" && (
              <div className="mt-3 rounded-md border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>Imported {rows.length} rows</div>
                <Button asChild size="sm"><Link to="/credit-reports">View in Credit Report</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default SmartCreditImportMonitor;
