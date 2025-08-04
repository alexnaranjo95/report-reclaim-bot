import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Clock, Database, TrendingUp, RefreshCw } from 'lucide-react';
import { RealDataProcessor } from '@/services/RealDataProcessor';
import { useToast } from '@/hooks/use-toast';

interface RealDataMonitorProps {
  reportId?: string;
}

export const RealDataMonitor: React.FC<RealDataMonitorProps> = ({ reportId }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [dataHealth, setDataHealth] = useState<any>(null);
  const [extractedCounts, setExtractedCounts] = useState<any>(null);
  const { toast } = useToast();

  const checkDataHealth = async () => {
    setIsChecking(true);
    try {
      const health = await RealDataProcessor.getExtractionHealth();
      setDataHealth(health);

      if (reportId) {
        const counts = await RealDataProcessor.verifyExtractedData(reportId);
        setExtractedCounts(counts);
      }

      toast({
        title: "Data Health Check Complete",
        description: `System health: ${health.successRate.toFixed(1)}% success rate`,
      });
    } catch (error) {
      console.error('Health check failed:', error);
      toast({
        title: "Health Check Failed",
        description: "Could not retrieve data health metrics",
        variant: "destructive"
      });
    } finally {
      setIsChecking(false);
    }
  };

  const getHealthBadge = (successRate: number) => {
    if (successRate >= 80) return <Badge className="bg-green-100 text-green-800">Healthy</Badge>;
    if (successRate >= 60) return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>;
    return <Badge className="bg-red-100 text-red-800">Critical</Badge>;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Real Data Pipeline Monitor
            </CardTitle>
            <CardDescription>
              Monitor extraction pipeline health and verify real data processing
            </CardDescription>
          </div>
          <Button 
            onClick={checkDataHealth} 
            disabled={isChecking}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking...' : 'Check Health'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dataHealth && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{dataHealth.totalReports}</div>
              <div className="text-sm text-muted-foreground">Total Reports</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{dataHealth.successfulExtractions}</div>
              <div className="text-sm text-muted-foreground">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{dataHealth.failedExtractions}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{dataHealth.pendingExtractions}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
          </div>
        )}

        {dataHealth && (
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              <span className="font-medium">Success Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{dataHealth.successRate.toFixed(1)}%</span>
              {getHealthBadge(dataHealth.successRate)}
            </div>
          </div>
        )}

        {extractedCounts && (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Current Report Data Verification</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium">{extractedCounts.personalInfo}</div>
                  <div className="text-xs text-muted-foreground">Personal Info</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium">{extractedCounts.accounts}</div>
                  <div className="text-xs text-muted-foreground">Accounts</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium">{extractedCounts.inquiries}</div>
                  <div className="text-xs text-muted-foreground">Inquiries</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <div>
                  <div className="font-medium">{extractedCounts.negativeItems}</div>
                  <div className="text-xs text-muted-foreground">Negative Items</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!dataHealth && (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2" />
            <p>Click "Check Health" to monitor pipeline status</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};