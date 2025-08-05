import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, TrendingUp, AlertCircle } from 'lucide-react';

interface PaymentHistoryItem {
  month: string;
  status: 'ok' | 'late30' | 'late60' | 'late90' | 'chargeoff';
}

interface Account {
  id: string;
  creditor: string;
  accountNumber: string;
  type: 'revolving' | 'installment' | 'mortgage';
  status: 'open' | 'closed' | 'derogatory' | 'collection';
  paymentHistory: PaymentHistoryItem[];
  dateOpened: string;
}

interface PaymentHistoryHeatmapProps {
  accounts: Account[];
}

export const PaymentHistoryHeatmap: React.FC<PaymentHistoryHeatmapProps> = ({ accounts }) => {
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('24');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok': return 'bg-success hover:bg-success-light';
      case 'late30': return 'bg-warning hover:bg-warning/80';
      case 'late60': return 'bg-orange-500 hover:bg-orange-400';
      case 'late90': return 'bg-danger hover:bg-danger/80';
      case 'chargeoff': return 'bg-black hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700';
      default: return 'bg-border hover:bg-border/80';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ok': return 'On Time';
      case 'late30': return '30 Days Late';
      case 'late60': return '60 Days Late';
      case 'late90': return '90 Days Late';
      case 'chargeoff': return 'Charge Off';
      default: return 'Unknown';
    }
  };

  const filterAccounts = () => {
    if (selectedAccount === 'all') return accounts;
    return accounts.filter(account => account.id === selectedAccount);
  };

  const generateMonthLabels = (monthCount: number) => {
    const months = [];
    const now = new Date();
    
    for (let i = monthCount - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        short: date.toLocaleDateString('en-US', { month: 'short' }),
        full: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        key: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
      });
    }
    
    return months;
  };

  const monthLabels = generateMonthLabels(parseInt(timeRange));
  const filteredAccounts = filterAccounts();

  // Calculate summary statistics
  const calculateStats = () => {
    let totalPayments = 0;
    let onTimePayments = 0;
    let latePayments = 0;
    
    filteredAccounts.forEach(account => {
      account.paymentHistory.slice(-parseInt(timeRange)).forEach(payment => {
        totalPayments++;
        if (payment.status === 'ok') {
          onTimePayments++;
        } else {
          latePayments++;
        }
      });
    });

    return {
      totalPayments,
      onTimePayments,
      latePayments,
      onTimePercentage: totalPayments > 0 ? (onTimePayments / totalPayments) * 100 : 0
    };
  };

  const stats = calculateStats();

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 items-center">
          <div>
            <label className="text-sm font-medium mb-2 block">Account</label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.creditor} (****{account.accountNumber.slice(-4)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Time Range</label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12 Months</SelectItem>
                <SelectItem value="24">24 Months</SelectItem>
                <SelectItem value="36">36 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-success rounded" />
            <span>On Time</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-warning rounded" />
            <span>30 Days</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded" />
            <span>60 Days</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-danger rounded" />
            <span>90+ Days</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-black dark:bg-gray-800 rounded" />
            <span>Charge Off</span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">On-Time Rate</span>
            </div>
            <div className="text-2xl font-bold text-success">
              {stats.onTimePercentage.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.onTimePayments} of {stats.totalPayments} payments
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Late Payments</span>
            </div>
            <div className="text-2xl font-bold text-warning">
              {stats.latePayments}
            </div>
            <div className="text-xs text-muted-foreground">
              Last {timeRange} months
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Accounts Tracked</span>
            </div>
            <div className="text-2xl font-bold">
              {filteredAccounts.length}
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedAccount === 'all' ? 'All accounts' : 'Selected account'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">Improvement Trend</span>
            </div>
            <div className="text-2xl font-bold text-primary">
              {stats.onTimePercentage >= 90 ? 'Excellent' : 
               stats.onTimePercentage >= 75 ? 'Good' : 
               stats.onTimePercentage >= 50 ? 'Fair' : 'Poor'}
            </div>
            <div className="text-xs text-muted-foreground">
              Payment consistency
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment History Heatmap */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Payment History Heatmap</CardTitle>
          <p className="text-sm text-muted-foreground">
            Visual representation of payment history across all selected accounts
          </p>
        </CardHeader>
        <CardContent>
          {filteredAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No accounts selected or available
            </div>
          ) : (
            <div className="space-y-6">
              {/* Month headers */}
              <div className="grid grid-cols-1 gap-4">
                <div className="flex gap-1 items-center ml-48">
                  {monthLabels.map((month, index) => (
                    <div
                      key={month.key}
                      className="w-6 text-xs text-center text-muted-foreground transform -rotate-45 origin-bottom-left"
                      title={month.full}
                    >
                      {index % 3 === 0 ? month.short : ''}
                    </div>
                  ))}
                </div>

                {/* Account rows */}
                {filteredAccounts.map(account => (
                  <div key={account.id} className="flex items-center gap-4">
                    <div className="w-44 flex-shrink-0">
                      <div className="font-medium text-sm truncate" title={account.creditor}>
                        {account.creditor}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ****{account.accountNumber.slice(-4)}
                      </div>
                      <Badge variant="outline" className="text-xs mt-1">
                        {account.type}
                      </Badge>
                    </div>
                    
                    <div className="flex gap-1">
                      {monthLabels.map(month => {
                        const payment = account.paymentHistory.find(p => 
                          p.month.startsWith(month.key) || 
                          p.month === month.short ||
                          p.month === month.full
                        );
                        
                        return (
                          <div
                            key={`${account.id}-${month.key}`}
                            className={`w-6 h-6 rounded-sm transition-colors cursor-pointer ${
                              payment ? getStatusColor(payment.status) : 'bg-border'
                            }`}
                            title={`${account.creditor} - ${month.full}: ${
                              payment ? getStatusLabel(payment.status) : 'No data'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};