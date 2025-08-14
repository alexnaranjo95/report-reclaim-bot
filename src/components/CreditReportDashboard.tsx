import React, { useState, useMemo } from 'react';
import { ChevronRight, Upload, Download, Plus, ArrowUp, Check, TrendingUp, CreditCard, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

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
  rawData?: any;
}

interface CreditReportDashboardProps {
  data: CreditReportData;
}

export const CreditReportDashboard: React.FC<CreditReportDashboardProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState('rounds');
  const [bureauFilter, setBureauFilter] = useState('all');

  // Calculate average score
  const averageScore = useMemo(() => {
    const scores = [
      data.creditScores.transUnion?.score || 0,
      data.creditScores.experian?.score || 0,
      data.creditScores.equifax?.score || 0
    ].filter(s => s > 0);
    
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [data.creditScores]);

  // Count negative items
  const negativeItems = useMemo(() => {
    return data.accounts.filter(account => 
      account.status === 'derogatory' || 
      account.status === 'collection' ||
      data.accountSummary.delinquentAccounts > 0
    ).length + data.accountSummary.collectionsAccounts;
  }, [data.accounts, data.accountSummary]);

  // Filter accounts by bureau
  const filteredAccounts = useMemo(() => {
    if (bureauFilter === 'all') return data.accounts;
    return data.accounts.filter(account => 
      account.bureaus.some(bureau => 
        bureau.toLowerCase().includes(bureauFilter.toLowerCase())
      )
    );
  }, [data.accounts, bureauFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Positive</Badge>;
      case 'derogatory':
      case 'collection':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Negative</Badge>;
      case 'closed':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Closed</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">In Dispute</Badge>;
    }
  };

  const tabs = [
    { id: 'rounds', label: 'Rounds', active: true },
    { id: 'monthly', label: 'Monthly', active: false },
    { id: 'analysis', label: 'Analysis', active: false },
    { id: 'reports', label: 'Reports', active: false }
  ];

  return (
    <div className="bg-background min-h-screen">
      <div className="p-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center text-sm text-muted-foreground mb-2">
                <a href="#" className="hover:underline">Dashboard</a>
                <ChevronRight className="mx-1 h-4 w-4" />
                <span className="font-medium text-foreground">Credit Reports</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground">Credit Score & Analysis</h1>
              <p className="text-muted-foreground">Track your credit journey and dispute progress over time.</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" className="flex items-center">
                <Upload className="mr-2 h-4 w-4" />
                Upload Report
              </Button>
              <Button variant="outline" className="flex items-center">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button className="flex items-center">
                <Plus className="mr-2 h-4 w-4" />
                Generate Dispute
              </Button>
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <div className="mt-6 flex space-x-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <main>
          {/* Hero Section with Score and Stats */}
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            <Card className="col-span-1 lg:col-span-2 flex items-center justify-between p-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Overall Credit Score</h2>
                <p className="text-5xl font-bold text-green-500">{averageScore}</p>
                <div className="flex items-center text-green-600 mt-2">
                  <ArrowUp className="h-4 w-4" />
                  <p className="ml-1 text-sm font-medium">Good standing</p>
                </div>
              </div>
              <div className="w-1/2 flex justify-center">
                <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-12 w-12 text-white" />
                </div>
              </div>
            </Card>
            
            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-2">Negative Items</h3>
              <p className="text-3xl font-bold text-red-500">{negativeItems}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {data.accountSummary.collectionsAccounts > 0 ? 'Collections present' : 'Good standing'}
              </p>
            </Card>
            
            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-2">Total Accounts</h3>
              <p className="text-3xl font-bold text-foreground">{data.accountSummary.totalAccounts}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {data.accountSummary.openAccounts} open accounts
              </p>
            </Card>
          </section>

          {/* Dispute Progress Timeline */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Dispute Round Progress</h2>
            <div className="relative">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-muted -translate-y-1/2"></div>
              <div className="absolute top-1/2 left-0 w-1/12 h-1 bg-primary -translate-y-1/2"></div>
              <div className="relative flex justify-between items-start">
                <div className="text-center w-1/12">
                  <div className="mx-auto w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-full border-4 border-background shadow-md">
                    <Check className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-primary">Round 1</p>
                  <p className="text-xs text-muted-foreground">Complete</p>
                </div>
                <div className="text-center w-1/12">
                  <div className="mx-auto w-10 h-10 flex items-center justify-center bg-background text-primary rounded-full border-4 border-primary shadow-md">
                    <p className="font-bold">2</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-primary">Round 2</p>
                  <p className="text-xs text-muted-foreground">Current</p>
                </div>
                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                  <div key={num} className="text-center w-1/12">
                    <div className="mx-auto w-10 h-10 flex items-center justify-center bg-muted text-muted-foreground rounded-full border-4 border-background">
                      <p className="font-bold">{num}</p>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-muted-foreground">Round {num}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Account Details Table */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl font-bold text-foreground">Account Details</CardTitle>
                  <p className="text-sm text-muted-foreground">Overview of all your accounts and their status.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 border rounded-lg p-1 bg-muted">
                    <button
                      onClick={() => setBureauFilter('all')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        bureauFilter === 'all' 
                          ? 'bg-background shadow-sm text-primary' 
                          : 'text-muted-foreground hover:bg-background/50'
                      }`}
                    >
                      All ({data.accountSummary.totalAccounts})
                    </button>
                    <button
                      onClick={() => setBureauFilter('equifax')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        bureauFilter === 'equifax' 
                          ? 'bg-background shadow-sm text-primary' 
                          : 'text-muted-foreground hover:bg-background/50'
                      }`}
                    >
                      Equifax
                    </button>
                    <button
                      onClick={() => setBureauFilter('experian')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        bureauFilter === 'experian' 
                          ? 'bg-background shadow-sm text-primary' 
                          : 'text-muted-foreground hover:bg-background/50'
                      }`}
                    >
                      Experian
                    </button>
                    <button
                      onClick={() => setBureauFilter('transunion')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        bureauFilter === 'transunion' 
                          ? 'bg-background shadow-sm text-primary' 
                          : 'text-muted-foreground hover:bg-background/50'
                      }`}
                    >
                      TransUnion
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Bureau</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Reported</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {data.accounts.length === 0 ? 'No credit accounts found' : 'No accounts match the selected filter'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAccounts.slice(0, 10).map((account) => (
                        <TableRow key={account.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{account.creditor}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {account.bureaus.join(', ')}
                          </TableCell>
                          <TableCell>{getStatusBadge(account.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {account.lastReported || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {(account.status === 'derogatory' || account.status === 'collection') && (
                                <Button variant="link" size="sm" className="text-primary hover:text-primary/80">
                                  Dispute
                                </Button>
                              )}
                              <Button variant="link" size="sm" className="text-primary hover:text-primary/80">
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};