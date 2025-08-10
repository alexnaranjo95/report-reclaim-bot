import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchLatestNormalized, fetchLatestNormalizedByUser } from "@/services/NormalizedReportService";
import JsonView from "@/components/JsonView";
import { useAuth } from "@/hooks/useAuth";

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
  const { user } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (runId) {
          const res = await fetchLatestNormalized(runId);
          setData(res);
        } else if (user?.id) {
          const res = await fetchLatestNormalizedByUser(user.id);
          setData(res);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load normalized report");
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, user?.id]);

  // Build scores by bureau
  const scoresByBureau = useMemo(() => {
    const m: Record<string, { score: number | null; status?: string; position?: number }> = {};
    const list = data?.report?.scores || [];
    list.forEach((s: any) => (m[s.bureau] = { score: s.score ?? null, status: s.status, position: s.position }));
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
                  <Label>{s.bureau || "N/A"}</Label>: <Value>{s.statement ?? "NONE REPORTED"}</Value>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">NONE REPORTED</div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="credit-report-accounts">
        <CardHeader>
          <CardTitle className={sectionTitleCls}>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="realEstate">
            <TabsList>
              <TabsTrigger value="realEstate">Real Estate ({data?.counts?.accounts?.realEstate ?? (data?.report?.accounts?.realEstate?.length || 0)})</TabsTrigger>
              <TabsTrigger value="revolving">Revolving ({data?.counts?.accounts?.revolving ?? (data?.report?.accounts?.revolving?.length || 0)})</TabsTrigger>
              <TabsTrigger value="other">Other ({data?.counts?.accounts?.other ?? (data?.report?.accounts?.other?.length || 0)})</TabsTrigger>
            </TabsList>
            {(["realEstate","revolving","other"] as const).map((cat) => (
              <TabsContent key={cat} value={cat} className="mt-4">
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">Creditor</th>
                        <th className="py-2 pr-4">Bureau</th>
                        <th className="py-2 pr-4">Mask</th>
                        <th className="py-2 pr-4">Opened</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Balance</th>
                        <th className="py-2 pr-4">High Bal</th>
                        <th className="py-2 pr-4">Limit</th>
                        <th className="py-2 pr-4">Past Due</th>
                        <th className="py-2 pr-4">Last Reported</th>
                        <th className="py-2 pr-4">Dispute</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.report?.accounts?.[cat] || []).map((a: any, i: number) => (
                        <tr key={i} className="border-t">
                          <td className="py-2 pr-4">{a.creditor ?? "N/A"}</td>
                          <td className="py-2 pr-4">{a.bureau ?? "N/A"}</td>
                          <td className="py-2 pr-4">{a.account_number_mask ?? "N/A"}</td>
                          <td className="py-2 pr-4">{a.opened_on ? new Date(a.opened_on).toLocaleDateString() : "N/A"}</td>
                          <td className="py-2 pr-4">{a.account_status ?? a.status ?? "N/A"}</td>
                          <td className="py-2 pr-4">{a.balance ?? "N/A"}</td>
                          <td className="py-2 pr-4">{a.high_balance ?? "N/A"}</td>
                          <td className="py-2 pr-4">{a.credit_limit ?? "N/A"}</td>
                          <td className="py-2 pr-4">{a.past_due ?? "N/A"}</td>
                          <td className="py-2 pr-4">{a.reported_on ? new Date(a.reported_on).toLocaleDateString() : "N/A"}</td>
                          <td className="py-2 pr-4">{a.dispute_status ?? "N/A"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className={sectionTitleCls}>Public Records</CardTitle>
        </CardHeader>
        <CardContent data-testid="credit-report-public-records">
          <div className="text-sm text-muted-foreground">N/A</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className={sectionTitleCls}>Collections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">N/A</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className={sectionTitleCls}>Inquiries</CardTitle>
        </CardHeader>
        <CardContent data-testid="credit-report-inquiries">
          <div className="text-sm text-muted-foreground">N/A</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className={sectionTitleCls}>Creditor Addresses</CardTitle>
        </CardHeader>
        <CardContent data-testid="credit-report-addresses">
          <div className="text-sm text-muted-foreground">N/A</div>
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
