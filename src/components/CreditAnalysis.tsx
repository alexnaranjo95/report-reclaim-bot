import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingDown, Eye, CheckCircle } from 'lucide-react';
import { CreditAnalysisResult } from '../types/CreditTypes';

interface CreditAnalysisProps {
  analysisResults: CreditAnalysisResult;
}

export const CreditAnalysis = ({ analysisResults }: CreditAnalysisProps) => {
  const { items: creditItems, summary } = analysisResults;

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-danger';
      case 'medium': return 'text-warning';
      case 'low': return 'text-success';
      default: return 'text-muted-foreground';
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Analysis Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-danger/5 border-danger/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-danger" />
              <div>
                <div className="text-2xl font-bold text-danger">{summary.totalNegativeItems}</div>
                <div className="text-sm text-muted-foreground">Negative Items</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-warning" />
              <div>
                <div className="text-2xl font-bold text-warning">-{summary.estimatedScoreImpact}</div>
                <div className="text-sm text-muted-foreground">Score Impact</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold text-primary">{summary.bureausAffected.length}</div>
                <div className="text-sm text-muted-foreground">Bureaus Affected</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis */}
      <Card className="bg-gradient-card shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Identified Issues
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {creditItems.map((item) => (
              <div 
                key={item.id}
                className="border rounded-lg p-4 space-y-3 hover:shadow-card transition-all duration-300"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h4 className="font-semibold">{item.creditor}</h4>
                    <p className="text-sm text-muted-foreground">Account: {item.account}</p>
                  </div>
                  <Badge variant={getImpactBadge(item.impact)} className="capitalize">
                    {item.impact} Impact
                  </Badge>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{item.issue}</p>
                  <div className="flex flex-wrap gap-1">
                    {item.bureau.map((bureau) => (
                      <Badge key={bureau} variant="outline" className="text-xs">
                        {bureau}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Dispute ready</span>
                  <CheckCircle className="h-4 w-4 text-success" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};