import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from "dompurify";
import Papa from "papaparse";
import { RawReportService } from "@/services/RawReportService";
import { Download, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

function isHtmlString(value: any): boolean {
  return (
    typeof value === "string" && /<[^>]+>/.test(value)
  );
}

function toPlainText(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type ScoresMap = Record<string, { score: number | null; status?: string | null; position?: number | null }>;

function extractScores(obj: any): ScoresMap {
  const scores: ScoresMap = {};
  const bureaus = ["TransUnion", "Experian", "Equifax", "TU", "EX", "EQ"];

  function tryAdd(item: any) {
    const bureauKey = Object.keys(item || {}).find((k) => /bureau/i.test(k));
    const scoreKey = Object.keys(item || {}).find((k) => /score/i.test(k));
    if (bureauKey && scoreKey) {
      const bureauVal = String(item[bureauKey]);
      const bureau = bureaus.find((b) => bureauVal.toLowerCase().includes(b.toLowerCase()));
      if (bureau && !scores[bureau]) {
        scores[bureau] = {
          score: item[scoreKey] != null && !isNaN(Number(item[scoreKey])) ? Number(item[scoreKey]) : null,
          status: item.status ?? item.Status ?? null,
          position: item.position ?? item.Position ?? null,
        };
      }
    }
  }

  function walk(value: any) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (typeof v === "object" && v) tryAdd(v);
        walk(v);
      });
    } else if (typeof value === "object") {
      tryAdd(value);
      Object.values(value).forEach((v) => walk(v));
    }
  }

  walk(obj);
  return scores;
}

function download(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Section: React.FC<{
  name: string;
  value: any;
  search: string;
  expanded: boolean;
  onToggle: () => void;
}> = ({ name, value, search, expanded, onToggle }) => {
  const title = formatLabel(name);
  const lowerSearch = search.toLowerCase();

  const isArray = Array.isArray(value);
  const isObject = !isArray && typeof value === "object" && value !== null;

  const filteredArray = useMemo(() => {
    if (!isArray) return [] as any[];
    if (!lowerSearch) return value as any[];
    return (value as any[]).filter((row) => JSON.stringify(row).toLowerCase().includes(lowerSearch));
  }, [isArray, value, lowerSearch]);

  const columns = useMemo(() => {
    if (!isArray || filteredArray.length === 0) return [] as string[];
    const keys = new Set<string>();
    filteredArray.forEach((row) => {
      if (row && typeof row === "object") Object.keys(row).forEach((k) => keys.add(k));
    });
    return ["Position", ...Array.from(keys)];
  }, [isArray, filteredArray]);

  const onDownloadJSON = () => download(`${name}.json`, JSON.stringify(value, null, 2));
  const onDownloadCSV = () => {
    if (isArray) {
      const rows = (filteredArray.length ? filteredArray : value).map((row: any, idx: number) => ({ Position: idx + 1, ...row }));
      download(`${name}.csv`, Papa.unparse(rows), "text/csv");
    } else if (isObject) {
      const rows = Object.entries(value).map(([k, v]) => ({ key: k, value: typeof v === "object" ? JSON.stringify(v) : String(v ?? "") }));
      download(`${name}.csv`, Papa.unparse(rows), "text/csv");
    } else {
      download(`${name}.csv`, Papa.unparse([{ value }]), "text/csv");
    }
  };

  return (
    <Card data-testid={`cr-section-${name}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDownloadJSON}><Download className="h-4 w-4 mr-1" />JSON</Button>
          <Button variant="outline" size="sm" onClick={onDownloadCSV}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded} aria-controls={`section-${name}`}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent id={`section-${name}`}>
          {isArray ? (
            <div className="w-full overflow-auto rounded-md border" role="table">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredArray.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-muted-foreground" colSpan={columns.length}>No rows</td>
                    </tr>
                  ) : (
                    filteredArray.map((row: any, i: number) => (
                      <tr key={i} className="border-t">
                        {columns.map((col, j) => (
                          <td key={j} className="px-3 py-2 align-top">
                            {col === "Position" ? i + 1 : String(row?.[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : isObject ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(value).map(([k, v]) => (
                <div key={k} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{formatLabel(k)}</div>
                  <div className="text-sm break-words">
                    {typeof v === "object" && v !== null ? (
                      <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(v, null, 2)}</pre>
                    ) : isHtmlString(v) ? (
                      <HtmlCell html={String(v)} />
                    ) : (
                      String(v ?? "N/A")
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm">
              {isHtmlString(value) ? <HtmlCell html={String(value)} /> : String(value ?? "N/A")}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

const HtmlCell: React.FC<{ html: string }> = ({ html }) => {
  const [mode, setMode] = useState<"html" | "text">("html");
  const safe = useMemo(() => ({ __html: DOMPurify.sanitize(html) }), [html]);
  const text = useMemo(() => toPlainText(html), [html]);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={mode === "html" ? "default" : "outline"} onClick={() => setMode("html")} className="cursor-pointer">View HTML</Badge>
        <Badge variant={mode === "text" ? "default" : "outline"} onClick={() => setMode("text")} className="cursor-pointer">View Text</Badge>
      </div>
      {mode === "html" ? (
        <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={safe} />
      ) : (
        <pre className="whitespace-pre-wrap text-xs p-2 rounded-md bg-muted/50">{text}</pre>
      )}
    </div>
  );
};

const CreditReportRawDashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedAll, setExpandedAll] = useState(true);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const queryRunId = typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("runId") : null;

  useEffect(() => {
    document.title = "Credit Report (Raw Import)";
  }, []);

  const fetchData = async () => {
    if (!user && !queryRunId) {
      setLoading(false);
      setError("You must be signed in to view your credit report.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = queryRunId
        ? await RawReportService.fetchLatestByRunId(queryRunId)
        : await RawReportService.fetchLatestByUser(user!.id);
      if (!res.ok || !res.raw) {
        setData(null);
        setCollectedAt(null);
        setRunId(null);
        setError(res.message || "No payload available");
      } else {
        setData(res.raw);
        setCollectedAt(res.collectedAt || null);
        setRunId(res.runId || null);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load raw report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, queryRunId]);

  const scores = useMemo(() => extractScores(data || {}), [data]);
  const topLevel = useMemo(() => (data && typeof data === "object" ? Object.entries(data) : []), [data]);

  const expandAll = () => {
    const map: Record<string, boolean> = {};
    topLevel.forEach(([k]) => (map[k] = true));
    setExpandedMap(map);
    setExpandedAll(true);
  };
  const collapseAll = () => {
    const map: Record<string, boolean> = {};
    topLevel.forEach(([k]) => (map[k] = false));
    setExpandedMap(map);
    setExpandedAll(false);
  };

  const toggleOne = (k: string) => setExpandedMap((m) => ({ ...m, [k]: !(m[k] ?? expandedAll) }));

  const onDryRun = async () => {
    try {
      setRefreshing(true);
      const { error } = await supabase.functions.invoke("credit-report-ingest", {
        body: { dryRun: 1 },
      } as any);
      if (error) throw error;
      toast.success("Dry run started. Refreshing...");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Not authorized to run import");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div data-testid="credit-report-raw-dashboard" className="container mx-auto px-6 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Credit Report (Raw Import)</h1>
          <p className="text-muted-foreground">Lossless view of the latest scraper payload</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search all sections" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <Button variant="outline" onClick={expandedAll ? collapseAll : expandAll}>
            {expandedAll ? "Collapse All" : "Expand All"}
          </Button>
          <Button variant="outline" onClick={() => fetchData()} disabled={refreshing} className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </header>

      {/* Sticky summary */}
      <div className="sticky top-0 z-10 -mx-6 border-b bg-card/80 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4" data-testid="cr-scores">
            {(["TransUnion", "Experian", "Equifax"] as const).map((b) => (
              <Card key={b} className="w-[180px]">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">{b}</div>
                  <div className="text-2xl font-bold">
                    {scores[b]?.score ?? "N/A"}
                  </div>
                  {scores[b]?.status && (
                    <Badge variant="outline" className="mt-1">{scores[b]?.status}</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            {runId ? <span>Run: <strong>{runId}</strong></span> : null}
            {collectedAt ? <span className="ml-3">Collected: <strong>{new Date(collectedAt).toLocaleString()}</strong></span> : null}
          </div>
        </div>
      </div>

      {/* Loading / Error / Empty */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load credit report</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && !data && (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="text-lg font-medium mb-2">No raw import found</div>
            <p className="text-muted-foreground mb-4">Run the scraper to ingest a report, then refresh.</p>
            <Button onClick={onDryRun} variant="default">Run Import (Dry Run)</Button>
          </CardContent>
        </Card>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 gap-4">
          {topLevel.map(([k, v]) => (
            <Section
              key={k}
              name={k}
              value={v}
              search={search}
              expanded={expandedMap[k] ?? expandedAll}
              onToggle={() => toggleOne(k)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CreditReportRawDashboard;
