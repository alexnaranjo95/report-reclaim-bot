import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import HtmlBlock from "@/components/HtmlBlock";
import VirtualizedHtmlList from "@/components/VirtualizedHtmlList";
import JsonView from "@/components/JsonView";
import { fetchLatestWithFallback } from "@/services/NormalizedReportService";

function stripTags(s: string) {
  if (!s) return "";
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractList(source: any, fragments: string[]): string[] {
  const lists = source?.capturedLists || source?.captured_lists || source?.lists || null;
  if (!lists || typeof lists !== "object") return [];
  const items: string[] = [];
  for (const key of Object.keys(lists)) {
    const lower = key.toLowerCase();
    if (fragments.some((f) => lower.includes(f))) {
      const val = (lists as any)[key];
      if (Array.isArray(val)) {
        for (const v of val) {
          if (v && typeof v === "object") items.push(v.html ?? v.text ?? String(v));
          else items.push(String(v ?? ""));
        }
      } else if (val && typeof val === "object") {
        items.push(val.html ?? val.text ?? String(val));
      } else if (typeof val === "string") {
        items.push(val);
      }
    }
  }
  return items.filter(Boolean);
}

function parseScores(source: any): { bureau: string; score: number | null }[] {
  const blocks = extractList(source, ["credit score"]);
  const bureaus = ["transunion", "equifax", "experian"];
  const results: { bureau: string; score: number | null }[] = [];
  for (const raw of blocks) {
    const text = stripTags(raw).toLowerCase();
    const b = bureaus.find((x) => text.includes(x));
    const match = text.match(/\b(\d{3})\b/);
    if (b) results.push({ bureau: b.charAt(0).toUpperCase() + b.slice(1), score: match ? parseInt(match[1], 10) : null });
  }
  // Ensure unique by bureau
  const map = new Map<string, number | null>();
  for (const r of results) if (!map.has(r.bureau)) map.set(r.bureau, r.score);
  return Array.from(map.entries()).map(([bureau, score]) => ({ bureau, score }));
}

const Section: React.FC<{ title: string; items: string[] } > = ({ title, items }) => {
  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">N/A</p>
        </CardContent>
      </Card>
    );
  }
  const useVirtualized = items.length > 20;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}
          <span className="ml-2 text-sm text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {useVirtualized ? (
          <VirtualizedHtmlList items={items} />
        ) : (
          <Accordion type="multiple" className="w-full">
            {items.map((html, idx) => (
              <AccordionItem key={idx} value={`item-${idx}`}>
                <AccordionTrigger>
                  <span className="text-sm">Row {idx + 1}</span>
                </AccordionTrigger>
                <AccordionContent>
                  <HtmlBlock html={html} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};

const CreditReportsPage: React.FC = () => {
  const [loading, setLoading] = React.useState(true);
  const [normalized, setNormalized] = React.useState<any>(null);
  const [raw, setRaw] = React.useState<any>(null);
  const [capturedUrl, setCapturedUrl] = React.useState<string | undefined>(undefined);
  const [externalRaw, setExternalRaw] = React.useState<any>(null);

  React.useEffect(() => {
    let isMounted = true;
    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const runId = params.get("runId") || undefined;
        const res: any = await fetchLatestWithFallback(runId);
        if (!isMounted) return;
        const norm = res?.normalized || res?.normalizedReport || res?.report || res?.normalized?.report_json || res?.report_json || null;
        const rawData = res?.raw || res?.rawReport || res?.raw_json || res?.raw?.raw_json || null;
        const capUrl = res?.capturedDataTemporaryUrl || res?.raw?.capturedDataTemporaryUrl || res?.report?.capturedDataTemporaryUrl || res?.raw_json?.capturedDataTemporaryUrl;
        setNormalized(norm || null);
        setRaw(rawData || null);
        setCapturedUrl(capUrl);
      } catch (e) {
        console.error("credit-report: fetch error", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    run();
    return () => { isMounted = false; };
  }, []);

  React.useEffect(() => {
    let aborted = false;
    if (!normalized && !raw && capturedUrl) {
      fetch(capturedUrl)
        .then((r) => r.json())
        .then((j) => { if (!aborted) setExternalRaw(j); })
        .catch((e) => console.error("credit-report: captured url fetch error", e));
    }
    return () => { aborted = true; };
  }, [normalized, raw, capturedUrl]);

  const source = React.useMemo(() => {
    // Prefer raw when HTML lists likely live there, else normalized, else external
    return raw || normalized || externalRaw || null;
  }, [raw, normalized, externalRaw]);

  const scores = React.useMemo(() => parseScores(source), [source]);
  const realEstateItems = React.useMemo(() => extractList(source, ["real estate accounts", "real estate account"]), [source]);
  const revolvingItems = React.useMemo(() => extractList(source, ["revolving accounts", "revolving account"]), [source]);
  const otherAccountItems = React.useMemo(() => extractList(source, ["other accounts", "other account"]), [source]);
  const consumerStatements = React.useMemo(() => extractList(source, ["consumer stateme"]), [source]);
  const publicRecords = React.useMemo(() => extractList(source, ["public informations", "public records"]), [source]);
  const collections = React.useMemo(() => extractList(source, ["collections", "collection accounts", "collection account"]), [source]);
  const inquiries = React.useMemo(() => extractList(source, ["inquiries credit", "inquiries"]), [source]);
  const personalInfo = React.useMemo(() => extractList(source, ["personal inform", "personal info"]), [source]);
  const creditorAddresses = React.useMemo(() => extractList(source, ["creditors addresses", "creditor addresses"]), [source]);

  return (
    <div className="min-h-screen bg-background" data-testid="credit-report-root">
      <div className="container mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Credit Report</h1>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[320px] w-full" />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview" data-testid="credit-report-tabs-overview">Overview</TabsTrigger>
              <TabsTrigger value="scores" data-testid="credit-report-tabs-scores">Scores</TabsTrigger>
              <TabsTrigger value="accounts" data-testid="credit-report-tabs-accounts">Accounts</TabsTrigger>
              <TabsTrigger value="consumer-statements" data-testid="credit-report-tabs-consumer-statements">Consumer Statements</TabsTrigger>
              <TabsTrigger value="public-records" data-testid="credit-report-tabs-public-records">Public Records</TabsTrigger>
              <TabsTrigger value="collections" data-testid="credit-report-tabs-collections">Collections</TabsTrigger>
              <TabsTrigger value="inquiries" data-testid="credit-report-tabs-inquiries">Inquiries</TabsTrigger>
              <TabsTrigger value="personal-info" data-testid="credit-report-tabs-personal-info">Personal Info</TabsTrigger>
              <TabsTrigger value="creditor-addresses" data-testid="credit-report-tabs-creditor-addresses">Creditor Addresses</TabsTrigger>
              <TabsTrigger value="raw-json" data-testid="credit-report-tabs-raw-json">Raw JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader><CardTitle>Scores</CardTitle></CardHeader>
                  <CardContent>
                    {scores.length ? (
                      <div className="grid grid-cols-1 gap-2">
                        {scores.map((s) => (
                          <div key={s.bureau} className="flex items-center justify-between rounded-md border bg-card p-3">
                            <span className="text-sm text-muted-foreground">{s.bureau}</span>
                            <span className="text-lg font-semibold">{s.score ?? "N/A"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">N/A</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Accounts</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">Real Estate: {realEstateItems.length || 0}</div>
                    <div className="text-sm text-muted-foreground">Revolving: {revolvingItems.length || 0}</div>
                    <div className="text-sm text-muted-foreground">Other: {otherAccountItems.length || 0}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Data Source</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      {(raw && "Raw report") || (normalized && "Normalized report") || (externalRaw && "Captured URL JSON") || "No data"}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="scores">
              <Card>
                <CardHeader><CardTitle>Credit Scores</CardTitle></CardHeader>
                <CardContent>
                  {scores.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {scores.map((s) => (
                        <div key={s.bureau} className="rounded-md border bg-card p-4">
                          <div className="text-sm text-muted-foreground">{s.bureau}</div>
                          <div className="text-2xl font-bold">{s.score ?? "N/A"}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">N/A</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="accounts">
              <div className="space-y-6">
                <Section title="Real Estate Accounts" items={realEstateItems} />
                <Section title="Revolving Accounts" items={revolvingItems} />
                <Section title="Other Accounts" items={otherAccountItems} />
              </div>
            </TabsContent>

            <TabsContent value="consumer-statements">
              <Section title="Consumer Statements" items={consumerStatements} />
            </TabsContent>

            <TabsContent value="public-records">
              <Section title="Public Records" items={publicRecords} />
            </TabsContent>

            <TabsContent value="collections">
              <Section title="Collections" items={collections} />
            </TabsContent>

            <TabsContent value="inquiries">
              <Section title="Inquiries" items={inquiries} />
            </TabsContent>

            <TabsContent value="personal-info">
              <Section title="Personal Information" items={personalInfo} />
            </TabsContent>

            <TabsContent value="creditor-addresses">
              <Section title="Creditor Addresses" items={creditorAddresses} />
            </TabsContent>

            <TabsContent value="raw-json">
              <Accordion type="single" collapsible className="w-full" data-testid="credit-report-raw">
                <AccordionItem value="raw">
                  <AccordionTrigger>Raw JSON</AccordionTrigger>
                  <AccordionContent>
                    <JsonView data={raw || normalized || externalRaw || { message: "No data" }} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default CreditReportsPage;
