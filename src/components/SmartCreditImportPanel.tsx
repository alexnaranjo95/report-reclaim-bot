import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, RefreshCcw, Play, AlertTriangle, CheckCircle, FileWarning } from "lucide-react";
import { FixedSizeList as List } from "react-window";

// Types matching the events stream
type ImportEvent = {
  id?: string;
  run_id?: string;
  type: "init" | "step" | "data:snapshot" | "metric" | "warn" | "error" | "done" | "heartbeat" | "connected";
  step?: string | null;
  message?: string | null;
  ts?: string;
  progress?: number | null;
  metrics?: { rows?: number; pages?: number; runtimeSec?: number };
  sample?: any[];
  payload?: any;
  level?: string;
};

export const SmartCreditImportPanel: React.FC = () => {
  const { toast } = useToast();
  const [runId, setRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<string>("Idle");
  const [events, setEvents] = useState<ImportEvent[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [rowsCount, setRowsCount] = useState(0);
  const [runtimeSec, setRuntimeSec] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [usingPolling, setUsingPolling] = useState(false);
  const lastTsRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);

  const appendEvents = useCallback((incoming: ImportEvent | ImportEvent[]) => {
    setEvents((prev) => {
      const arr = Array.isArray(incoming) ? incoming : [incoming];
      const merged = [...prev, ...arr];
      const last = arr[arr.length - 1];
      if (last?.progress != null) setProgress(Math.max(0, Math.min(100, Math.round(last.progress))));
      if (last?.step) setStep(last.step);
      if (last?.metrics?.rows != null) setRowsCount(last.metrics.rows);
      if (last?.metrics?.runtimeSec != null) setRuntimeSec(last.metrics.runtimeSec);
      if (last?.ts) lastTsRef.current = last.ts;
      setLastUpdated(new Date().toISOString());
      return merged.slice(-1000); // keep last 1000 events
    });
  }, []);

  const onDataSnapshot = useCallback((evt: ImportEvent) => {
    if (evt.sample && Array.isArray(evt.sample)) {
      setRows((prev) => {
        const next = [...prev, ...evt.sample];
        return next.slice(-5000); // cap to avoid memory blowup
      });
    }
  }, []);

  const startPolling = useCallback(async (rid: string) => {
    setUsingPolling(true);
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const { data, error } = await supabase
        .from("smart_credit_import_events")
        .select("*")
        .eq("run_id", rid)
        .gt("ts", lastTsRef.current || new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order("ts", { ascending: true })
        .limit(200);
      if (!error && data && data.length) {
        for (const e of data as ImportEvent[]) {
          appendEvents(e);
          if (e.type === "data:snapshot") onDataSnapshot(e);
          if (e.type === "done") {
            toast({ title: "Import completed", description: `${rowsCount || 0} rows retrieved.` });
          }
        }
      }
    }, 2000);
  }, [appendEvents, onDataSnapshot, rowsCount, toast]);

  const openStream = useCallback(async (rid: string) => {
    setConnecting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const url = new URL(`https://rcrpqdhfawtpjicttgvx.supabase.co/functions/v1/smart-credit-import-stream`);
      url.searchParams.set("runId", rid);
      if (token) url.searchParams.set("access_token", token);

      const es = new EventSource(url.toString());
      esRef.current = es;
      es.onmessage = (msg) => {
        try {
          const data: ImportEvent = JSON.parse(msg.data);
          appendEvents(data);
          if (data.type === "data:snapshot") onDataSnapshot(data);
          if (data.type === "done") {
            toast({ title: "Import completed", description: `${rowsCount || 0} rows retrieved.` });
          }
        } catch (e) {
          // Ignore heartbeats or malformed
        }
      };
      es.onerror = () => {
        es.close();
        startPolling(rid);
      };
    } finally {
      setConnecting(false);
    }
  }, [appendEvents, onDataSnapshot, rowsCount, startPolling, toast]);

  const onStart = useCallback(async () => {
    setEvents([]);
    setRows([]);
    setRowsCount(0);
    setRuntimeSec(null);
    setProgress(0);
    setStep("Starting");

    const { data, error } = await supabase.functions.invoke("smart-credit-import-start", { body: {} });
    if (error) {
      toast({ title: "Failed to start", description: error.message, variant: "destructive" });
      setStep("Error");
      return;
    }
    const rid = (data as any)?.runId as string | undefined;
    if (!rid) {
      toast({ title: "Failed to start", description: "No runId returned", variant: "destructive" });
      setStep("Error");
      return;
    }
    setRunId(rid);
    openStream(rid);
  }, [openStream, toast]);

  const onRetry = useCallback(() => {
    onStart();
  }, [onStart]);

  const downloadLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-credit-import-log-${runId || "session"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events, runId]);

  const RowRenderer = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = rows[index];
    return (
      <div style={style} className="px-3 py-2 border-b text-sm" data-testid={`data-row-${index}`}>
        <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(row, null, 2)}</pre>
      </div>
    );
  };

  const doneEvent = useMemo(() => events.find((e) => e.type === "done"), [events]);

  useEffect(() => {
    return () => {
      esRef.current?.close();
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  // No Data Yet diagnostics
  const showNoDataDiag = useMemo(() => progress > 80 && rowsCount === 0 && !doneEvent, [progress, rowsCount, doneEvent]);

  return (
    <Card className="bg-gradient-card shadow-card" data-testid="smartcredit-import-panel">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Smart Credit Import Monitor</span>
          <div className="flex items-center gap-2">
            <Button onClick={onStart} disabled={connecting} data-testid="start-import">
              <Play className="h-4 w-4 mr-2" /> Start Import
            </Button>
            <Button variant="outline" onClick={onRetry} data-testid="retry-import">
              <RefreshCcw className="h-4 w-4 mr-2" /> Retry
            </Button>
            <Button variant="outline" onClick={downloadLog} data-testid="download-log">
              <Download className="h-4 w-4 mr-2" /> Download Log
            </Button>
            <Button variant="ghost" asChild>
              <a href="mailto:support@leverageservices.com?subject=Smart%20Credit%20Import%20Issue" data-testid="report-issue">Report Issue</a>
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{step}</span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="text-muted-foreground">Run: {runId || "—"}</div>
          <div className="text-muted-foreground">Rows: {rowsCount}</div>
          <div className="text-muted-foreground">Runtime: {runtimeSec ?? "—"}s</div>
          <div className="text-muted-foreground">Updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—"}</div>
          {usingPolling && <div className="flex items-center gap-2 text-amber-600"><AlertTriangle className="h-4 w-4" /> Fallback: Polling</div>}
        </div>

        {/* Step Timeline (simple) */}
        <div className="rounded-md border p-3 max-h-48 overflow-auto" data-testid="step-timeline">
          <div className="font-medium mb-2">Step Timeline</div>
          <ul className="space-y-1 text-sm">
            {events.filter(e => e.type === "init" || e.type === "step" || e.type === "done" || e.type === "error").map((e, i) => (
              <li key={i} className="flex items-center gap-2">
                {e.type === "done" ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : e.type === "error" ? <FileWarning className="h-4 w-4 text-red-600" /> : <span className="h-2 w-2 rounded-full bg-primary inline-block" />}
                <span className="text-muted-foreground">{e.ts ? new Date(e.ts).toLocaleTimeString() : ""}</span>
                <span>{e.step || e.type}</span>
                {e.message && <span className="text-muted-foreground">— {e.message}</span>}
              </li>
            ))}
          </ul>
        </div>

        {/* Live Log Console */}
        <div className="rounded-md border p-3 max-h-60 overflow-auto" data-testid="live-log">
          <div className="font-medium mb-2">Live Log</div>
          <ul className="space-y-1 text-xs">
            {events.slice(-200).map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground">{e.ts ? new Date(e.ts).toLocaleTimeString() : ""}</span>
                <span className="font-medium">[{e.type}{e.step ? `:${e.step}` : ""}]</span>
                {e.message && <span className="text-muted-foreground">{e.message}</span>}
              </li>
            ))}
          </ul>
        </div>

        {/* Data Preview */}
        <div className="rounded-md border" data-testid="data-preview">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="font-medium">Data Preview</div>
            <div className="text-sm text-muted-foreground">Rows: {rows.length}</div>
          </div>
          <div style={{ height: 240 }}>
            <List height={240} width="100%" itemSize={80} itemCount={rows.length} overscanCount={4}>
              {RowRenderer as any}
            </List>
          </div>
        </div>

        {/* JSON viewer for latest payload */}
        <div className="rounded-md border p-3" data-testid="json-viewer">
          <div className="font-medium mb-2">Latest Payload</div>
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground max-h-60 overflow-auto">{JSON.stringify(events.filter(e => e.payload).slice(-1)[0]?.payload || {}, null, 2)}</pre>
        </div>

        {/* Diagnostics */}
        {showNoDataDiag && (
          <div className="rounded-md border border-amber-400 bg-amber-50/50 p-3 text-sm" data-testid="no-data-diagnostics">
            <div className="font-medium mb-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> No data yet</div>
            <ul className="list-disc ml-5 text-muted-foreground">
              <li>Task status: {events.find(e => e.type === 'step')?.step || '—'}</li>
              <li>Last successful selector: —</li>
              <li>Last HTTP status: —</li>
            </ul>
          </div>
        )}

        {/* Completion banners */}
        {doneEvent && rowsCount > 0 && (
          <div className="rounded-md border border-emerald-400 bg-emerald-50/50 p-3 text-sm" data-testid="done-banner-success">
            <div className="font-medium mb-1 flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-600" /> Data retrieved</div>
            <div className="text-muted-foreground">{rowsCount} rows imported. First 5 rows shown above.</div>
          </div>
        )}
        {doneEvent && rowsCount === 0 && (
          <div className="rounded-md border border-red-400 bg-red-50/50 p-3 text-sm" data-testid="done-banner-error">
            <div className="font-medium mb-1 flex items-center gap-2"><FileWarning className="h-4 w-4 text-red-600" /> No rows imported</div>
            <div className="text-muted-foreground">Please check credentials or try again. Use Report Issue to contact support.</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SmartCreditImportPanel;
