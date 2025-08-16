import React, { useState, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ChevronDown, 
  ChevronUp, 
  CreditCard, 
  Home, 
  Car, 
  GraduationCap,
  AlertCircle,
  CheckCircle,
  Download
} from 'lucide-react';
import { Logger } from '@/utils/logger';

interface OptimizedCreditReportProps {
  data: any;
  runId?: string;
  onRefresh?: () => void;
}

/**
 * Optimized Credit Score Display
 */
const CreditScoreCard = memo(({ scores }: { scores: any[] }) => {
  if (!scores || scores.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No score data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit Scores</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {scores.map((score, idx) => (
            <div key={idx} className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-primary">
                {score.score || 'N/A'}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {score.bureau}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

/**
 * Optimized Account List with pagination
 */
const AccountsList = memo(({ 
  accounts, 
  title, 
  icon 
}: { 
  accounts: any[]; 
  title: string; 
  icon: React.ReactNode;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  
  const totalPages = Math.ceil(accounts.length / pageSize);
  const currentAccounts = accounts.slice(page * pageSize, (page + 1) * pageSize);
  
  if (!accounts || accounts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader 
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle>{title}</CardTitle>
            <Badge variant="secondary">{accounts.length}</Badge>
          </div>
          {expanded ? <ChevronUp /> : <ChevronDown />}
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent>
          <div className="space-y-3">
            {currentAccounts.map((account, idx) => (
              <div key={idx} className="p-3 border rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{account.creditor || 'Unknown'}</p>
                    <p className="text-sm text-muted-foreground">
                      Account: {account.accountNumber || 'N/A'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${account.balance || 0}</p>
                    <p className="text-sm text-muted-foreground">
                      {account.status || 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="py-1 px-3">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
});

/**
 * Main Optimized Credit Report Component
 */
const OptimizedCreditReport: React.FC<OptimizedCreditReportProps> = ({ 
  data, 
  runId,
  onRefresh 
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Process data once
  const processedData = useMemo(() => {
    if (!data) return null;
    
    Logger.debug('Processing credit report data');
    
    // Extract scores efficiently
    const scores = [];
    if (data.scores) {
      scores.push(...data.scores);
    } else if (data.capturedLists) {
      // Extract from browse.ai format
      const scoreList = data.capturedLists['Credit Scores'] || 
                       data.capturedLists['credit scores'] || 
                       [];
      scoreList.forEach((item: any) => {
        const bureau = item.bureau || item.Bureau || 'Unknown';
        const score = item.score || item.Score || null;
        if (bureau && score) {
          scores.push({ bureau, score });
        }
      });
    }
    
    // Extract accounts by type
    const accounts = {
      credit: [],
      mortgage: [],
      auto: [],
      student: [],
      other: []
    };
    
    // Process accounts from various sources
    const accountList = data.accounts || 
                       data.capturedLists?.['Accounts'] || 
                       data.capturedLists?.['accounts'] || 
                       [];
    
    accountList.forEach((account: any) => {
      const type = (account.type || account.accountType || '').toLowerCase();
      const processed = {
        creditor: account.creditor || account.creditorName || 'Unknown',
        accountNumber: account.accountNumber || account.number || 'N/A',
        balance: account.balance || account.currentBalance || 0,
        status: account.status || account.accountStatus || 'Unknown',
        type: type
      };
      
      if (type.includes('credit') || type.includes('card')) {
        accounts.credit.push(processed);
      } else if (type.includes('mortgage') || type.includes('home')) {
        accounts.mortgage.push(processed);
      } else if (type.includes('auto') || type.includes('car')) {
        accounts.auto.push(processed);
      } else if (type.includes('student') || type.includes('education')) {
        accounts.student.push(processed);
      } else {
        accounts.other.push(processed);
      }
    });
    
    // Extract inquiries
    const inquiries = data.inquiries || 
                     data.capturedLists?.['Inquiries'] || 
                     data.capturedLists?.['inquiries'] || 
                     [];
    
    return {
      scores,
      accounts,
      inquiries,
      totalAccounts: accountList.length,
      hasData: scores.length > 0 || accountList.length > 0
    };
  }, [data]);
  
  // Handle data export
  const handleExport = useCallback(() => {
    if (!data) return;
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-report-${runId || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, runId]);
  
  if (!processedData) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No credit report data available. Please import your credit report.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Credit Report Analysis</h2>
        <div className="flex gap-2">
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline" size="sm">
              Refresh
            </Button>
          )}
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
      
      {/* Summary Stats */}
      {processedData.hasData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {processedData.totalAccounts}
              </div>
              <p className="text-xs text-muted-foreground">Total Accounts</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {processedData.accounts.credit.length}
              </div>
              <p className="text-xs text-muted-foreground">Credit Cards</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {processedData.inquiries.length}
              </div>
              <p className="text-xs text-muted-foreground">Inquiries</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                <CheckCircle className="h-6 w-6" />
              </div>
              <p className="text-xs text-muted-foreground">Report Loaded</p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <CreditScoreCard scores={processedData.scores} />
          
          {/* Account Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Account Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(processedData.accounts).map(([type, accounts]) => (
                  <div key={type} className="text-center">
                    <div className="text-2xl font-semibold">
                      {(accounts as any[]).length}
                    </div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {type}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="accounts" className="space-y-4">
          <AccountsList 
            accounts={processedData.accounts.credit}
            title="Credit Cards"
            icon={<CreditCard className="h-5 w-5" />}
          />
          
          <AccountsList 
            accounts={processedData.accounts.mortgage}
            title="Mortgages"
            icon={<Home className="h-5 w-5" />}
          />
          
          <AccountsList 
            accounts={processedData.accounts.auto}
            title="Auto Loans"
            icon={<Car className="h-5 w-5" />}
          />
          
          <AccountsList 
            accounts={processedData.accounts.student}
            title="Student Loans"
            icon={<GraduationCap className="h-5 w-5" />}
          />
          
          <AccountsList 
            accounts={processedData.accounts.other}
            title="Other Accounts"
            icon={<CreditCard className="h-5 w-5" />}
          />
        </TabsContent>
        
        <TabsContent value="inquiries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Credit Inquiries</CardTitle>
            </CardHeader>
            <CardContent>
              {processedData.inquiries.length > 0 ? (
                <div className="space-y-2">
                  {processedData.inquiries.slice(0, 20).map((inquiry: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 border-b">
                      <span>{inquiry.creditor || inquiry.company || 'Unknown'}</span>
                      <span className="text-sm text-muted-foreground">
                        {inquiry.date || 'N/A'}
                      </span>
                    </div>
                  ))}
                  {processedData.inquiries.length > 20 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      And {processedData.inquiries.length - 20} more...
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No inquiries found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OptimizedCreditReport;