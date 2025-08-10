import React from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import HtmlBlock from "@/components/HtmlBlock";
import VirtualizedHtmlList from "@/components/VirtualizedHtmlList";
import JsonView from "@/components/JsonView";
import { fetchLatestWithFallback } from "@/services/NormalizedReportService";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { CreditReportImporter } from "@/components/CreditReportImporter";

interface LoadingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

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

const Section: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
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
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [normalized, setNormalized] = React.useState<any>(null);
  const [raw, setRaw] = React.useState<any>(null);
  const [capturedUrl, setCapturedUrl] = React.useState<string | undefined>(undefined);
  const [externalRaw, setExternalRaw] = React.useState<any>(null);
  const [steps, setSteps] = React.useState<LoadingStep[]>([
    { id: 'connecting', label: 'Connecting', status: 'pending' },
    { id: 'scraping', label: 'Scraping', status: 'pending' },
    { id: 'saving', label: 'Saving & Rendering', status: 'pending' }
  ]);
  const [renderSuccess, setRenderSuccess] = React.useState(false);
  const [pollingActive, setPollingActive] = React.useState(false);
  const [checkingStatus, setCheckingStatus] = React.useState(false);
  const [showImporter, setShowImporter] = React.useState(false);
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>(undefined);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const runId = params.get("runId") || undefined;

  const handleImportStart = async (runId: string) => {
    console.log('Import started with runId:', runId);
    
    // Update URL with runId and start monitoring
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('runId', runId);
    window.history.pushState({}, '', newUrl.toString());
    
    setActiveRunId(runId);
    setShowImporter(false);
    setCheckingStatus(true);
    
    // Reset steps to initial state - start with connecting
    setSteps([
      { id: 'connecting', label: 'Connecting', status: 'active' },
      { id: 'scraping', label: 'Scraping', status: 'pending' },
      { id: 'saving', label: 'Saving & Rendering', status: 'pending' }
    ]);
    
    // Start the streaming process
    startEventSourceMonitoring(runId);
  };

  // Monitor active runId from URL  
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runId = params.get('runId');
    
    if (runId && runId !== activeRunId) {
      setActiveRunId(runId);
      setCheckingStatus(true);
      
      // Reset steps to initial state
      setSteps([
        { id: 'connecting', label: 'Connecting', status: 'active' },
        { id: 'scraping', label: 'Scraping', status: 'pending' },
        { id: 'saving', label: 'Saving & Rendering', status: 'pending' }
      ]);
      
      startEventSourceMonitoring(runId);
    } else if (!runId) {
      setShowImporter(true);
      setLoading(false);
    }
  }, [activeRunId]);

  // Separate function for starting event source monitoring
  const startEventSourceMonitoring = (runId: string) => {
    // Implementation moved to useEffect below
    setActiveRunId(runId);
  };

  // EventSource and polling logic
  React.useEffect(() => {
    if (!runId) return;

    let eventSource: EventSource | null = null;
    let pollingInterval: NodeJS.Timeout | null = null;
    let silenceTimer: NodeJS.Timeout | null = null;

    const startPolling = () => {
      setPollingActive(true);
      setCheckingStatus(true);
      pollingInterval = setInterval(async () => {
        try {
          const result = await supabase.functions.invoke("credit-report-latest", {
            body: { runId }
          });
          if (result.data?.report && Object.keys(result.data.report).length > 0) {
            setCheckingStatus(false);
            setPollingActive(false);
            if (pollingInterval) clearInterval(pollingInterval);
            // Trigger data refetch
            fetchData();
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 2000);
    };

    const fetchData = async () => {
      try {
        const res: any = await fetchLatestWithFallback(runId);
        const norm = res?.report || null;
        const rawData = res?.raw || null;
        const capUrl = res?.capturedDataTemporaryUrl;
        
        if (norm || rawData) {
          setNormalized(norm);
          setRaw(rawData);
          setCapturedUrl(capUrl);
          setLoading(false);
          setRenderSuccess(true);
          setSteps(prev => prev.map(s => 
            s.id === 'connecting' ? { ...s, status: 'completed' } :
            s.id === 'scraping' ? { ...s, status: 'completed' } :
            s.id === 'saving' ? { ...s, status: 'completed' } : s
          ));
        }
      } catch (e) {
        console.error("credit-report: fetch error", e);
        setLoading(false);
      }
    };

    const startEventSource = () => {
      try {
        // Create EventSource with proper URL
        const streamUrl = `${SUPABASE_URL}/functions/v1/smart-credit-import-stream`;
        console.log('Creating EventSource for:', streamUrl);
        
        // Use POST request for EventSource with runId in body
        supabase.auth.getSession().then(({ data }) => {
          return fetch(streamUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.session?.access_token || ''}`,
            },
            body: JSON.stringify({ runId })
          });
        }).then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body reader');
          
          // Start silence timer to fallback to polling if no SSE within 15s
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            startPolling();
          }, 15000);
          
          const pump = () => {
            return reader.read().then(({ done, value }) => {
              if (done) {
                console.log('Stream complete');
                return;
              }
              
              const chunk = new TextDecoder().decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    console.log('Stream message:', data);
                    // Reset silence timer on every message
                    if (silenceTimer) clearTimeout(silenceTimer);
                    silenceTimer = setTimeout(() => { startPolling(); }, 15000);
                    
                    if (data.type === 'status' && data.status === 'connecting') {
                      setSteps(prev => prev.map(s => s.id === 'connecting' ? { ...s, status: 'active' } : s));
                    } else if (data.type === 'status' && data.status === 'scraping') {
                      setSteps(prev => prev.map(s => 
                        s.id === 'connecting' ? { ...s, status: 'completed' } :
                        s.id === 'scraping' ? { ...s, status: 'active' } : s
                      ));
                    } else if (data.type === 'snapshot' || data.type === 'done') {
                      setSteps(prev => prev.map(s => 
                        s.id === 'connecting' ? { ...s, status: 'completed' } :
                        s.id === 'scraping' ? { ...s, status: 'completed' } :
                        s.id === 'saving' ? { ...s, status: 'active' } : s
                      ));
                      setCheckingStatus(true);
                      setPollingActive(true);
                      // Trigger data refetch
                      fetchData();
                      return;
                    } else if (data.type === 'error') {
                      console.error('Stream error:', data);
                      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
                      setCheckingStatus(false);
                      setPollingActive(false);
                      return;
                    }
                  } catch (parseError) {
                    console.warn('Failed to parse stream data:', parseError);
                  }
                }
              }
              
              return pump();
            });
          };
          
          return pump();
        }).catch(error => {
          console.error('Stream fetch error:', error);
          // Start polling fallback after 15s
          silenceTimer = setTimeout(() => {
            startPolling();
          }, 15000);
        });
        
      } catch (error) {
        console.error('Failed to create stream:', error);
        // Fallback to polling immediately
        startPolling();
      }
    };

    // Try streaming first, fallback to polling
    startEventSource();

    // Initial data fetch
    fetchData();

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
      if (silenceTimer) clearTimeout(silenceTimer);
    };
  }, [runId]);

  // External captured URL fetch
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

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'active':
        return <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="credit-report-root">
      {/* Navigation Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm" data-testid="credit-report-navbar">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" asChild aria-label="Back to previous page">
                <Link to="/">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Link>
              </Button>
              <div>
                <p className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Credit Report
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Import Progress */}
      <div className="border-b bg-card/50" data-testid="smart-import-progress">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Importing Credit Report</h2>
              {checkingStatus && <p className="text-sm text-muted-foreground">Checking...</p>}
            </div>
            <div className="flex items-center gap-6">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-2">
                  {getStepIcon(step.status)}
                  <span className={`text-sm ${step.status === 'completed' ? 'text-emerald-600' : step.status === 'active' ? 'text-primary' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                  {index < steps.length - 1 && (
                    <div className="ml-4 h-px w-8 bg-border" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Success Banner */}
      {renderSuccess && (
        <Alert className="mx-6 mt-4">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Saved & Rendered at {new Date().toLocaleString()}
          </AlertDescription>
        </Alert>
      )}

      <div className="container mx-auto px-6 py-8 space-y-6">
        {showImporter ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <CreditReportImporter onImportStart={handleImportStart} />
          </div>
        ) : loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[320px] w-full" />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview" data-testid="credit-report-tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="scores" data-testid="credit-report-tab-scores">Scores</TabsTrigger>
              <TabsTrigger value="accounts" data-testid="credit-report-tab-accounts">Accounts</TabsTrigger>
              <TabsTrigger value="consumer-statements" data-testid="credit-report-tab-consumer-statements">Consumer Statements</TabsTrigger>
              <TabsTrigger value="public-records" data-testid="credit-report-tab-public-records">Public Records</TabsTrigger>
              <TabsTrigger value="collections" data-testid="credit-report-tab-collections">Collections</TabsTrigger>
              <TabsTrigger value="inquiries" data-testid="credit-report-tab-inquiries">Inquiries</TabsTrigger>
              <TabsTrigger value="personal-info" data-testid="credit-report-tab-personal-info">Personal Info</TabsTrigger>
              <TabsTrigger value="creditor-addresses" data-testid="credit-report-tab-creditor-addresses">Creditor Addresses</TabsTrigger>
              <TabsTrigger value="raw-json" data-testid="credit-report-tab-raw-json">Raw JSON</TabsTrigger>
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
