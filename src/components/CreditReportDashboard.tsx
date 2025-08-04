import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  User, 
  CreditCard, 
  Search, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface CreditReport {
  id: string;
  bureau_name: string;
  report_date: string;
  file_name: string;
  extraction_status: string;
  created_at: string;
}

interface PersonalInfo {
  full_name: string;
  ssn_partial: string;
  date_of_birth: string;
  current_address: any;
}

interface CreditAccount {
  id: string;
  creditor_name: string;
  account_type: string;
  current_balance: number;
  credit_limit: number;
  payment_status: string;
  account_status: string;
  date_opened: string;
  is_negative: boolean;
}

interface CreditInquiry {
  id: string;
  inquirer_name: string;
  inquiry_date: string;
  inquiry_type: string;
}

interface NegativeItem {
  id: string;
  negative_type: string;
  description: string;
  amount: number;
  date_occurred: string;
  severity_score: number;
}

export const CreditReportDashboard = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<CreditReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<CreditReport | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [inquiries, setInquiries] = useState<CreditInquiry[]>([]);
  const [negativeItems, setNegativeItems] = useState<NegativeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadReports();
    }
  }, [user]);

  useEffect(() => {
    if (selectedReport) {
      loadReportData(selectedReport.id);
    }
  }, [selectedReport]);

  const loadReports = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setReports(data || []);
      if (data && data.length > 0) {
        setSelectedReport(data[0]);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      toast.error('Failed to load credit reports');
    } finally {
      setLoading(false);
    }
  };

  const loadReportData = async (reportId: string) => {
    try {
      // Load personal information
      const { data: personalData } = await supabase
        .from('personal_information')
        .select('*')
        .eq('report_id', reportId)
        .single();

      setPersonalInfo(personalData);

      // Load credit accounts
      const { data: accountsData } = await supabase
        .from('credit_accounts')
        .select('*')
        .eq('report_id', reportId)
        .order('date_opened', { ascending: false });

      setAccounts(accountsData || []);

      // Load credit inquiries
      const { data: inquiriesData } = await supabase
        .from('credit_inquiries')
        .select('*')
        .eq('report_id', reportId)
        .order('inquiry_date', { ascending: false });

      setInquiries(inquiriesData || []);

      // Load negative items
      const { data: negativeData } = await supabase
        .from('negative_items')
        .select('*')
        .eq('report_id', reportId)
        .order('severity_score', { ascending: false });

      setNegativeItems(negativeData || []);

    } catch (error) {
      console.error('Error loading report data:', error);
      toast.error('Failed to load report details');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'processing': return 'outline';
      case 'failed': return 'destructive';
      default: return 'secondary';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Credit Reports</h3>
          <p className="text-muted-foreground">
            Upload a credit report to get started with your analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Report Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Your Credit Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => (
              <Card 
                key={report.id}
                className={`cursor-pointer transition-colors ${
                  selectedReport?.id === report.id 
                    ? 'ring-2 ring-primary' 
                    : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedReport(report)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{report.bureau_name}</h4>
                    <Badge variant={getStatusColor(report.extraction_status)}>
                      {report.extraction_status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {report.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(report.created_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Report Details */}
      {selectedReport && (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="personal">Personal Info</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
            <TabsTrigger value="negative">Negative Items</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Total Accounts</span>
                  </div>
                  <div className="text-2xl font-bold">{accounts.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Credit Inquiries</span>
                  </div>
                  <div className="text-2xl font-bold">{inquiries.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                    <span className="text-sm font-medium">Negative Items</span>
                  </div>
                  <div className="text-2xl font-bold text-danger">{negativeItems.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium">Total Credit Limit</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(accounts.reduce((sum, acc) => sum + (acc.credit_limit || 0), 0))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="personal" className="space-y-4">
            {personalInfo ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                      <p className="text-lg">{personalInfo.full_name || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                      <p className="text-lg">{personalInfo.date_of_birth ? formatDate(personalInfo.date_of_birth) : 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">SSN (Partial)</label>
                      <p className="text-lg">{personalInfo.ssn_partial || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Current Address</label>
                      <p className="text-lg">
                        {personalInfo.current_address 
                          ? JSON.stringify(personalInfo.current_address).replace(/[{}\"]/g, '').replace(/,/g, ', ')
                          : 'Not provided'
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">No personal information available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4">
            <div className="grid gap-4">
              {accounts.map((account) => (
                <Card key={account.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold">{account.creditor_name}</h4>
                      <div className="flex items-center gap-2">
                        <Badge variant={account.is_negative ? 'destructive' : 'default'}>
                          {account.account_status}
                        </Badge>
                        {account.is_negative && <AlertTriangle className="h-4 w-4 text-danger" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Account Type</span>
                        <p className="font-medium">{account.account_type || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Current Balance</span>
                        <p className="font-medium">{formatCurrency(account.current_balance)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credit Limit</span>
                        <p className="font-medium">{formatCurrency(account.credit_limit)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date Opened</span>
                        <p className="font-medium">{account.date_opened ? formatDate(account.date_opened) : 'Unknown'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="inquiries" className="space-y-4">
            <div className="grid gap-4">
              {inquiries.map((inquiry) => (
                <Card key={inquiry.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">{inquiry.inquirer_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {inquiry.inquiry_type} inquiry
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{inquiry.inquiry_date ? formatDate(inquiry.inquiry_date) : 'Date unknown'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="negative" className="space-y-4">
            <div className="grid gap-4">
              {negativeItems.map((item) => (
                <Card key={item.id} className="border-l-4 border-l-danger">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-danger">{item.negative_type}</h4>
                      <Badge variant="destructive">
                        Severity: {item.severity_score || 'Unknown'}
                      </Badge>
                    </div>
                    <p className="text-sm mb-2">{item.description}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Amount: {formatCurrency(item.amount)}
                      </span>
                      <span className="text-muted-foreground">
                        Date: {item.date_occurred ? formatDate(item.date_occurred) : 'Unknown'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};