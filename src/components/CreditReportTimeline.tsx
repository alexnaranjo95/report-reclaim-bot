import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Eye, Download } from 'lucide-react';
import { CreditReport } from '@/services/CreditReportService';

interface CreditReportTimelineProps {
  rounds: Record<number, CreditReport | undefined>;
  currentRound: number;
  onUploadReport: (roundNumber: number) => void;
  onPreviewReport: (report: CreditReport) => void;
  onViewReport: (reportId: string) => void;
}

export const CreditReportTimeline: React.FC<CreditReportTimelineProps> = ({
  rounds,
  currentRound,
  onUploadReport,
  onPreviewReport,
  onViewReport,
}) => {
  const getMonthYear = (roundNumber: number) => {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    const targetMonth = (currentMonth + roundNumber - 1) % 12;
    const targetYear = currentYear + Math.floor((currentMonth + roundNumber - 1) / 12);
    
    return `${months[targetMonth]} ${targetYear}`;
  };

  const getRoundStatus = (roundNumber: number) => {
    if (rounds[roundNumber]) return 'completed';
    if (roundNumber === currentRound) return 'current';
    if (roundNumber < currentRound) return 'missed';
    return 'future';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Report Timeline</h2>
        <p className="text-sm text-muted-foreground">
          Track your credit report uploads across all 12 dispute rounds
        </p>
      </div>
      
      {/* Timeline Container */}
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-6 left-8 right-8 h-0.5 bg-border"></div>
        <div 
          className="absolute top-6 left-8 h-0.5 bg-primary transition-all duration-500"
          style={{ 
            width: `${Math.max(0, ((currentRound - 1) / 11) * 100)}%` 
          }}
        ></div>
        
        {/* Timeline Items */}
        <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
          {Array.from({ length: 12 }, (_, index) => {
            const roundNumber = index + 1;
            const status = getRoundStatus(roundNumber);
            const report = rounds[roundNumber];
            
            return (
              <div key={roundNumber} className="flex flex-col items-center">
                {/* Circle */}
                <div 
                  className={`
                    relative z-10 w-12 h-12 rounded-full border-2 flex items-center justify-center font-semibold text-sm
                    ${status === 'completed' 
                      ? 'bg-primary border-primary text-primary-foreground' 
                      : status === 'current'
                      ? 'bg-primary border-primary text-primary-foreground animate-pulse'
                      : status === 'missed'
                      ? 'bg-destructive border-destructive text-destructive-foreground'
                      : 'bg-muted border-border text-muted-foreground'
                    }
                  `}
                >
                  {roundNumber}
                </div>
                
                {/* Round Label */}
                <div className="mt-2 text-center">
                  <div className="text-sm font-medium">Round {roundNumber}</div>
                  <div className="text-xs text-muted-foreground">{getMonthYear(roundNumber)}</div>
                  
                  {/* Status Badge */}
                  {status === 'current' && (
                    <Badge variant="default" className="text-xs mt-1">Current</Badge>
                  )}
                  {status === 'completed' && report && (
                    <Badge variant="outline" className="text-xs mt-1">{report.bureau_name}</Badge>
                  )}
                </div>
                
                {/* Action Buttons for Mobile/Detailed View */}
                {(status === 'completed' || status === 'current') && (
                  <div className="mt-2 flex flex-col gap-1 w-full">
                    {report ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onPreviewReport(report)}
                          className="text-xs h-7"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Preview
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => onViewReport(report.id)}
                          className="text-xs h-7"
                        >
                          View
                        </Button>
                      </>
                    ) : status === 'current' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onUploadReport(roundNumber)}
                        className="text-xs h-7"
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        Upload
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Timeline Legend */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-primary"></div>
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-primary animate-pulse"></div>
          <span>Current Round</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-destructive"></div>
          <span>Missed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-muted border border-border"></div>
          <span>Future</span>
        </div>
      </div>
    </div>
  );
};