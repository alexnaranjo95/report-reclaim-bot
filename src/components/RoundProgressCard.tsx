import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Upload, Eye, Download } from 'lucide-react';
import { CreditReport } from '@/services/CreditReportService';

interface RoundProgressCardProps {
  roundNumber: number;
  creditReport?: CreditReport;
  isCurrentRound?: boolean;
  onUploadReport?: (roundNumber: number) => void;
  onPreviewReport?: (report: CreditReport) => void;
  onViewReport?: (reportId: string) => void;
}

export const RoundProgressCard: React.FC<RoundProgressCardProps> = ({
  roundNumber,
  creditReport,
  isCurrentRound = false,
  onUploadReport,
  onPreviewReport,
  onViewReport,
}) => {
  return (
    <Card className={`${isCurrentRound ? 'ring-2 ring-primary' : ''} transition-all duration-200 hover:shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">Round {roundNumber}</h3>
            {isCurrentRound && (
              <Badge variant="secondary" className="text-xs">
                Current
              </Badge>
            )}
          </div>
          {creditReport && (
            <Badge variant="outline" className="text-xs">
              {creditReport.bureau_name}
            </Badge>
          )}
        </div>

        {creditReport ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span className="truncate">{creditReport.file_name}</span>
            </div>
            
            <div className="text-xs text-muted-foreground">
              Uploaded: {new Date(creditReport.created_at).toLocaleDateString()}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPreviewReport?.(creditReport)}
                className="flex-1"
              >
                <Eye className="w-3 h-3 mr-1" />
                Preview
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => onViewReport?.(creditReport.id)}
                className="flex-1"
              >
                View Details
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                <Upload className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No credit report uploaded
              </p>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUploadReport?.(roundNumber)}
              className="w-full"
              disabled={!isCurrentRound}
            >
              <Upload className="w-3 h-3 mr-1" />
              Upload Report
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};