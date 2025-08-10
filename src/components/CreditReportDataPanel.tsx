import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FixedSizeList as List } from "react-window";
import { fetchLatestNormalizedByUser, fetchAccountsByCategory } from "@/services/NormalizedReportService";

interface LatestData {
  runId: string;
  collectedAt: string;
  version: string;
  report: any;
  counts?: { realEstate?: number; revolving?: number; other?: number };
}

const BureauCard: React.FC<{ name: string; score?: number | null; status?: string | null; position?: number | null }>
 = ({ name, score, status, position }) => (
  <Card className="w-[220px]" data-testid={`credit-score-${name.toLowerCase()}`}>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{name}</div>
      <div className="text-3xl font-bold">{score ?? "N/A"}</div>
      <div className="flex items-center gap-2 mt-1">
        {status ? <Badge variant="outline">{status}</Badge> : null}
        {position != null ? <span className="text-xs text-muted-foreground">#{position}</span> : null}
      </div>
    </CardContent>
  </Card>
);

const SectionTitle: React.FC<{ children: React.ReactNode; id?: string }> = ({ children, id }) => (
  <div className="flex items-center justify-between">
    <h2 id={id} className="text-xl font-semibold">{children}</h2>
  </div>
);

const ConsumerStatements: React.FC<{ items: any[] }> = ({ items }) => {
  const byBureau: Record<string, any> = { TransUnion: {}, Experian: {}, Equifax: {} };
  items.forEach((i) => { if (i?.bureau) byBureau[i.bureau] = i; });
  const renderItem = (bureau: string) => {
    const it = byBureau[bureau] || {};
    const statement = it.statement || "NONE REPORTED";
    return (
      <Card key={bureau}>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{bureau}</div>
          <div className="mt-1 text-sm break-words">{statement || "NONE REPORTED"}</div>
        </CardContent>
      </Card>
    );
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="credit-report-statements">
      {(["TransUnion","Experian","Equifax"] as const).map(renderItem)}
    </div>
  );
};

const columns = [
  { key: "creditor", label: "Creditor" },
  { key: "bureau", label: "Bureau" },
  { key: "account_number_mask", label: "Mask" },
  { key: "opened_on", label: "Opened" },
  { key: "account_status", label: "Status" },
  { key: "balance", label: "Balance" },
  { key: "high_balance", label: "High Balance" },
  { key: "credit_limit", label: "Limit" },
  { key: "past_due", label: "Past Due" },
  { key: "reported_on", label: "Last Reported" },
  { key: "dispute_status", label: "Dispute Status" },
];

const formatMoney = (v: any) => (v == null ? "—" : `$${Number(v).toLocaleString()}`);
const formatDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

const AccountsVirtualTable: React.FC<{ items: any[]; height?: number }>
 = ({ items, height = 360 }) => {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = items[index];
    return (
      <div style={style} className="grid grid-cols-11 text-sm border-b px-3 py-2">
        <div className="truncate">{row.creditor ?? "—"}</div>
        <div>{row.bureau ?? "—"}</div>
        <div>{row.account_number_mask ?? "—"}</div>
        <div>{formatDate(row.opened_on)}</div>
        <div>{row.account_status ?? "—"}</div>
        <div>{formatMoney(row.balance)}</div>
        <div>{formatMoney(row.high_balance)}</div>
        <div>{formatMoney(row.credit_limit)}</div>
        <div>{formatMoney(row.past_due)}</div>
        <div>{formatDate(row.reported_on)}</div>
        <div>{row.dispute_status ?? "—"}</div>
      </div>
    );
  };

  return (
    <div className="w-full overflow-auto rounded-md border" data-testid="credit-report-accounts">
      <div className="grid grid-cols-11 bg-muted/50 text-xs font-medium px-3 py-2">
        {columns.map(c => <div key={c.key}>{c.label}</div>)}
      </div>
      <List height={height} itemCount={items.length} itemSize={44} width={"100%"}>
        {Row as any}
      </List>
    </div>
  );
};

const KeyValueList: React.FC<{ obj?: Record<string, any> | null; testId: string }>
 = ({ obj, testId }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid={testId}>
    {obj && Object.keys(obj).length > 0 ? (
      Object.entries(obj).map(([k, v]) => (
        <div key={k} className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">{k}</div>
          <div className="text-sm break-words">{v == null || v === "" ? "N/A" : String(v)}</div>
        </div>
      ))
    ) : (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">N/A</CardContent>
      </Card>
    )}
  </div>
);

const CollapsibleRaw: React.FC<{ data: any }>= ({ data }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card data-testid="credit-report-raw">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Raw JSON</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen(v => !v)}>
          {open ? "Hide" : "Show"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <pre className="max-h-[50vh] overflow-auto text-xs p-3 rounded-md bg-muted/50">
            {JSON.stringify(data, null, 2)}
          </pre>
        </CardContent>
      )}
    </Card>
  );
};

const CreditReportDataPanel: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestData | null>(null);
  const [category, setCategory] = useState<"realEstate" | "revolving" | "other">("revolving");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [successRows, setSuccessRows] = useState<number | null>(null);

  const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const wantDryRun = query?.get('dryRun') === '1';

  const loadLatest = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLatestNormalizedByUser(user.id);
      const counts = (data as any)?.counts || {};
      setLatest({ ...(data as any), counts } as any);
      const total = (counts.realEstate || 0) + (counts.revolving || 0) + (counts.other || 0);
      setSuccessRows(total);
    } catch (e: any) {
      setError(e?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async (cat: "realEstate" | "revolving" | "other") => {
    try {
      const res = await fetchAccountsByCategory(cat, 500);
      setAccounts(res.items || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load accounts');
    }
  };

  useEffect(() => {
    if (!user) return;
    loadLatest().then(() => loadAccounts(category));
    // Subscribe to broadcasted ingest events
    const channel = supabase
      .channel('credit-report-events')
      .on('broadcast', { event: 'credit_report_ingested' }, () => {
        loadLatest();
        loadAccounts(category);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    loadAccounts(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    if (wantDryRun) {
      // Trigger a dry run so UI updates immediately
      supabase.functions.invoke('credit-report-ingest', { body: { dryRun: 1 } } as any)
        .then(() => {
          loadLatest();
          loadAccounts(category);
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantDryRun]);

  const scoresByBureau = useMemo(() => {
    const s: Record<string, { score?: number | null; status?: string | null; position?: number | null }> = {};
    const arr: any[] = latest?.report?.scores || [];
    arr.forEach((x) => { s[x.bureau] = { score: x.score, status: x.status, position: x.position }; });
    return s;
  }, [latest]);

  const filteredAccounts = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [accounts, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Credit Reports</h1>
        <p className="text-muted-foreground">Latest normalized data with full visibility</p>
      </div>

      {/* Status banners */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!loading && error && (
        <Alert variant="destructive">
          <AlertTitle>Error loading data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && successRows != null && (
        <Alert>
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>Data retrieved: {successRows} rows</AlertDescription>
        </Alert>
      )}

      {/* Empty state when no report */}
      {!loading && !error && (!latest || !latest.report) && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">No normalized report yet.</div>
              <div className="text-sm text-muted-foreground">Run a dry import to preview the UI instantly.</div>
            </div>
            <Button size="sm" onClick={() => {
              supabase.functions.invoke('credit-report-ingest', { body: { dryRun: 1 } } as any)
                .then(() => { loadLatest(); loadAccounts(category); })
                .catch((e) => toast.error((e as any)?.message || 'Failed to start dry run'))
            }}>Run Import (Dry Run)</Button>
          </CardContent>
        </Card>
      )}

      {/* Scores */}
      {!loading && latest?.report && (
        <div data-testid="credit-report-scores">
          <SectionTitle>Credit Scores</SectionTitle>
          <div className="mt-3 flex flex-wrap gap-3">
            <BureauCard name="TransUnion" {...scoresByBureau['TransUnion']} />
            <BureauCard name="Experian" {...scoresByBureau['Experian']} />
            <BureauCard name="Equifax" {...scoresByBureau['Equifax']} />
          </div>
        </div>
      )}

      {/* Consumer Statements */}
      {!loading && latest?.report && (
        <div>
          <SectionTitle>Consumer Statements</SectionTitle>
          <div className="mt-3">
            <ConsumerStatements items={latest.report?.consumerStatements || []} />
          </div>
        </div>
      )}

      {/* Accounts tabs */}
      {!loading && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Accounts</CardTitle>
            <div className="flex items-center gap-2">
              <Input placeholder="Search accounts" className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={category} onValueChange={(v) => setCategory(v as any)} className="space-y-4">
              <TabsList>
                <TabsTrigger value="realEstate">Real Estate ({latest?.counts?.realEstate ?? 0})</TabsTrigger>
                <TabsTrigger value="revolving">Revolving ({latest?.counts?.revolving ?? 0})</TabsTrigger>
                <TabsTrigger value="other">Other ({latest?.counts?.other ?? 0})</TabsTrigger>
              </TabsList>
              <TabsContent value="realEstate">
                <AccountsVirtualTable items={filteredAccounts} />
              </TabsContent>
              <TabsContent value="revolving">
                <AccountsVirtualTable items={filteredAccounts} />
              </TabsContent>
              <TabsContent value="other">
                <AccountsVirtualTable items={filteredAccounts} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Public Records */}
      {!loading && latest?.report && (
        <div>
          <SectionTitle id="public-records">Public Records</SectionTitle>
          <div className="mt-3" data-testid="credit-report-public-records">
            {(latest.report?.publicRecords || []).length > 0 ? (
              <pre className="text-xs p-3 rounded-md bg-muted/50 max-h-[40vh] overflow-auto">{JSON.stringify(latest.report.publicRecords, null, 2)}</pre>
            ) : (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">N/A</CardContent></Card>
            )}
          </div>
        </div>
      )}

      {/* Collections */}
      {!loading && latest?.report && (
        <div>
          <SectionTitle>Collections</SectionTitle>
          <div className="mt-3" data-testid="credit-report-collections">
            {(latest.report?.collections || []).length > 0 ? (
              <pre className="text-xs p-3 rounded-md bg-muted/50 max-h-[40vh] overflow-auto">{JSON.stringify(latest.report.collections, null, 2)}</pre>
            ) : (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">N/A</CardContent></Card>
            )}
          </div>
        </div>
      )}

      {/* Inquiries */}
      {!loading && latest?.report && (
        <div>
          <SectionTitle>Inquiries</SectionTitle>
          <div className="mt-3" data-testid="credit-report-inquiries">
            {(latest.report?.inquiries || []).length > 0 ? (
              <pre className="text-xs p-3 rounded-md bg-muted/50 max-h-[40vh] overflow-auto">{JSON.stringify(latest.report.inquiries, null, 2)}</pre>
            ) : (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">N/A</CardContent></Card>
            )}
          </div>
        </div>
      )}

      {/* Creditor Addresses */}
      {!loading && latest?.report && (
        <div>
          <SectionTitle>Creditor Addresses</SectionTitle>
          <div className="mt-3" data-testid="credit-report-addresses">
            {(latest.report?.creditorsAddresses || []).length > 0 ? (
              <pre className="text-xs p-3 rounded-md bg-muted/50 max-h-[40vh] overflow-auto">{JSON.stringify(latest.report.creditorsAddresses, null, 2)}</pre>
            ) : (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">N/A</CardContent></Card>
            )}
          </div>
        </div>
      )}

      {/* Raw JSON viewer */}
      {!loading && latest?.report && (
        <CollapsibleRaw data={latest.report} />
      )}
    </div>
  );
};

export default CreditReportDataPanel;
