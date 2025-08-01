import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  TrendingDown, 
  Eye, 
  CheckCircle, 
  CreditCard,
  DollarSign,
  Calendar,
  Building2,
  Clock,
  AlertCircle
} from 'lucide-react';
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

  const getIssueIcon = (issue: string) => {
    const issueLower = issue.toLowerCase();
    if (issueLower.includes('late') || issueLower.includes('payment')) return <Clock className="h-4 w-4" />;
    if (issueLower.includes('collection')) return <AlertTriangle className="h-4 w-4" />;
    if (issueLower.includes('charge off') || issueLower.includes('charge-off')) return <AlertCircle className="h-4 w-4" />;
    if (issueLower.includes('bankruptcy')) return <Building2 className="h-4 w-4" />;
    if (issueLower.includes('utilization')) return <CreditCard className="h-4 w-4" />;
    return <DollarSign className="h-4 w-4" />;
  };

  // Group items by impact level
  const highImpactItems = creditItems.filter(item => item.impact === 'high');
  const mediumImpactItems = creditItems.filter(item => item.impact === 'medium');
  const lowImpactItems = creditItems.filter(item => item.impact === 'low');

  // Group items by issue type
  const groupByIssueType = (items: typeof creditItems) => {
    const groups: { [key: string]: typeof creditItems } = {};
    items.forEach(item => {
      const issueType = item.issue.split(':')[0] || item.issue.split('-')[0] || 'Other';
      if (!groups[issueType]) groups[issueType] = [];
      groups[issueType].push(item);
    });
    return groups;
  };

  const ItemCard = ({ item }: { item: typeof creditItems[0] }) => (
    <div className="border rounded-lg p-4 space-y-3 hover:shadow-card transition-all duration-300 bg-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            {getIssueIcon(item.issue)}
            <h4 className="font-semibold text-foreground">{item.creditor}</h4>
          </div>
          <p className="text-sm text-muted-foreground">Account: {item.account}</p>
          {item.balance && (
            <p className="text-sm text-muted-foreground">Balance: ${item.balance.toLocaleString()}</p>
          )}
        </div>
        <Badge variant={getImpactBadge(item.impact)} className="capitalize">
          {item.impact} Impact
        </Badge>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{item.issue}</p>
        
        <div className="flex flex-wrap gap-1">
          {item.bureau.map((bureau) => (
            <Badge key={bureau} variant="outline" className="text-xs">
              {bureau}
            </Badge>
          ))}
        </div>

        {(item.dateOpened || item.lastActivity) && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            {item.dateOpened && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Opened: {item.dateOpened}</span>
              </div>
            )}
            {item.lastActivity && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Last Activity: {item.lastActivity}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Ready for dispute</span>
        <CheckCircle className="h-4 w-4 text-success" />
      </div>
    </div>
  );

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

      {/* Impact Level Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-danger/5 border-danger/20">
          <CardContent className="p-4 text-center">
            <div className="text-xl font-bold text-danger">{summary.highImpactItems}</div>
            <div className="text-sm text-muted-foreground">High Impact Items</div>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4 text-center">
            <div className="text-xl font-bold text-warning">{summary.mediumImpactItems}</div>
            <div className="text-sm text-muted-foreground">Medium Impact Items</div>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4 text-center">
            <div className="text-xl font-bold text-success">{summary.lowImpactItems}</div>
            <div className="text-sm text-muted-foreground">Low Impact Items</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis with Tabs */}
      <Card className="bg-gradient-card shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Negative Items Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="impact" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="impact">By Impact Level</TabsTrigger>
              <TabsTrigger value="type">By Issue Type</TabsTrigger>
            </TabsList>

            <TabsContent value="impact" className="space-y-6">
              {highImpactItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                    <h3 className="font-semibold text-danger">High Impact Items ({highImpactItems.length})</h3>
                  </div>
                  <div className="grid gap-3">
                    {highImpactItems.map((item) => (
                      <ItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {mediumImpactItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-warning" />
                    <h3 className="font-semibold text-warning">Medium Impact Items ({mediumImpactItems.length})</h3>
                  </div>
                  <div className="grid gap-3">
                    {mediumImpactItems.map((item) => (
                      <ItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {lowImpactItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <h3 className="font-semibold text-success">Low Impact Items ({lowImpactItems.length})</h3>
                  </div>
                  <div className="grid gap-3">
                    {lowImpactItems.map((item) => (
                      <ItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="type" className="space-y-6">
              {Object.entries(groupByIssueType(creditItems)).map(([issueType, items]) => (
                <div key={issueType} className="space-y-3">
                  <div className="flex items-center gap-2">
                    {getIssueIcon(issueType)}
                    <h3 className="font-semibold">{issueType} ({items.length})</h3>
                  </div>
                  <div className="grid gap-3">
                    {items.map((item) => (
                      <ItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};