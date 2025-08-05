import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle, TrendingUp, AlertTriangle, CreditCard, Clock, Target } from 'lucide-react';

interface CreditScore {
  score: number;
  rank: string;
  factors: string[];
}

interface CreditScores {
  transUnion?: CreditScore;
  experian?: CreditScore;
  equifax?: CreditScore;
}

interface Account {
  id: string;
  creditor: string;
  type: 'revolving' | 'installment' | 'mortgage';
  status: 'open' | 'closed' | 'derogatory' | 'collection';
  balance: number;
  limit?: number;
  dateOpened: string;
  paymentHistory: Array<{
    month: string;
    status: 'ok' | 'late30' | 'late60' | 'late90' | 'chargeoff';
  }>;
}

interface ActionItem {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  timeframe: 'immediate' | 'short' | 'medium' | 'long';
  estimatedPoints: number;
  category: 'utilization' | 'payment' | 'accounts' | 'inquiries' | 'age' | 'disputes';
  completed: boolean;
}

interface ActionItemsPanelProps {
  creditScores: CreditScores;
  accounts: Account[];
}

export const ActionItemsPanel: React.FC<ActionItemsPanelProps> = ({ creditScores, accounts }) => {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const toggleCompleted = (itemId: string) => {
    const newCompleted = new Set(completedItems);
    if (newCompleted.has(itemId)) {
      newCompleted.delete(itemId);
    } else {
      newCompleted.add(itemId);
    }
    setCompletedItems(newCompleted);
  };

  const generateActionItems = (): ActionItem[] => {
    const items: ActionItem[] = [];

    // Calculate overall credit utilization
    const revolvingAccounts = accounts.filter(acc => acc.type === 'revolving' && acc.status === 'open');
    const totalBalance = revolvingAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLimit = revolvingAccounts.reduce((sum, acc) => sum + (acc.limit || 0), 0);
    const overallUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;

    // High utilization action items
    if (overallUtilization > 30) {
      items.push({
        id: 'reduce-utilization',
        title: 'Reduce Credit Utilization',
        description: `Your credit utilization is ${overallUtilization.toFixed(1)}%. Pay down balances to below 30%.`,
        impact: 'high',
        timeframe: 'immediate',
        estimatedPoints: 50,
        category: 'utilization',
        completed: false
      });
    }

    if (overallUtilization > 10) {
      items.push({
        id: 'optimize-utilization',
        title: 'Optimize to Single Digits',
        description: 'For maximum score benefit, keep utilization below 10%.',
        impact: 'medium',
        timeframe: 'short',
        estimatedPoints: 25,
        category: 'utilization',
        completed: false
      });
    }

    // Individual card utilization issues
    revolvingAccounts.forEach(account => {
      if (account.limit && (account.balance / account.limit) > 0.9) {
        items.push({
          id: `max-utilization-${account.id}`,
          title: `Pay Down ${account.creditor}`,
          description: `This card is near maxed out. Pay it down immediately.`,
          impact: 'high',
          timeframe: 'immediate',
          estimatedPoints: 40,
          category: 'utilization',
          completed: false
        });
      }
    });

    // Payment history issues
    const accountsWithLatePayments = accounts.filter(acc => 
      acc.paymentHistory.some(p => p.status !== 'ok')
    );

    if (accountsWithLatePayments.length > 0) {
      items.push({
        id: 'improve-payment-history',
        title: 'Focus on On-Time Payments',
        description: `${accountsWithLatePayments.length} accounts have late payment history. Keep all future payments on time.`,
        impact: 'high',
        timeframe: 'long',
        estimatedPoints: 60,
        category: 'payment',
        completed: false
      });
    }

    // Derogatory accounts
    const derogatoryAccounts = accounts.filter(acc => 
      acc.status === 'derogatory' || acc.status === 'collection'
    );

    derogatoryAccounts.forEach(account => {
      items.push({
        id: `dispute-${account.id}`,
        title: `Dispute ${account.creditor}`,
        description: 'This derogatory account may be removable through disputes.',
        impact: 'high',
        timeframe: 'medium',
        estimatedPoints: 75,
        category: 'disputes',
        completed: false
      });
    });

    // Credit mix suggestions
    const accountTypes = new Set(accounts.map(acc => acc.type));
    if (accountTypes.size < 2) {
      items.push({
        id: 'diversify-credit-mix',
        title: 'Diversify Credit Mix',
        description: 'Consider adding different types of credit accounts for better score mix.',
        impact: 'low',
        timeframe: 'long',
        estimatedPoints: 15,
        category: 'accounts',
        completed: false
      });
    }

    // Credit age optimization
    const oldestAccount = accounts.reduce((oldest, current) => {
      return new Date(current.dateOpened) < new Date(oldest.dateOpened) ? current : oldest;
    }, accounts[0]);

    if (oldestAccount) {
      const accountAge = (Date.now() - new Date(oldestAccount.dateOpened).getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (accountAge < 2) {
        items.push({
          id: 'build-credit-age',
          title: 'Build Credit History Length',
          description: 'Keep your oldest accounts open to build credit history length.',
          impact: 'medium',
          timeframe: 'long',
          estimatedPoints: 30,
          category: 'age',
          completed: false
        });
      }
    }

    // Credit score specific recommendations
    const scores = Object.values(creditScores).filter(score => score?.score);
    if (scores.length > 0) {
      const averageScore = scores.reduce((sum, score) => sum + score!.score, 0) / scores.length;
      
      if (averageScore < 650) {
        items.push({
          id: 'basic-credit-building',
          title: 'Focus on Credit Building Fundamentals',
          description: 'Concentrate on payment history and keeping balances low.',
          impact: 'high',
          timeframe: 'medium',
          estimatedPoints: 100,
          category: 'payment',
          completed: false
        });
      }
    }

    return items.sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    });
  };

  const actionItems = generateActionItems();
  const filteredItems = selectedCategory === 'all' 
    ? actionItems 
    : actionItems.filter(item => item.category === selectedCategory);

  const categories = [
    { key: 'all', label: 'All Actions', icon: Target },
    { key: 'utilization', label: 'Utilization', icon: CreditCard },
    { key: 'payment', label: 'Payments', icon: Clock },
    { key: 'disputes', label: 'Disputes', icon: AlertTriangle },
    { key: 'accounts', label: 'Accounts', icon: Circle },
  ];

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
      case 'high': return 'destructive' as const;
      case 'medium': return 'secondary' as const;
      case 'low': return 'outline' as const;
      default: return 'outline' as const;
    }
  };

  const getTimeframeLabel = (timeframe: string) => {
    switch (timeframe) {
      case 'immediate': return 'This week';
      case 'short': return '1-3 months';
      case 'medium': return '3-6 months';
      case 'long': return '6+ months';
      default: return timeframe;
    }
  };

  const completedCount = filteredItems.filter(item => completedItems.has(item.id)).length;
  const totalEstimatedPoints = filteredItems.reduce((sum, item) => 
    completedItems.has(item.id) ? sum + item.estimatedPoints : sum, 0
  );

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Action Items</span>
            </div>
            <div className="text-2xl font-bold">{filteredItems.length}</div>
            <div className="text-xs text-muted-foreground">
              {completedCount} completed
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Potential Gain</span>
            </div>
            <div className="text-2xl font-bold text-success">
              +{actionItems.reduce((sum, item) => sum + item.estimatedPoints, 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              Total points possible
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Progress</span>
            </div>
            <div className="text-2xl font-bold">
              {filteredItems.length > 0 ? Math.round((completedCount / filteredItems.length) * 100) : 0}%
            </div>
            <Progress 
              value={filteredItems.length > 0 ? (completedCount / filteredItems.length) * 100 : 0} 
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map(category => {
          const Icon = category.icon;
          const count = category.key === 'all' 
            ? actionItems.length 
            : actionItems.filter(item => item.category === category.key).length;
          
          return (
            <Button
              key={category.key}
              variant={selectedCategory === category.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category.key)}
              className="flex items-center gap-2"
            >
              <Icon className="h-3 w-3" />
              {category.label}
              {count > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {count}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* Action Items List */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Recommended Actions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Prioritized steps to improve your credit score
          </p>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
              <p>Great job! No action items in this category.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className={`p-4 border border-border rounded-lg transition-all ${
                    completedItems.has(item.id) ? 'bg-success/5 border-success/20' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCompleted(item.id)}
                      className="p-0 h-auto mt-1"
                    >
                      {completedItems.has(item.id) ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </Button>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <h4 className={`font-medium ${
                          completedItems.has(item.id) ? 'line-through text-muted-foreground' : ''
                        }`}>
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2">
                          <Badge variant={getImpactBadge(item.impact)}>
                            {item.impact} impact
                          </Badge>
                          <div className={`text-sm font-semibold ${getImpactColor(item.impact)}`}>
                            +{item.estimatedPoints} pts
                          </div>
                        </div>
                      </div>

                      <p className={`text-sm ${
                        completedItems.has(item.id) ? 'line-through text-muted-foreground' : 'text-muted-foreground'
                      }`}>
                        {item.description}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Timeline: {getTimeframeLabel(item.timeframe)}</span>
                        <span>•</span>
                        <span>Category: {item.category}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};