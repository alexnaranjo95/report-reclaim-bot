import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import CreditReportUpload from '@/components/CreditReportUpload';
import CreditReportService, { type CreditReport } from '@/services/CreditReportService';
import { PDFExtractionService } from '@/services/PDFExtractionService';
import { toast } from 'sonner';
import { 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  BarChart3,
  Calendar,
  Building2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  PlayCircle,
  RefreshCw
} from 'lucide-react';

const CreditReportsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<CreditReport[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    byBureau: Record<string, number>;
    recentCount: number;
  }>({ total: 0, byBureau: {}, recentCount: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upload');

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    loadReports();
  }, [user, navigate]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const [reportsData, summaryData] = await Promise.all([
        CreditReportService.getUserCreditReports(),
        CreditReportService.getReportSummary()
      ]);
      
      setReports(reportsData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Error loading reports:', error);
      toast.error('Failed to load credit reports');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (report: CreditReport) => {
    if (!report.file_path) {
      toast.error('File not available for download');
      return;
    }

    try {
      const downloadUrl = await CreditReportService.getFileDownloadUrl(report.file_path);
      
      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = report.file_name || `${report.bureau_name}_report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Download started');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file');
    }
  };

  const handleDelete = async (report: CreditReport) => {
    if (!confirm('Are you sure you want to delete this credit report? This action cannot be undone.')) {
      return;
    }

    try {
      await CreditReportService.deleteCreditReport(report.id);
      toast.success('Credit report deleted successfully');
      loadReports(); // Refresh the list
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete credit report');
    }
  };

  const handleExtractText = async (report: CreditReport) => {
    try {
      toast.loading('Starting text extraction...', { id: 'extract-text' });
      await PDFExtractionService.extractText(report.id);
      toast.success('Text extraction started! This may take a few minutes.', { id: 'extract-text' });
      loadReports(); // Refresh to show updated status
    } catch (error) {
      console.error('Extract error:', error);
      toast.error(`Failed to start extraction: ${error.message}`, { id: 'extract-text' });
    }
  };

  const handleRetryExtraction = async (report: CreditReport) => {
    try {
      toast.loading('Retrying text extraction...', { id: 'retry-extract' });
      await PDFExtractionService.retryExtraction(report.id);
      toast.success('Text extraction restarted!', { id: 'retry-extract' });
      loadReports(); // Refresh to show updated status
    } catch (error) {
      console.error('Retry error:', error);
      toast.error(`Failed to retry extraction: ${error.message}`, { id: 'retry-extract' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      completed: 'default',
      processing: 'secondary',
      failed: 'destructive',
      pending: 'outline',
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Credit Reports</h1>
          <p className="text-muted-foreground">
            Upload and manage your credit reports for analysis
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <FileText className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{summary.total}</p>
                <p className="text-sm text-muted-foreground">Total Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Calendar className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{summary.recentCount}</p>
                <p className="text-sm text-muted-foreground">Recent (30 days)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Building2 className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{Object.keys(summary.byBureau).length}</p>
                <p className="text-sm text-muted-foreground">Bureaus Covered</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <BarChart3 className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {reports.filter(r => r.extraction_status === 'completed').length}
                </p>
                <p className="text-sm text-muted-foreground">Ready for Analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upload">
            <Upload className="w-4 h-4 mr-2" />
            Upload Reports
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText className="w-4 h-4 mr-2" />
            My Reports ({reports.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <CreditReportUpload />
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          {loading ? (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-2">Loading reports...</span>
                </div>
              </CardContent>
            </Card>
          ) : reports.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Credit Reports</h3>
                <p className="text-muted-foreground mb-4">
                  You haven't uploaded any credit reports yet.
                </p>
                <Button onClick={() => setActiveTab('upload')}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Your First Report
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <Card key={report.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <FileText className="w-8 h-8 text-primary mt-1" />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium truncate">
                              {report.file_name || `${report.bureau_name} Report`}
                            </h3>
                            {getStatusIcon(report.extraction_status)}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                            <div className="flex items-center gap-1">
                              <Building2 className="w-4 h-4" />
                              <span>{report.bureau_name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>{formatDate(report.created_at)}</span>
                            </div>
                            {report.report_date && (
                              <div>
                                Report Date: {new Date(report.report_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {getStatusBadge(report.extraction_status)}
                            {report.processing_errors && (
                              <Badge variant="destructive">Has Errors</Badge>
                            )}
                          </div>

                          {report.processing_errors && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                              {report.processing_errors}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {/* Extract Text Button */}
                        {report.file_path && 
                         report.extraction_status !== 'processing' && 
                         report.extraction_status !== 'completed' && 
                         !report.raw_text && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExtractText(report)}
                            title="Extract text from PDF"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </Button>
                        )}
                        
                        {/* Retry Extraction Button */}
                        {report.extraction_status === 'failed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetryExtraction(report)}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
                        
                        {/* Download Button */}
                        {report.file_path && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(report)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        
                        {/* Delete Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(report)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CreditReportsPage;