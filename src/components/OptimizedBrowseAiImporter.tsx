import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Download,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Logger } from '@/utils/logger';
import OptimizedCreditReport from './OptimizedCreditReport';

interface ImportState {
  phase: 'idle' | 'connecting' | 'importing' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
  runId?: string;
  data?: any;
}

/**
 * Optimized BrowseAI Importer
 * - Lazy loads heavy components
 * - Uses tabs to separate views
 * - Processes data efficiently
 */
const OptimizedBrowseAiImporter: React.FC = () => {
  const [state, setState] = useState<ImportState>({
    phase: 'idle',
    progress: 0,
    message: ''
  });
  
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [activeView, setActiveView] = useState<'import' | 'report' | 'raw'>('import');
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);
  
  // Effect for cleanup
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
  
  // Handle import start
  const handleImport = useCallback(async () => {
    if (!credentials.email || !credentials.password) {
      setState(prev => ({
        ...prev,
        phase: 'error',
        error: 'Please enter email and password'
      }));
      return;
    }
    
    setState({
      phase: 'connecting',
      progress: 10,
      message: 'Connecting to service...'
    });
    
    try {
      Logger.info('Starting credit report import');
      
      // Call the connect and start function
      const { data, error } = await supabase.functions.invoke(
        'smart-credit-connect-and-start',
        {
          body: {
            email: credentials.email.trim(),
            password: credentials.password.trim()
          }
        }
      );
      
      if (error) {
        throw new Error(error.message || 'Failed to connect');
      }
      
      if (!data?.ok || !data?.runId) {
        throw new Error(data?.message || 'Failed to start import');
      }
      
      const runId = data.runId;
      Logger.info(`Import started with runId: ${runId}`);
      
      setState(prev => ({
        ...prev,
        phase: 'importing',
        progress: 30,
        message: 'Importing credit report...',
        runId
      }));
      
      // Start monitoring the import
      monitorImport(runId);
      
    } catch (error) {
      Logger.error('Import failed:', error);
      setState(prev => ({
        ...prev,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Import failed'
      }));
    }
  }, [credentials]);
  
  // Monitor import progress
  const monitorImport = useCallback((runId: string) => {
    // Simple polling approach
    let attempts = 0;
    const maxAttempts = 60;
    
    const poll = async () => {
      attempts++;
      
      try {
        const { data, error } = await supabase.functions.invoke(
          'credit-report-latest',
          { body: { runId } }
        );
        
        if (error) {
          throw error;
        }
        
        if (data && Object.keys(data).length > 0) {
          Logger.success('Import completed successfully');
          
          setState({
            phase: 'complete',
            progress: 100,
            message: 'Import completed',
            runId,
            data
          });
          
          // Clear interval
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          
          // Switch to report view
          setActiveView('report');
          
        } else if (attempts >= maxAttempts) {
          throw new Error('Import timeout');
        } else {
          // Update progress
          const progress = Math.min(30 + (attempts * 1), 90);
          setState(prev => ({
            ...prev,
            progress,
            message: `Processing... (${attempts}/${maxAttempts})`
          }));
        }
      } catch (error) {
        Logger.error('Polling error:', error);
        
        if (attempts >= maxAttempts) {
          setState(prev => ({
            ...prev,
            phase: 'error',
            error: 'Import timed out. Please try again.'
          }));
          
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
      }
    };
    
    // Start polling
    poll();
    pollIntervalRef.current = setInterval(poll, 3000);
  }, []);
  
  // Reset state
  const reset = useCallback(() => {
    cleanup();
    setState({
      phase: 'idle',
      progress: 0,
      message: ''
    });
    setActiveView('import');
  }, [cleanup]);
  
  // Export data
  const exportData = useCallback(() => {
    if (!state.data) return;
    
    const blob = new Blob([JSON.stringify(state.data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-report-${state.runId || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.data, state.runId]);
  
  return (
    <div className="space-y-6">
      {/* Status Bar */}
      {state.phase !== 'idle' && state.phase !== 'complete' && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{state.message}</span>
                <span className="text-sm text-muted-foreground">
                  {state.progress}%
                </span>
              </div>
              <Progress value={state.progress} />
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Error Alert */}
      {state.phase === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {state.error}
            <Button 
              variant="link" 
              size="sm" 
              onClick={reset}
              className="ml-2"
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Success Alert */}
      {state.phase === 'complete' && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Credit report imported successfully!
          </AlertDescription>
        </Alert>
      )}
      
      {/* Main Content */}
      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="report" disabled={!state.data}>
            Report
          </TabsTrigger>
          <TabsTrigger value="raw" disabled={!state.data}>
            Raw Data
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="import">
          <Card>
            <CardHeader>
              <CardTitle>Import Credit Report</CardTitle>
            </CardHeader>
            <CardContent>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleImport();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={credentials.email}
                    onChange={(e) => setCredentials(prev => ({
                      ...prev,
                      email: e.target.value
                    }))}
                    disabled={state.phase !== 'idle' && state.phase !== 'error'}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={credentials.password}
                      onChange={(e) => setCredentials(prev => ({
                        ...prev,
                        password: e.target.value
                      }))}
                      disabled={state.phase !== 'idle' && state.phase !== 'error'}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={state.phase !== 'idle' && state.phase !== 'error'}
                    className="flex-1"
                  >
                    {state.phase === 'connecting' || state.phase === 'importing' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      'Import Credit Report'
                    )}
                  </Button>
                  
                  {state.phase === 'complete' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={reset}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="report">
          {state.data && (
            <OptimizedCreditReport 
              data={state.data}
              runId={state.runId}
              onRefresh={reset}
            />
          )}
        </TabsContent>
        
        <TabsContent value="raw">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Raw Data</CardTitle>
                <Button size="sm" variant="outline" onClick={exportData}>
                  <Download className="h-4 w-4 mr-2" />
                  Export JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px]">
                <code className="text-xs">
                  {JSON.stringify(state.data, null, 2)}
                </code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OptimizedBrowseAiImporter;