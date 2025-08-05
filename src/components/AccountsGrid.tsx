import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, CreditCard, Building, Home, AlertTriangle, CheckCircle } from 'lucide-react';

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
  balance: number;
  limit?: number;
  paymentHistory: PaymentHistoryItem[];
  dateOpened: string;
  lastReported: string;
  lastPayment?: string;
  paymentAmount?: number;
  bureaus: string[];
}

interface AccountsGridProps {
  accounts: Account[];
}

export const AccountsGrid: React.FC<AccountsGridProps> = ({ accounts }) => {
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const toggleExpanded = (accountId: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'revolving': return <CreditCard className="h-4 w-4" />;
      case 'mortgage': return <Home className="h-4 w-4" />;
      default: return <Building className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="default" className="bg-success text-success-foreground">Open</Badge>;
      case 'closed':
        return <Badge variant="secondary">Closed</Badge>;
      case 'derogatory':
        return <Badge variant="destructive">Derogatory</Badge>;
      case 'collection':
        return <Badge variant="destructive">Collection</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'ok': return 'bg-success';
      case 'late30': return 'bg-warning';
      case 'late60': return 'bg-orange-500';
      case 'late90': return 'bg-danger';
      case 'chargeoff': return 'bg-black dark:bg-gray-800';
      default: return 'bg-border';
    }
  };

  const calculateUtilization = (account: Account) => {
    if (account.type !== 'revolving' || !account.limit || account.limit === 0) return null;
    return (account.balance / account.limit) * 100;
  };

  const PaymentHistoryMini: React.FC<{ paymentHistory: PaymentHistoryItem[] }> = ({ paymentHistory }) => {
    const recentHistory = paymentHistory.slice(-12); // Last 12 months

    return (
      <div className="flex gap-1">
        {recentHistory.map((payment, index) => (
          <div
            key={index}
            className={`w-3 h-3 rounded-sm ${getPaymentStatusColor(payment.status)}`}
            title={`${payment.month}: ${payment.status === 'ok' ? 'On time' : payment.status}`}
          />
        ))}
      </div>
    );
  };

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">No accounts match your current filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Credit Accounts ({accounts.length})</h3>
        <div className="flex gap-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-success rounded-sm" />
            <span>On Time</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-warning rounded-sm" />
            <span>30 Days Late</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-danger rounded-sm" />
            <span>60+ Days Late</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {accounts.map((account) => {
          const isExpanded = expandedAccounts.has(account.id);
          const utilization = calculateUtilization(account);

          return (
            <Card key={account.id} className="shadow-card">
              <Collapsible>
                <CollapsibleTrigger 
                  className="w-full" 
                  onClick={() => toggleExpanded(account.id)}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          {getAccountIcon(account.type)}
                        </div>
                        <div className="text-left">
                          <CardTitle className="text-base">{account.creditor}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            ****{account.accountNumber.slice(-4)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(account.status)}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CardContent className="pt-0">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="font-semibold">${account.balance.toLocaleString()}</p>
                    </div>
                    {account.limit && (
                      <div>
                        <p className="text-xs text-muted-foreground">Credit Limit</p>
                        <p className="font-semibold">${account.limit.toLocaleString()}</p>
                      </div>
                    )}
                    {utilization !== null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Utilization</p>
                        <p className={`font-semibold ${
                          utilization > 70 ? 'text-danger' : 
                          utilization > 30 ? 'text-warning' : 
                          'text-success'
                        }`}>
                          {utilization.toFixed(1)}%
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-semibold capitalize">{account.type}</p>
                    </div>
                  </div>

                  {/* Payment History Mini */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Payment History (Last 12 Months)</p>
                      <div className="flex items-center gap-1">
                        {account.paymentHistory.filter(p => p.status === 'ok').length === account.paymentHistory.length ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-warning" />
                        )}
                      </div>
                    </div>
                    <PaymentHistoryMini paymentHistory={account.paymentHistory} />
                  </div>

                  {/* Bureaus */}
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-sm text-muted-foreground">Reported by:</p>
                    <div className="flex gap-1">
                      {account.bureaus.map((bureau) => (
                        <Badge key={bureau} variant="outline" className="text-xs">
                          {bureau}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <CollapsibleContent>
                    {/* Detailed Information */}
                    <div className="border-t pt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Date Opened</p>
                          <p className="font-medium">{new Date(account.dateOpened).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Last Reported</p>
                          <p className="font-medium">{new Date(account.lastReported).toLocaleDateString()}</p>
                        </div>
                        {account.lastPayment && (
                          <div>
                            <p className="text-xs text-muted-foreground">Last Payment</p>
                            <p className="font-medium">{new Date(account.lastPayment).toLocaleDateString()}</p>
                          </div>
                        )}
                      </div>

                      {account.paymentAmount && (
                        <div>
                          <p className="text-xs text-muted-foreground">Payment Amount</p>
                          <p className="font-medium">${account.paymentAmount.toLocaleString()}</p>
                        </div>
                      )}

                      {/* Full Payment History Grid */}
                      <div>
                        <p className="text-sm font-medium mb-3">Complete Payment History</p>
                        <div className="grid grid-cols-12 gap-1">
                          {account.paymentHistory.slice(-24).map((payment, index) => (
                            <div
                              key={index}
                              className={`aspect-square rounded-sm ${getPaymentStatusColor(payment.status)}`}
                              title={`${payment.month}: ${payment.status === 'ok' ? 'On time' : payment.status}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm">
                          Dispute Information
                        </Button>
                        <Button variant="outline" size="sm">
                          Request Validation
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
};