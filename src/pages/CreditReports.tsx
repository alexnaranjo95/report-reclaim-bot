import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { CreditReportCard } from '@/components/CreditReportCard';
import { FullCreditReportViewer } from '@/components/FullCreditReportViewer';
import { RoundProgressCard } from '@/components/RoundProgressCard';
import { CreditReportService, type CreditReport } from '@/services/CreditReportService';
// removed SmartCreditLoginForm import (moved to Import section)
import { CreditReportPreviewModal } from '@/components/CreditReportPreviewModal';
import { CreditReportAnalysis } from '@/components/CreditReportAnalysis';
import { CreditReportTimeline } from '@/components/CreditReportTimeline';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  FileText, 
  Filter,
  ArrowLeft,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

const CreditReportsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<CreditReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<CreditReport[]>([]);
  const [selectedBureau, setSelectedBureau] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('date-desc');
  const [loading, setLoading] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportCounts, setReportCounts] = useState<Record<string, { accounts: number; negatives: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // removed showUpload state
  const [previewReport, setPreviewReport] = useState<CreditReport | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [viewMode, setViewMode] = useState<'rounds' | 'list'>('rounds');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    loadReports();
  }, [user]);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const reportsData = await CreditReportService.getUserCreditReports();
      setReports(reportsData);
      
      // Load counts for each report - but don't fail if this fails
      const counts: Record<string, { accounts: number; negatives: number }> = {};
      
      // Process reports one by one to avoid overwhelming the database
      for (const report of reportsData) {
        try {
          const [accountsResult, negativesResult] = await Promise.all([
            supabase.from('credit_accounts').select('id').eq('report_id', report.id),
            supabase.from('credit_accounts').select('id').eq('report_id', report.id).eq('is_negative', true)
          ]);
          
          counts[report.id] = {
            accounts: accountsResult.data?.length || 0,
            negatives: negativesResult.data?.length || 0
          };
        } catch (error) {
          // Silently fail for individual report counts
          counts[report.id] = { accounts: 0, negatives: 0 };
        }
      }
      
      setReportCounts(counts);
    } catch (error) {
      // Always allow the page to render, even if loading fails
      setReports([]);
      setReportCounts({});
      setError(`Failed to load credit reports: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast.error('Failed to load credit reports - you can try refreshing');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
    toast.success('Credit reports refreshed successfully');
  };

  // Filter and sort reports
  useEffect(() => {
    let filtered = [...reports];
    
    // Filter by bureau
    if (selectedBureau !== 'all') {
      filtered = filtered.filter(report => report.bureau_name === selectedBureau);
    }
    
    // Sort reports
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date-asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'bureau':
          return a.bureau_name.localeCompare(b.bureau_name);
        case 'report-date':
          if (!a.report_date && !b.report_date) return 0;
          if (!a.report_date) return 1;
          if (!b.report_date) return -1;
          return new Date(b.report_date).getTime() - new Date(a.report_date).getTime();
        default:
          return 0;
      }
    });
    
    setFilteredReports(filtered);
  }, [reports, selectedBureau, sortBy]);

  const handleViewReport = (reportId: string) => {
    setSelectedReportId(reportId);
  };

  const handleBackToReports = () => {
    setSelectedReportId(null);
  };

  const handlePreviewReport = (report: CreditReport) => {
    setPreviewReport(report);
  };


  const handleUploadForRound = (roundNumber: number) => {
    setCurrentRound(roundNumber);
  };

  // Get reports organized by rounds (assuming round 1 for now)
  const getReportsByRound = () => {
    const roundReports: Record<number, CreditReport | undefined> = {};
    
    // For now, assign the first report to round 1
    // In the future, this should be based on actual round data from the database
    if (reports.length > 0) {
      roundReports[1] = reports[0];
    }
    
    return roundReports;
  };

  const getBureauCounts = () => {
    const counts = { Equifax: 0, Experian: 0, TransUnion: 0 };
    reports.forEach(report => {
      if (counts.hasOwnProperty(report.bureau_name)) {
        counts[report.bureau_name as keyof typeof counts]++;
      }
    });
    return counts;
  };

  const getTotalNegativeItems = () => {
    return Object.values(reportCounts).reduce((sum, count) => sum + count.negatives, 0);
  };

  const getTotalAccounts = () => {
    return Object.values(reportCounts).reduce((sum, count) => sum + count.accounts, 0);
  };

  // Always render the page - don't block on user authentication
  // The page will show appropriate states for authenticated/unauthenticated users

  // Show credit report analysis if a report is selected
  if (selectedReportId) {
    const selectedReport = reports.find(r => r.id === selectedReportId);
    return (
      <CreditReportAnalysis
        reportId={selectedReportId}
        reportName={selectedReport?.file_name || 'Credit Report'}
        onBack={handleBackToReports}
      />
    );
  }


  const bureauCounts = getBureauCounts();

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" asChild>
                <Link to="/">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Credit Reports
                </h1>
                <p className="text-muted-foreground">
                  View and analyze your complete credit report data
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'rounds' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('rounds')}
              >
                Round View
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                List View
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 space-y-6">

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{reports.length}</div>
            <div className="text-sm text-muted-foreground">Total Reports</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-destructive">{getTotalNegativeItems()}</div>
            <div className="text-sm text-muted-foreground">Negative Items</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{getTotalAccounts()}</div>
            <div className="text-sm text-muted-foreground">Total Accounts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{reports.filter(r => r.extraction_status === 'completed').length}</div>
            <div className="text-sm text-muted-foreground">Reports Ready</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Sort */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filter:</span>
        </div>
        
        <Button
          variant={selectedBureau === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedBureau('all')}
        >
          All ({reports.length})
        </Button>
        
        <Button
          variant={selectedBureau === 'Equifax' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedBureau('Equifax')}
        >
          Equifax ({bureauCounts.Equifax})
        </Button>
        
        <Button
          variant={selectedBureau === 'Experian' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedBureau('Experian')}
        >
          Experian ({bureauCounts.Experian})
        </Button>
        
        <Button
          variant={selectedBureau === 'TransUnion' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedBureau('TransUnion')}
        >
          TransUnion ({bureauCounts.TransUnion})
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm font-medium">Sort by:</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Date - Newest First ↓</SelectItem>
              <SelectItem value="date-asc">Date - Oldest First ↑</SelectItem>
              <SelectItem value="bureau">Bureau Name</SelectItem>
              <SelectItem value="report-date">Report Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="w-5 h-5" />
                <div>
                  <h3 className="font-medium">Error Loading Reports</h3>
                  <p className="text-sm">{error}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reports Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2">Loading reports...</span>
          </div>
        ) : viewMode === 'rounds' ? (
          <CreditReportTimeline
            rounds={getReportsByRound()}
            currentRound={currentRound}
            onUploadReport={handleUploadForRound}
            onPreviewReport={handlePreviewReport}
            onViewReport={handleViewReport}
          />
        ) : filteredReports.length === 0 && !error ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">
              {reports.length === 0 ? 'No Credit Reports' : 'No Reports Match Filter'}
            </h3>
            <p className="text-muted-foreground mb-6">
              {reports.length === 0 
                ? 'Get started by uploading your credit reports from the Dashboard for complete analysis.'
                : 'Try adjusting your filter settings to see more reports.'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map((report) => (
            <CreditReportCard
              key={report.id}
              report={report}
              accountCount={reportCounts[report.id]?.accounts || 0}
              negativeItemCount={reportCounts[report.id]?.negatives || 0}
              onViewReport={() => handleViewReport(report.id)}
              onPreviewReport={() => handlePreviewReport(report)}
            />
          ))}
        </div>
      )}


      {/* Preview Modal */}
      <CreditReportPreviewModal
        report={previewReport}
        isOpen={!!previewReport}
        onClose={() => setPreviewReport(null)}
      />
      </div>
    </div>
  );
};

export default CreditReportsPage;