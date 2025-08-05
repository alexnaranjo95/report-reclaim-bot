import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Shield, TrendingUp, TrendingDown, Search, Download, Printer, Filter } from 'lucide-react';
import { CreditScoreHero } from './CreditScoreHero';
import { AccountsGrid } from './AccountsGrid';
import { PaymentHistoryHeatmap } from './PaymentHistoryHeatmap';
import { CreditUtilizationGauge } from './CreditUtilizationGauge';
import { BureauComparisonView } from './BureauComparisonView';
import { CreditChartsOverview } from './CreditChartsOverview';
import { ActionItemsPanel } from './ActionItemsPanel';
import { InquiriesTimeline } from './InquiriesTimeline';
import { PersonalInfoCard } from './PersonalInfoCard';

export interface CreditReportData {
  reportHeader: {
    referenceNumber: string;
    reportDate: string;
    alerts: Array<{
      type: 'fraud' | 'dispute' | 'security';
      message: string;
      severity: 'high' | 'medium' | 'low';
      bureau?: string;
    }>;
  };
  personalInfo: {
    name: string;
    aliases: string[];
    birthDate: string;
    addresses: Array<{
      address: string;
      type: 'current' | 'previous';
      dates?: string;
    }>;
    employers: Array<{
      name: string;
      dates?: string;
    }>;
  };
  creditScores: {
    transUnion?: { score: number; rank: string; factors: string[] };
    experian?: { score: number; rank: string; factors: string[] };
    equifax?: { score: number; rank: string; factors: string[] };
  };
  accountSummary: {
    totalAccounts: number;
    openAccounts: number;
    closedAccounts: number;
    delinquentAccounts: number;
    collectionsAccounts: number;
    totalBalances: number;
    monthlyPayments: number;
    inquiries2Years: number;
  };
  accounts: Array<{
    id: string;
    creditor: string;
    accountNumber: string;
    type: 'revolving' | 'installment' | 'mortgage';
    status: 'open' | 'closed' | 'derogatory' | 'collection';
    balance: number;
    limit?: number;
    paymentHistory: Array<{
      month: string;
      status: 'ok' | 'late30' | 'late60' | 'late90' | 'chargeoff';
    }>;
    dateOpened: string;
    lastReported: string;
    lastPayment?: string;
    paymentAmount?: number;
    bureaus: string[];
  }>;
  inquiries: Array<{
    id: string;
    creditor: string;
    date: string;
    type: 'hard' | 'soft';
    purpose?: string;
  }>;
}

interface CreditReportDashboardProps {
  data: CreditReportData;
}

export const CreditReportDashboard: React.FC<CreditReportDashboardProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBureau, setFilterBureau] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Filtered accounts based on search and filters
  const filteredAccounts = useMemo(() => {
    return data.accounts.filter(account => {
      const matchesSearch = account.creditor.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           account.accountNumber.includes(searchTerm);
      const matchesBureau = filterBureau === 'all' || account.bureaus.includes(filterBureau);
      const matchesStatus = filterStatus === 'all' || account.status === filterStatus;
      
      return matchesSearch && matchesBureau && matchesStatus;
    });
  }, [data.accounts, searchTerm, filterBureau, filterStatus]);

  // Calculate overall utilization
  const overallUtilization = useMemo(() => {
    const revolvingAccounts = data.accounts.filter(acc => acc.type === 'revolving' && acc.status === 'open');
    const totalBalance = revolvingAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLimit = revolvingAccounts.reduce((sum, acc) => sum + (acc.limit || 0), 0);
    return totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  }, [data.accounts]);

  return (
    <div className="min-h-screen bg-gradient-dashboard p-6">
      {/* Alert Bar */}
      {data.reportHeader.alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {data.reportHeader.alerts.map((alert, index) => (
            <Card key={index} className={`border-l-4 ${
              alert.severity === 'high' ? 'border-l-danger bg-danger/5' :
              alert.severity === 'medium' ? 'border-l-warning bg-warning/5' :
              'border-l-primary bg-primary/5'
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {alert.type === 'fraud' ? (
                    <Shield className="h-5 w-5 text-danger" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-warning" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{alert.message}</p>
                    {alert.bureau && (
                      <p className="text-sm text-muted-foreground">Bureau: {alert.bureau}</p>
                    )}
                  </div>
                  <Badge variant={alert.severity === 'high' ? 'destructive' : 'secondary'}>
                    {alert.severity.toUpperCase()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Credit Score Hero Section */}
      <div className="mb-8">
        <CreditScoreHero creditScores={data.creditScores} />
      </div>

      {/* Dashboard Controls */}
      <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          
          <select
            value={filterBureau}
            onChange={(e) => setFilterBureau(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-background"
          >
            <option value="all">All Bureaus</option>
            <option value="TransUnion">TransUnion</option>
            <option value="Experian">Experian</option>
            <option value="Equifax">Equifax</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-background"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="derogatory">Derogatory</option>
            <option value="collection">Collection</option>
          </select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="payment-history">Payment History</TabsTrigger>
          <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
          <TabsTrigger value="personal">Personal Info</TabsTrigger>
          <TabsTrigger value="bureau-comparison">Bureau Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Account Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-2xl font-bold">{data.accountSummary.totalAccounts}</div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{data.accountSummary.openAccounts} open</span>
                  <span>•</span>
                  <span>{data.accountSummary.closedAccounts} closed</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Balances</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-2xl font-bold">${data.accountSummary.totalBalances.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">
                  ${data.accountSummary.monthlyPayments} monthly payments
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Credit Utilization</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-2xl font-bold">{overallUtilization.toFixed(1)}%</div>
                <div className={`text-sm ${overallUtilization > 30 ? 'text-warning' : 'text-success'}`}>
                  {overallUtilization > 30 ? 'High utilization' : 'Good utilization'}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Recent Inquiries</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-2xl font-bold">{data.accountSummary.inquiries2Years}</div>
                <div className="text-sm text-muted-foreground">Last 24 months</div>
              </CardContent>
            </Card>
          </div>

          {/* Credit Utilization Gauge */}
          <CreditUtilizationGauge 
            accounts={data.accounts} 
            overallUtilization={overallUtilization} 
          />

          {/* Charts Overview */}
          <CreditChartsOverview data={data} />

          {/* Action Items Panel */}
          <ActionItemsPanel creditScores={data.creditScores} accounts={data.accounts} />
        </TabsContent>

        <TabsContent value="accounts">
          <AccountsGrid accounts={filteredAccounts} />
        </TabsContent>

        <TabsContent value="payment-history">
          <PaymentHistoryHeatmap accounts={data.accounts} />
        </TabsContent>

        <TabsContent value="inquiries">
          <InquiriesTimeline inquiries={data.inquiries} />
        </TabsContent>

        <TabsContent value="personal">
          <PersonalInfoCard personalInfo={data.personalInfo} />
        </TabsContent>

        <TabsContent value="bureau-comparison">
          <BureauComparisonView data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
};