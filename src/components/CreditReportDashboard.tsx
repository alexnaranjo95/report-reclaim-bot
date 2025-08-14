import React, { useState, useMemo, useEffect } from 'react';
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
import { TriBureauReportViewer } from './TriBureauReportViewer';
import { auditCreditData } from '@/utils/CreditDataAudit';
import HtmlBlock from './HtmlBlock';

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
  // Add rawData to store the original JSON structure
  rawData?: any;
}

interface CreditReportDashboardProps {
  data: CreditReportData;
}

export const CreditReportDashboard: React.FC<CreditReportDashboardProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBureau, setFilterBureau] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Log data counts on mount for verification
  useEffect(() => {
    console.log(`[CreditReportDashboard] Mounted with data - Accounts: ${data.accounts.length}, Inquiries: ${data.inquiries.length}, Scores: ${Object.keys(data.creditScores).length}`);
  }, [data]);

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

  // Transform data for TriBureauReportViewer
  const triBureauDocsumo = useMemo(() => {
    const formatMoney = (n?: number) => (typeof n === 'number' ? `$${n.toLocaleString()}` : '—');
    const s = data.accountSummary;
    const summaryLine = `Total Accounts : ${s.totalAccounts} Open Accounts : ${s.openAccounts} Closed Accounts : ${s.closedAccounts} Delinquent : ${s.delinquentAccounts} Derogatory : ${s.collectionsAccounts} Collection : ${s.collectionsAccounts} Balances : ${formatMoney(s.totalBalances)} Payments : ${formatMoney(s.monthlyPayments)} Public Records : 0 Inquiries(2 years) : ${s.inquiries2Years}`;

    const toAddr = (a: { address: string; dates?: string }) => ({
      'Street Line 1': { value: a.address },
      'City': { value: '' },
      'State': { value: '' },
      'Zip Code': { value: '' },
      'Date Reported': { value: a.dates || '' },
    });

    const currentAddrs = (data.personalInfo.addresses || [])
      .filter(a => a.type === 'current')
      .map(toAddr);
    const previousAddrs = (data.personalInfo.addresses || [])
      .filter(a => a.type === 'previous')
      .map(toAddr);

    const alertsByBureau: Record<string, any[]> = {
      'TransUnion Alerts': [],
      'Experian Alerts': [],
      'Equifax Alerts': [],
    };
    
    (data.reportHeader.alerts || []).forEach(al => {
      const key = `${al.bureau ?? 'TransUnion'} Alerts`;
      if (alertsByBureau[key]) {
        alertsByBureau[key].push({ text: al.message, type: al.type, severity: al.severity });
      }
    });

    return {
      data: {
        'Basic Information': {
          'Report Title': { value: 'Smart Credit Report' },
          'Report Date': { value: data.reportHeader.reportDate },
          'Reference Number': { value: data.reportHeader.referenceNumber },
        },
        'Personal Information': {
          'Name': { value: data.personalInfo.name },
          'Also Known As': { value: (data.personalInfo.aliases || []).join(', ') },
          'Former Names': { value: '' },
          'Date of Birth': { value: data.personalInfo.birthDate },
          'Employers': { value: (data.personalInfo.employers || []).map(e => e.name).join('; ') },
          'Current Addresses': currentAddrs,
          'Previous Addresses': previousAddrs,
        },
        'Credit Score': {
          'TransUnion': { value: data.creditScores.transUnion?.score },
          'Experian': { value: data.creditScores.experian?.score },
          'Equifax': { value: data.creditScores.equifax?.score },
        },
        'Risk Factors': {
          'TransUnion': { value: (data.creditScores.transUnion?.factors || []).join('; ') },
          'Experian': { value: (data.creditScores.experian?.factors || []).join('; ') },
          'Equifax': { value: (data.creditScores.equifax?.factors || []).join('; ') },
        },
        'Summary': {
          'TransUnion': { value: summaryLine },
          'Experian': { value: summaryLine },
          'Equifax': { value: summaryLine },
        },
        'Public Records': { 'If None': { value: 'No public records reported' } },
        'Customer Statement': alertsByBureau,
        'Account History': { 'Two year payment history': [] },
      }
    };
  }, [data]);

  useEffect(() => {
    auditCreditData(data);
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-dashboard p-6" id="credit-report-root" data-testid="credit-report-root">
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

      {/* Credit Scores Hero Section */}
      <div className="mb-8" data-testid="credit-report-scores">
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
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="payment-history">Payment History</TabsTrigger>
          <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
          <TabsTrigger value="personal">Personal Info</TabsTrigger>
          <TabsTrigger value="bureau-comparison">Bureau Compare</TabsTrigger>
          <TabsTrigger value="tri-bureau">Tri-Bureau Viewer</TabsTrigger>
          <TabsTrigger value="raw-html">Raw HTML</TabsTrigger>
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
                  ${data.accountSummary.monthlyPayments.toLocaleString()} monthly payments
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

        <TabsContent value="accounts" data-testid="credit-report-accounts">
          <AccountsGrid accounts={filteredAccounts} />
        </TabsContent>

        <TabsContent value="payment-history">
          <PaymentHistoryHeatmap accounts={data.accounts} />
        </TabsContent>

        <TabsContent value="inquiries" data-testid="credit-report-inquiries">
          <InquiriesTimeline inquiries={data.inquiries} />
        </TabsContent>

        <TabsContent value="personal">
          <PersonalInfoCard personalInfo={data.personalInfo} />
        </TabsContent>

        <TabsContent value="bureau-comparison">
          <BureauComparisonView data={data} />
        </TabsContent>

        <TabsContent value="tri-bureau">
          <TriBureauReportViewer docsumo={triBureauDocsumo} />
        </TabsContent>

        <TabsContent value="raw-html" className="space-y-6">
          {/* Display HTML sections from raw data */}
          {data.rawData && (
            <div className="space-y-6">
              {/* Personal Information HTML */}
              {data.rawData.personal_information?.html && (
                <Card>
                  <CardHeader>
                    <CardTitle>Personal Information (Raw HTML)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HtmlBlock html={data.rawData.personal_information.html} />
                  </CardContent>
                </Card>
              )}

              {/* Account Summary HTML */}
              {data.rawData.account_summary?.html && (
                <Card>
                  <CardHeader>
                    <CardTitle>Account Summary (Raw HTML)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HtmlBlock html={data.rawData.account_summary.html} />
                  </CardContent>
                </Card>
              )}

              {/* Credit Scores HTML */}
              {data.rawData.credit_scores?.html && (
                <Card>
                  <CardHeader>
                    <CardTitle>Credit Scores (Raw HTML)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HtmlBlock html={data.rawData.credit_scores.html} />
                  </CardContent>
                </Card>
              )}

              {/* Accounts HTML */}
              {data.rawData.accounts?.html && (
                <Card>
                  <CardHeader>
                    <CardTitle>Accounts (Raw HTML)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HtmlBlock html={data.rawData.accounts.html} />
                  </CardContent>
                </Card>
              )}

              {/* Inquiries HTML */}
              {data.rawData.inquiries?.html && (
                <Card>
                  <CardHeader>
                    <CardTitle>Inquiries (Raw HTML)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HtmlBlock html={data.rawData.inquiries.html} />
                  </CardContent>
                </Card>
              )}

              {/* Public Records HTML */}
              {data.rawData.public_records?.html && (
                <Card>
                  <CardHeader>
                    <CardTitle>Public Records (Raw HTML)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HtmlBlock html={data.rawData.public_records.html} />
                  </CardContent>
                </Card>
              )}

              {/* Collections HTML */}
              {data.rawData.collections?.html && (
                <Card>
                  <CardHeader>
                    <CardTitle>Collections (Raw HTML)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HtmlBlock html={data.rawData.collections.html} />
                  </CardContent>
                </Card>
              )}

              {/* Any other HTML sections found in rawData */}
              {Object.entries(data.rawData).map(([key, value]: [string, any]) => {
                if (value?.html && !['personal_information', 'account_summary', 'credit_scores', 'accounts', 'inquiries', 'public_records', 'collections'].includes(key)) {
                  return (
                    <Card key={key}>
                      <CardHeader>
                        <CardTitle>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (Raw HTML)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <HtmlBlock html={value.html} />
                      </CardContent>
                    </Card>
                  );
                }
                return null;
              })}

              {/* If no HTML sections found */}
              {!Object.values(data.rawData).some((value: any) => value?.html) && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">No HTML content found in the raw data.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* If no rawData */}
          {!data.rawData && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No raw data available to display HTML content.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};