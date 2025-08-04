import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  Bug, 
  Database, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Trash2,
  Search
} from 'lucide-react';

interface PipelineIssue {
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  details?: any;
  fix?: () => Promise<void>;
}

export const DataPipelineDebugger: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDebugging, setIsDebugging] = useState(false);
  const [issues, setIssues] = useState<PipelineIssue[]>([]);
  const [debugResults, setDebugResults] = useState<any>(null);

  const runComprehensiveDebug = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to run diagnostics.",
        variant: "destructive"
      });
      return;
    }

    setIsDebugging(true);
    setIssues([]);
    setDebugResults(null);

    try {
      console.log('🔍 Starting comprehensive pipeline debug...');
      
      const foundIssues: PipelineIssue[] = [];
      const results: any = {
        timestamp: new Date().toISOString(),
        userId: user.id,
        checks: {}
      };

      // 1. Check credit reports status
      console.log('📊 Checking credit reports...');
      const { data: reports, error: reportsError } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('user_id', user.id);

      if (reportsError) {
        foundIssues.push({
          type: 'error',
          title: 'Database Access Error',
          description: 'Cannot access credit reports table',
          details: reportsError
        });
      } else {
        results.checks.creditReports = {
          total: reports?.length || 0,
          statuses: {}
        };

        if (reports && reports.length > 0) {
          // Analyze report statuses
          const statusCounts = reports.reduce((acc: any, report) => {
            acc[report.extraction_status] = (acc[report.extraction_status] || 0) + 1;
            return acc;
          }, {});
          
          results.checks.creditReports.statuses = statusCounts;

          // Check for stuck processing reports
          const stuckReports = reports.filter(r => 
            r.extraction_status === 'processing' && 
            new Date(r.updated_at) < new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
          );

          if (stuckReports.length > 0) {
            foundIssues.push({
              type: 'warning',
              title: 'Stuck Processing Reports',
              description: `${stuckReports.length} reports stuck in processing state`,
              details: stuckReports,
              fix: async () => {
                for (const report of stuckReports) {
                  await supabase
                    .from('credit_reports')
                    .update({ 
                      extraction_status: 'failed',
                      processing_errors: 'Processing timeout - reset by debugger'
                    })
                    .eq('id', report.id);
                }
                toast({ title: "Fixed", description: "Reset stuck reports to failed status" });
              }
            });
          }

          // Check for reports with no extracted data
          const emptyTextReports = reports.filter(r => 
            r.extraction_status === 'completed' && (!r.raw_text || r.raw_text.length < 100)
          );

          if (emptyTextReports.length > 0) {
            foundIssues.push({
              type: 'error',
              title: 'Empty Text Extraction',
              description: `${emptyTextReports.length} reports marked complete but have no/minimal text`,
              details: emptyTextReports
            });
          }

          // Check parsed data for each report
          for (const report of reports.slice(0, 5)) { // Limit to first 5 for performance
            const [personalInfo, accounts, inquiries, negativeItems] = await Promise.all([
              supabase.from('personal_information').select('*').eq('report_id', report.id),
              supabase.from('credit_accounts').select('*').eq('report_id', report.id),
              supabase.from('credit_inquiries').select('*').eq('report_id', report.id),
              supabase.from('negative_items').select('*').eq('report_id', report.id)
            ]);

            const dataExists = (personalInfo.data?.length || 0) + 
                              (accounts.data?.length || 0) + 
                              (inquiries.data?.length || 0) + 
                              (negativeItems.data?.length || 0) > 0;

            if (report.extraction_status === 'completed' && !dataExists) {
              foundIssues.push({
                type: 'error',
                title: 'Parsing Failure',
                description: `Report ${report.id} extracted but no structured data found`,
                details: {
                  reportId: report.id,
                  fileName: report.file_name,
                  textLength: report.raw_text?.length || 0
                }
              });
            }

            results.checks[`report_${report.id}`] = {
              id: report.id,
              status: report.extraction_status,
              textLength: report.raw_text?.length || 0,
              parsedData: {
                personalInfo: personalInfo.data?.length || 0,
                accounts: accounts.data?.length || 0,
                inquiries: inquiries.data?.length || 0,
                negativeItems: negativeItems.data?.length || 0
              }
            };
          }
        } else {
          foundIssues.push({
            type: 'info',
            title: 'No Credit Reports',
            description: 'No credit reports found for this user',
            details: { recommendation: 'Upload a credit report to start' }
          });
        }
      }

      // 2. Check edge function health
      console.log('🔧 Checking edge function health...');
      try {
        const { data: healthCheck, error: healthError } = await supabase.functions.invoke('advanced-pdf-extract', {
          body: { healthCheck: true }
        });

        if (healthError) {
          foundIssues.push({
            type: 'warning',
            title: 'Edge Function Issues',
            description: 'Advanced PDF extraction function not responding correctly',
            details: healthError
          });
        }
      } catch (funcError) {
        foundIssues.push({
          type: 'warning',
          title: 'Edge Function Connection',
          description: 'Cannot reach advanced PDF extraction function',
          details: funcError
        });
      }

      // 3. Check sessions and rounds
      console.log('📝 Checking sessions and rounds...');
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', user.id);

      const { data: rounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('user_id', user.id);

      results.checks.sessions = {
        total: sessions?.length || 0,
        active: sessions?.filter(s => s.status === 'active').length || 0
      };

      results.checks.rounds = {
        total: rounds?.length || 0,
        byStatus: rounds?.reduce((acc: any, round) => {
          acc[round.status] = (acc[round.status] || 0) + 1;
          return acc;
        }, {}) || {}
      };

      // 4. Storage check
      console.log('💾 Checking storage...');
      try {
        const { data: files, error: storageError } = await supabase.storage
          .from('credit-reports')
          .list(user.id, { limit: 10 });

        if (storageError) {
          foundIssues.push({
            type: 'warning',
            title: 'Storage Access Issues',
            description: 'Cannot access user storage folder',
            details: storageError
          });
        } else {
          results.checks.storage = {
            filesFound: files?.length || 0
          };
        }
      } catch (storageErr) {
        foundIssues.push({
          type: 'error',
          title: 'Storage Connection Error',
          description: 'Cannot connect to storage service',
          details: storageErr
        });
      }

      setIssues(foundIssues);
      setDebugResults(results);

      toast({
        title: "🔍 Debug Complete",
        description: `Found ${foundIssues.length} issues. Review results below.`,
        variant: foundIssues.length > 0 ? "destructive" : "default"
      });

    } catch (error) {
      console.error('Debug failed:', error);
      toast({
        title: "Debug Failed",
        description: `Error during debugging: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsDebugging(false);
    }
  };

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default: return <Bug className="h-4 w-4" />;
    }
  };

  const getIssueVariant = (type: string) => {
    switch (type) {
      case 'error': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'outline';
      default: return 'default';
    }
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          Data Pipeline Debugger
        </CardTitle>
        <CardDescription>
          Comprehensive diagnostic tool to identify and fix data extraction and processing issues
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Debug Controls */}
        <div className="flex gap-4">
          <Button 
            onClick={runComprehensiveDebug}
            disabled={isDebugging}
            className="flex items-center gap-2"
          >
            {isDebugging ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isDebugging ? 'Running Diagnostics...' : 'Run Full Diagnostic'}
          </Button>
        </div>

        {/* Issues List */}
        {issues.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Issues Found ({issues.length})</h3>
            <div className="space-y-3">
              {issues.map((issue, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getIssueIcon(issue.type)}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{issue.title}</h4>
                          <Badge variant={getIssueVariant(issue.type)}>
                            {issue.type.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {issue.description}
                        </p>
                        {issue.details && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer">
                              Show Details
                            </summary>
                            <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                              {JSON.stringify(issue.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                    {issue.fix && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={issue.fix}
                        className="ml-4"
                      >
                        Fix
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug Results */}
        {debugResults && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Debug Results</h3>
            <div className="bg-muted p-4 rounded-lg">
              <pre className="text-sm overflow-auto">
                {JSON.stringify(debugResults, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* No Issues */}
        {!isDebugging && issues.length === 0 && debugResults && (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-700">All Systems Healthy</h3>
            <p className="text-muted-foreground">No issues detected in the data pipeline</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};