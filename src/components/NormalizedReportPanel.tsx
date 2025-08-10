import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchLatestNormalized } from "@/services/NormalizedReportService";
import JsonView from "@/components/JsonView";

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm text-muted-foreground">{children}</span>
);

const Value = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium">{children}</span>
);

const ScoreCard = ({ title, score, status, ts }: { title: string; score: number | null; status?: string; ts?: string }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-1">
      <div className="text-2xl font-semibold">{score ?? "N/A"}</div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{status || "N/A"}</Badge>
        <span className="text-xs text-muted-foreground">{ts ? new Date(ts).toLocaleString() : ""}</span>
      </div>
    </CardContent>
  </Card>
);

const sectionTitleCls = "text-base font-semibold";

const NormalizedReportPanel: React.FC = () => {
  const [runId] = useState<string | null>(() => new URL(window.location.href).searchParams.get("runId"));
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!runId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchLatestNormalized(runId);
        setData(res);
      } catch (e: any) {
        setError(e?.message || "Failed to load normalized report");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [runId]);

  if (!runId) return null;

  const scoresByBureau = useMemo(() => {
    const m: Record<string, { score: number | null; status?: string }> = {};
    const list = data?.report?.scores || [];
    list.forEach((s: any) => (m[s.bureau] = { score: s.score ?? null, status: s.status }));
    return m;
  }, [data]);

  return (
    <div id="credit-report-panel" className="space-y-6" data-testid="credit-report-root">
      <div className="grid gap-4 md:grid-cols-3" data-testid="credit-report-scores">
        <ScoreCard title="TransUnion" score={scoresByBureau["TransUnion"]?.score ?? null} status={scoresByBureau["TransUnion"]?.status} ts={data?.collectedAt} />
        <ScoreCard title="Experian" score={scoresByBureau["Experian"]?.score ?? null} status={scoresByBureau["Experian"]?.status} ts={data?.collectedAt} />
        <ScoreCard title="Equifax" score={scoresByBureau["Equifax"]?.score ?? null} status={scoresByBureau["Equifax"]?.status} ts={data?.collectedAt} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className={sectionTitleCls}>Consumer Statements</CardTitle>
        </CardHeader>
        <CardContent data-testid="credit-report-statements">
          {(data?.report?.consumerStatements || []).length ? (
            <ul className="list-disc pl-6 space-y-1">
              {data.report.consumerStatements.map((s: any, i: number) => (
                <li key={i}>
                  <Label>{s.bureau}</Label>: <Value>{s.statement || "NONE REPORTED"}</Value>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">NONE REPORTED</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className={sectionTitleCls}>Raw Payload</CardTitle>
        </CardHeader>
        <CardContent data-testid="credit-report-raw">
          {loading ? <div className="text-sm">Loading…</div> : error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <JsonView data={data?.report?.rawSections ?? data?.report ?? {}} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NormalizedReportPanel;
