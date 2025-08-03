import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, Building2, AlertTriangle, TrendingUp, Eye } from 'lucide-react';
import { CreditReport } from '@/services/CreditReportService';

interface CreditReportCardProps {
  report: CreditReport;
  accountCount?: number;
  negativeItemCount?: number;
  onViewReport: () => void;
  onPreviewReport?: () => void;
}

export const CreditReportCard: React.FC<CreditReportCardProps> = ({
  report,
  accountCount = 0,
  negativeItemCount = 0,
  onViewReport,
  onPreviewReport
}) => {
  const getBureauLogo = (bureau: string) => {
    const bureauName = bureau.toLowerCase();
    return (
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5" />
        <span className="font-semibold">{bureau}</span>
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = () => {
    switch (report.extraction_status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Ready</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {getBureauLogo(report.bureau_name)}
            <div className="mt-2 space-y-1">
              {report.report_date && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Report Date: {formatDate(report.report_date)}
                </div>
              )}
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                Uploaded: {formatDate(report.created_at)}
              </div>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{accountCount}</div>
            <div className="text-sm text-muted-foreground">Accounts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-destructive">{negativeItemCount}</div>
            <div className="text-sm text-muted-foreground">Negative Items</div>
          </div>
        </div>

        {negativeItemCount > 0 && (
          <div className="mb-4 p-2 bg-destructive/10 border border-destructive/20 rounded flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-sm text-destructive font-medium">
              {negativeItemCount} issue{negativeItemCount !== 1 ? 's' : ''} found
            </span>
          </div>
        )}

        <div className="flex gap-2">
          {onPreviewReport && report.file_path && (
            <Button 
              onClick={onPreviewReport}
              variant="outline"
              className="flex-1"
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          )}
          <Button 
            onClick={onViewReport} 
            className="flex-1"
            disabled={report.extraction_status !== 'completed'}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            View Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};