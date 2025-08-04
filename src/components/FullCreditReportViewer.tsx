import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ArrowLeft,
  Download,
  Printer,
  Share2,
  User,
  CreditCard,
  Building,
  AlertTriangle,
  Eye,
  EyeOff,
  Calendar,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

interface FullCreditReportViewerProps {
  reportId: string;
  onBack: () => void;
}

interface PersonalInfo {
  id: string;
  full_name?: string;
  ssn_partial?: string;
  date_of_birth?: string;
  current_address?: any;
  previous_addresses?: any;
  employer_info?: any;
}

interface CreditAccount {
  id: string;
  creditor_name: string;
  account_number?: string;
  account_type?: string;
  date_opened?: string;
  date_closed?: string;
  credit_limit?: number;
  current_balance?: number;
  high_credit?: number;
  payment_status?: string;
  account_status?: string;
  is_negative: boolean;
  past_due_amount?: number;
  payment_history?: any;
}

interface Collection {
  id: string;
  collection_agency: string;
  original_creditor?: string;
  amount?: number;
  date_assigned?: string;
  account_number?: string;
  status?: string;
}

interface PublicRecord {
  id: string;
  record_type: string;
  filing_date?: string;
  case_number?: string;
  amount?: number;
  status?: string;
  court_name?: string;
}

interface CreditInquiry {
  id: string;
  inquirer_name: string;
  inquiry_date?: string;
  inquiry_type?: string;
}

export const FullCreditReportViewer: React.FC<FullCreditReportViewerProps> = ({
  reportId,
  onBack
}) => {
  const [reportData, setReportData] = useState<any>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [publicRecords, setPublicRecords] = useState<PublicRecord[]>([]);
  const [inquiries, setInquiries] = useState<CreditInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSensitive, setShowSensitive] = useState(false);

  useEffect(() => {
    loadFullReportData();
  }, [reportId]);

  const loadFullReportData = async () => {
    try {
      setLoading(true);

      // Load report basic info
      const { data: report, error: reportError } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (reportError) throw reportError;
      setReportData(report);

      // Load all related data in parallel
      const [
        personalResult,
        accountsResult,
        collectionsResult,
        publicRecordsResult,
        inquiriesResult
      ] = await Promise.allSettled([
        supabase.from('personal_information').select('*').eq('report_id', reportId).maybeSingle(),
        supabase.from('credit_accounts').select('*').eq('report_id', reportId).order('is_negative', { ascending: false }),
        supabase.from('collections').select('*').eq('report_id', reportId),
        supabase.from('public_records').select('*').eq('report_id', reportId),
        supabase.from('credit_inquiries').select('*').eq('report_id', reportId).order('inquiry_date', { ascending: false })
      ]);

      // Handle results
      if (personalResult.status === 'fulfilled' && personalResult.value.data) {
        setPersonalInfo(personalResult.value.data);
      }
      
      if (accountsResult.status === 'fulfilled' && accountsResult.value.data) {
        setAccounts(accountsResult.value.data);
      }
      
      if (collectionsResult.status === 'fulfilled' && collectionsResult.value.data) {
        setCollections(collectionsResult.value.data);
      }
      
      if (publicRecordsResult.status === 'fulfilled' && publicRecordsResult.value.data) {
        setPublicRecords(publicRecordsResult.value.data);
      }
      
      if (inquiriesResult.status === 'fulfilled' && inquiriesResult.value.data) {
        setInquiries(inquiriesResult.value.data);
      }

    } catch (error) {
      console.error('Error loading full report data:', error);
      toast.error('Failed to load complete report data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount === null || amount === undefined) return 'N/A';
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const maskAccountNumber = (accountNumber?: string) => {
    if (!accountNumber) return 'N/A';
    if (showSensitive) return accountNumber;
    return accountNumber.replace(/\d(?=\d{4})/g, '*');
  };

  const getAccountStatusIcon = (account: CreditAccount) => {
    if (account.is_negative) {
      return <XCircle className="w-5 h-5 text-destructive" />;
    }
    const status = account.account_status?.toLowerCase();
    if (status?.includes('open')) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <Clock className="w-5 h-5 text-muted-foreground" />;
  };

  const calculateTotals = () => {
    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);
    const totalLimit = accounts.reduce((sum, acc) => sum + (acc.credit_limit || 0), 0);
    const utilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
    
    return {
      totalAccounts: accounts.length,
      openAccounts: accounts.filter(acc => acc.account_status?.toLowerCase().includes('open')).length,
      closedAccounts: accounts.filter(acc => acc.account_status?.toLowerCase().includes('closed')).length,
      totalBalance,
      totalLimit,
      utilization: Math.round(utilization)
    };
  };

  const renderPaymentHistory = (account: CreditAccount) => {
    if (!account.payment_history) return null;
    
    // Simplified payment history visualization
    const history = Array.isArray(account.payment_history) ? account.payment_history : [];
    
    return (
      <div className="mt-3">
        <h5 className="text-sm font-medium mb-2">Payment History (Last 24 Months)</h5>
        <div className="flex gap-1 flex-wrap">
          {history.slice(0, 24).map((payment: any, index: number) => {
            let color = 'bg-green-500'; // On time
            let symbol = '✓';
            
            if (payment === '30' || payment.includes('30')) {
              color = 'bg-yellow-500';
              symbol = '30';
            } else if (payment === '60' || payment.includes('60')) {
              color = 'bg-orange-500';
              symbol = '60';
            } else if (payment === '90' || payment.includes('90')) {
              color = 'bg-red-500';
              symbol = '90';
            } else if (payment === 'CO' || payment.includes('charge')) {
              color = 'bg-black';
              symbol = 'CO';
            }
            
            return (
              <div
                key={index}
                className={`w-6 h-6 ${color} text-white text-xs flex items-center justify-center rounded`}
                title={`Month ${index + 1}: ${payment}`}
              >
                {symbol}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Loading complete report...</span>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">Report Not Found</h3>
        <p className="text-muted-foreground">The requested report could not be loaded.</p>
        <Button onClick={onBack} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Reports
        </Button>
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Reports
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{reportData.bureau_name} Credit Report</h1>
            {reportData.report_date && (
              <p className="text-muted-foreground">
                As of {formatDate(reportData.report_date)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="outline">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button variant="outline">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowSensitive(!showSensitive)}
          >
            {showSensitive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showSensitive ? 'Hide' : 'Show'} Sensitive
          </Button>
        </div>
      </div>

      {/* Account Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totals.totalAccounts}</div>
            <div className="text-sm text-muted-foreground">Total Accounts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{totals.openAccounts}</div>
            <div className="text-sm text-muted-foreground">Open</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totals.closedAccounts}</div>
            <div className="text-sm text-muted-foreground">Closed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{formatCurrency(totals.totalBalance)}</div>
            <div className="text-sm text-muted-foreground">Total Balance</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{formatCurrency(totals.totalLimit)}</div>
            <div className="text-sm text-muted-foreground">Credit Limit</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totals.utilization}%</div>
            <div className="text-sm text-muted-foreground">Utilization</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="personal" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="personal">
            <User className="w-4 h-4 mr-2" />
            Personal Info
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <CreditCard className="w-4 h-4 mr-2" />
            Accounts ({accounts.length})
          </TabsTrigger>
          <TabsTrigger value="collections">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Collections ({collections.length})
          </TabsTrigger>
          <TabsTrigger value="public">
            <Building className="w-4 h-4 mr-2" />
            Public Records ({publicRecords.length})
          </TabsTrigger>
          <TabsTrigger value="inquiries">
            <FileText className="w-4 h-4 mr-2" />
            Inquiries ({inquiries.length})
          </TabsTrigger>
        </TabsList>

        {/* Personal Information */}
        <TabsContent value="personal">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Personal details from your credit report
              </CardDescription>
            </CardHeader>
            <CardContent>
              {personalInfo ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    {personalInfo.full_name && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                        <div className="text-lg">{personalInfo.full_name}</div>
                      </div>
                    )}
                    
                    {personalInfo.ssn_partial && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Social Security Number</label>
                        <div className="text-lg font-mono">
                          {showSensitive ? personalInfo.ssn_partial : '***-**-****'}
                        </div>
                      </div>
                    )}
                    
                    {personalInfo.date_of_birth && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                        <div className="text-lg">{formatDate(personalInfo.date_of_birth)}</div>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    {personalInfo.current_address && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Current Address</label>
                        <div className="bg-muted p-3 rounded">
                          {typeof personalInfo.current_address === 'string' 
                            ? personalInfo.current_address 
                            : JSON.stringify(personalInfo.current_address, null, 2)}
                        </div>
                      </div>
                    )}
                    
                    {personalInfo.employer_info && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Employer Information</label>
                        <div className="bg-muted p-3 rounded">
                          {typeof personalInfo.employer_info === 'string' 
                            ? personalInfo.employer_info 
                            : JSON.stringify(personalInfo.employer_info, null, 2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No personal information found in this report.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credit Accounts */}
        <TabsContent value="accounts">
          <div className="space-y-4">
            {accounts.length > 0 ? (
              accounts.map((account) => (
                <Card key={account.id} className={account.is_negative ? 'border-destructive' : ''}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-semibold">{account.creditor_name}</h3>
                          {getAccountStatusIcon(account)}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          {account.is_negative ? (
                            <Badge variant="destructive">Negative Item</Badge>
                          ) : (
                            <Badge variant="default" className="bg-green-500">Positive</Badge>
                          )}
                          {account.account_type && (
                            <Badge variant="outline">{account.account_type}</Badge>
                          )}
                          <Badge variant="secondary">{account.account_status || 'Unknown Status'}</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Account Number</label>
                        <div className="font-mono">{maskAccountNumber(account.account_number)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Date Opened</label>
                        <div>{formatDate(account.date_opened)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Date Closed</label>
                        <div>{formatDate(account.date_closed)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Credit Limit</label>
                        <div className="font-semibold">{formatCurrency(account.credit_limit)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Current Balance</label>
                        <div className="font-semibold">{formatCurrency(account.current_balance)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">High Credit</label>
                        <div>{formatCurrency(account.high_credit)}</div>
                      </div>
                    </div>

                    {account.past_due_amount && account.past_due_amount > 0 && (
                      <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded">
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="font-semibold">Past Due: {formatCurrency(account.past_due_amount)}</span>
                        </div>
                      </div>
                    )}

                    {account.payment_status && (
                      <div className="mb-3">
                        <label className="text-sm font-medium text-muted-foreground">Payment Status</label>
                        <div>{account.payment_status}</div>
                      </div>
                    )}

                    {renderPaymentHistory(account)}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-6 text-center">
                  <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No credit accounts found in this report.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Collections */}
        <TabsContent value="collections">
          <Card>
            <CardHeader>
              <CardTitle>Collection Accounts</CardTitle>
              <CardDescription>
                Accounts that have been sent to collection agencies
              </CardDescription>
            </CardHeader>
            <CardContent>
              {collections.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Collection Agency</TableHead>
                      <TableHead>Original Creditor</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date Assigned</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collections.map((collection) => (
                      <TableRow key={collection.id}>
                        <TableCell className="font-medium">{collection.collection_agency}</TableCell>
                        <TableCell>{collection.original_creditor || 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(collection.amount)}</TableCell>
                        <TableCell>{formatDate(collection.date_assigned)}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{collection.status || 'Active'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No collection accounts found. Great news!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Public Records */}
        <TabsContent value="public">
          <Card>
            <CardHeader>
              <CardTitle>Public Records</CardTitle>
              <CardDescription>
                Bankruptcies, liens, and judgments from public records
              </CardDescription>
            </CardHeader>
            <CardContent>
              {publicRecords.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Filing Date</TableHead>
                      <TableHead>Case Number</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Court/Agency</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {publicRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.record_type}</TableCell>
                        <TableCell>{formatDate(record.filing_date)}</TableCell>
                        <TableCell className="font-mono">{record.case_number || 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(record.amount)}</TableCell>
                        <TableCell>{record.court_name || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{record.status || 'Filed'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No public records found. Excellent!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credit Inquiries */}
        <TabsContent value="inquiries">
          <Card>
            <CardHeader>
              <CardTitle>Credit Inquiries</CardTitle>
              <CardDescription>
                Recent requests to view your credit report
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inquiries.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inquiries.map((inquiry) => (
                      <TableRow key={inquiry.id}>
                        <TableCell className="font-medium">{inquiry.inquirer_name}</TableCell>
                        <TableCell>{formatDate(inquiry.inquiry_date)}</TableCell>
                        <TableCell>
                          <Badge variant={inquiry.inquiry_type === 'hard' ? 'destructive' : 'secondary'}>
                            {inquiry.inquiry_type || 'Unknown'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No credit inquiries found.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};