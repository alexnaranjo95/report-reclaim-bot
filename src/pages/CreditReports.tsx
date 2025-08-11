import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import HtmlBlock from "@/components/HtmlBlock";
import VirtualizedHtmlList from "@/components/VirtualizedHtmlList";
import JsonView from "@/components/JsonView";
import { fetchLatestWithFallback } from "@/services/NormalizedReportService";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Data state
  const [loading, setLoading] = useState(true);
  const [normalized, setNormalized] = useState<any>(null);
  const [raw, setRaw] = useState<any>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | undefined>(undefined);
  const [externalRaw, setExternalRaw] = useState<any>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  
  // Progress state
  const [steps, setSteps] = useState<LoadingStep[]>([
    { id: 'connecting', label: 'Connecting', status: 'pending' },
    { id: 'scraping', label: 'Scraping', status: 'pending' },
    { id: 'saving', label: 'Saving & Rendering', status: 'pending' }
  ]);
  const [renderSuccess, setRenderSuccess] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  
  // EventSource management
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const runId = searchParams.get("runId") || undefined;

  // Cleanup function
  const cleanup = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // Handle form submission
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      setConnectionError('Please enter both email and password');
      return;
    }

    setConnecting(true);
    setConnectionError(null);
    setSteps(prev => prev.map(s => s.id === 'connecting' ? { ...s, status: 'active' } : s));

    try {
      console.log('Calling smart-credit-connect-and-start...');
      
      const { data, error } = await supabase.functions.invoke('smart-credit-connect-and-start', {
        body: { email: email.trim(), password: password.trim() }
      });

      if (error) {
        throw new Error(error.message || 'Failed to connect to service');
      }

      if (!data?.ok || !data?.runId) {
        const errorCode = data?.code || 'UNKNOWN_ERROR';
        const errorMessage = data?.message || 'Failed to start import';
        
        if (errorCode === 'AUTH_BAD_KEY') {
          throw new Error('Service configuration error. Please contact support.');
        } else if (errorCode === 'ROBOT_NOT_FOUND') {
          throw new Error('Import service not available. Please contact support.');
        } else if (errorCode === 'RUN_FAILED') {
          throw new Error(`Import failed: ${errorMessage}`);
        } else if (errorCode === 'E_INPUT') {
          throw new Error('Please enter valid email and password');
        } else {
          throw new Error(errorMessage);
        }
      }

      const newRunId = data.runId;
      console.log('Connection successful, runId:', newRunId);
      
      // Update URL with runId
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.set('runId', newRunId);
      navigate(`/credit-report?${newSearchParams.toString()}`, { replace: true });
      
      // Start EventSource monitoring
      startEventSourceMonitoring(newRunId);
      
    } catch (err: any) {
      console.error('Connection error:', err);
      setConnectionError(err.message || 'Failed to start credit report import');
      setSteps(prev => prev.map(s => s.id === 'connecting' ? { ...s, status: 'error' } : s));
    } finally {
      setConnecting(false);
    }
  };

  // Start EventSource monitoring
  const startEventSourceMonitoring = (runId: string) => {
    cleanup(); // Clean up any existing connections
    
    try {
      console.log('Starting EventSource for runId:', runId);
      
      // Get auth token for EventSource
      supabase.auth.getSession().then(({ data }) => {
        const streamUrl = `${SUPABASE_URL}/functions/v1/smart-credit-import-stream`;
        
        // Use fetch with ReadableStream for EventSource-like functionality
        fetch(streamUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.session?.access_token || ''}`,
          },
          body: JSON.stringify({ runId })
        }).then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body reader');
          
          // Set silence timer - fallback to polling if no SSE within 15s
          silenceTimerRef.current = setTimeout(() => {
            console.log('EventSource silent for 15s, starting polling fallback');
            startPollingFallback(runId);
          }, 15000);
          
          const pump = (): Promise<void> => {
            return reader.read().then(({ done, value }) => {
              if (done) {
                console.log('EventSource stream complete');
                return;
              }
              
              const chunk = new TextDecoder().decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const eventData = JSON.parse(line.slice(6));
                    console.log('EventSource message:', eventData);
                    
                    // Reset silence timer on every message
                    if (silenceTimerRef.current) {
                      clearTimeout(silenceTimerRef.current);
                      silenceTimerRef.current = setTimeout(() => {
                        startPollingFallback(runId);
                      }, 15000);
                    }
                    
                    handleEventSourceMessage(eventData, runId);
                  } catch (parseError) {
                    console.warn('Failed to parse EventSource data:', parseError);
                  }
                }
              }
              
              return pump();
            });
          };
          
          return pump();
        }).catch(error => {
          console.error('EventSource fetch error:', error);
          // Start polling fallback immediately on fetch error
          setTimeout(() => startPollingFallback(runId), 1000);
        });
      });
      
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      // Fallback to polling immediately
      startPollingFallback(runId);
    }
  };

  // Handle EventSource messages
  const handleEventSourceMessage = (data: any, runId: string) => {
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
      // Start polling for data
      startDataPolling(runId);
    } else if (data.type === 'error') {
      console.error('EventSource error:', data);
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
      setConnectionError(data.message || 'Import failed');
      setCheckingStatus(false);
      setPollingActive(false);
    }
  };

  // Polling fallback when EventSource is silent
  const startPollingFallback = (runId: string) => {
    if (pollingIntervalRef.current) return; // Already polling
    
    setCheckingStatus(true);
    setPollingActive(true);
    
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const result = await supabase.functions.invoke("credit-report-latest", {
          body: { runId }
        });
        
        if (result.data?.report && Object.keys(result.data.report).length > 0) {
          console.log('Polling detected data, stopping polling');
          setCheckingStatus(false);
          setPollingActive(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          // Trigger data fetch
          fetchData(runId);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2000);
  };

  // Start data polling after snapshot/done events
  const startDataPolling = (runId: string) => {
    if (pollingIntervalRef.current) return; // Already polling
    
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const result = await supabase.functions.invoke("credit-report-latest", {
          body: { runId }
        });
        
        if (result.data?.report && Object.keys(result.data.report).length > 0) {
          console.log('Data polling successful, stopping polling');
          setCheckingStatus(false);
          setPollingActive(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          // Complete the saving step and fetch data
          setSteps(prev => prev.map(s => s.id === 'saving' ? { ...s, status: 'completed' } : s));
          fetchData(runId);
        }
      } catch (error) {
        console.error("Data polling error:", error);
      }
    }, 2000);
  };

  // Fetch and display data
  const fetchData = async (runId?: string) => {
    try {
      const res: any = await fetchLatestWithFallback(runId);
      const norm = res?.report || null;
      const rawData = res?.raw || null;
      const capUrl = res?.capturedDataTemporaryUrl;
      
      console.log(`[CreditReports] Data fetched - Normalized: ${!!norm}, Raw: ${!!rawData}, Source: ${res?.source || 'none'}`);
      
      if (norm || rawData) {
        setNormalized(norm);
        setRaw(rawData);
        setCapturedUrl(capUrl);
        setLoading(false);
        setRenderSuccess(true);
        setSavedAt(new Date().toISOString());
        
        // Log data counts for verification
        if (norm) {
          const accounts = norm?.accounts || {};
          const realEstate = accounts?.realEstate?.length || 0;
          const revolving = accounts?.revolving?.length || 0;
          const other = accounts?.other?.length || 0;
          const scores = norm?.scores?.length || 0;
          console.log(`Credit Report Data - Scores: ${scores}, Real Estate: ${realEstate}, Revolving: ${revolving}, Other: ${other}`);
        }
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error("credit-report: fetch error", e);
      setLoading(false);
    }
  };

  // Handle dry run test
  const handleDryRun = async () => {
    try {
      console.log('Starting dry run test...');
      const { data, error } = await supabase.functions.invoke('credit-report-ingest', {
        body: { dryRun: true, runId: `dry-${Date.now()}`, userId: 'test-user' }
      });
      
      if (error) {
        toast({
          title: "Dry Run Failed",
          description: error.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Dry Run Successful",
          description: `Test data created with runId: ${data.runId}`,
        });
        // Refresh data
        fetchData();
      }
    } catch (error) {
      console.error('Dry run error:', error);
      toast({
        title: "Dry Run Error",
        description: "Failed to execute dry run test",
        variant: "destructive"
      });
    }
  };

  // External captured URL fetch
  useEffect(() => {
    let aborted = false;
    if (!normalized && !raw && capturedUrl) {
      fetch(capturedUrl)
        .then((r) => r.json())
        .then((j) => { if (!aborted) setExternalRaw(j); })
        .catch((e) => console.error("credit-report: captured url fetch error", e));
    }
    return () => { aborted = true; };
  }, [normalized, raw, capturedUrl]);

  // Initialize data fetch and monitoring
  useEffect(() => {
    if (runId) {
      console.log('Initializing with runId:', runId);
      setSteps([
        { id: 'connecting', label: 'Connecting', status: 'active' },
        { id: 'scraping', label: 'Scraping', status: 'pending' },
        { id: 'saving', label: 'Saving & Rendering', status: 'pending' }
      ]);
      
      // Start EventSource monitoring
      startEventSourceMonitoring(runId);
      
      // Initial data fetch
      fetchData(runId);
    } else {
      setLoading(false);
    }

    return cleanup;
  }, [runId]);

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

  const hasData = source && Object.keys(source).length > 0;

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
            <div className="flex items-center gap-2">
              <Button onClick={handleDryRun} variant="outline" size="sm">
                Test Connection
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Import Progress Header */}
      <div className="border-b bg-card/50" data-testid="smart-import-progress">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Importing Credit Report</h2>
              {checkingStatus && <p className="text-sm text-muted-foreground">Checking...</p>}
              {pollingActive && <p className="text-sm text-muted-foreground">Polling for updates...</p>}
            </div>
            <div className="flex items-center gap-6">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-2">
                  {getStepIcon(step.status)}
                  <span className={`text-sm ${
                    step.status === 'completed' ? 'text-emerald-600' : 
                    step.status === 'active' ? 'text-primary' : 
                    step.status === 'error' ? 'text-destructive' :
                    'text-muted-foreground'
                  }`}>
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
      {renderSuccess && savedAt && (
        <Alert className="mx-6 mt-4">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Saved & Rendered at {new Date(savedAt).toLocaleString()}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Banner */}
      {connectionError && (
        <Alert variant="destructive" className="mx-6 mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {connectionError}
          </AlertDescription>
        </Alert>
      )}

      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Smart Credit Import Form */}
        {!runId && (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Smart Credit Import</CardTitle>
              <p className="text-sm text-muted-foreground">
                Connect to Smart Credit to import your latest credit report data
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConnect} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Username</Label>
                  <Input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your username"
                    disabled={connecting}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      disabled={connecting}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                
                <Button type="submit" className="w-full" disabled={connecting}>
                  {connecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect & Import"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Data Display */}
        {(runId || hasData) && (
          <>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-[320px] w-full" />
              </div>
            ) : (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="scores" data-testid="credit-report-tab-scores">Scores</TabsTrigger>
                  <TabsTrigger value="accounts" data-testid="credit-report-tab-accounts">Accounts</TabsTrigger>
                  <TabsTrigger value="consumer-statements">Consumer Statements</TabsTrigger>
                  <TabsTrigger value="public-records">Public Records</TabsTrigger>
                  <TabsTrigger value="collections">Collections</TabsTrigger>
                  <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
                  <TabsTrigger value="personal-info">Personal Info</TabsTrigger>
                  <TabsTrigger value="creditor-addresses">Creditor Addresses</TabsTrigger>
                  <TabsTrigger value="raw-json">Raw JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card data-testid="credit-report-scores">
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

                    <Card data-testid="credit-report-accounts">
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

                <TabsContent value="scores" data-testid="credit-report-scores">
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

                <TabsContent value="accounts" data-testid="credit-report-accounts">
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
                      <AccordionTrigger>Raw JSON Return</AccordionTrigger>
                      <AccordionContent>
                        <JsonView data={raw || normalized || externalRaw || { message: "No data" }} />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CreditReportsPage;