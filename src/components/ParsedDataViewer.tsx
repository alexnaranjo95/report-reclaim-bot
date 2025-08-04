import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  User, 
  CreditCard, 
  Building, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  FileText,
  Eye,
  EyeOff
} from 'lucide-react';

interface ParsedDataViewerProps {
  reportId: string;
  reportName: string;
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
}

export const ParsedDataViewer: React.FC<ParsedDataViewerProps> = ({
  reportId,
  reportName
}) => {
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSensitive, setShowSensitive] = useState(false);

  useEffect(() => {
    loadParsedData();
  }, [reportId]);

  const loadParsedData = async () => {
    try {
      setLoading(true);

      // Load personal information
      const { data: personalData, error: personalError } = await supabase
        .from('personal_information')
        .select('*')
        .eq('report_id', reportId)
        .maybeSingle();

      if (personalError) {
        console.error('Error loading personal info:', personalError);
      } else {
        setPersonalInfo(personalData);
      }

      // Load credit accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('credit_accounts')
        .select('*')
        .eq('report_id', reportId)
        .order('is_negative', { ascending: false })
        .order('creditor_name');

      if (accountsError) {
        console.error('Error loading accounts:', accountsError);
        toast.error('Failed to load account data');
      } else {
        setAccounts(accountsData || []);
      }

    } catch (error) {
      console.error('Error loading parsed data:', error);
      toast.error('Failed to load parsed data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getAccountStatusBadge = (account: CreditAccount) => {
    if (account.is_negative) {
      return <Badge variant="destructive">Negative</Badge>;
    }
    
    const status = account.account_status?.toLowerCase();
    if (status?.includes('open')) {
      return <Badge variant="default" className="bg-green-500">Open</Badge>;
    } else if (status?.includes('closed')) {
      return <Badge variant="secondary">Closed</Badge>;
    }
    
    return <Badge variant="outline">{account.account_status || 'Unknown'}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2">Loading parsed data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const negativeAccounts = accounts.filter(acc => acc.is_negative);
  const positiveAccounts = accounts.filter(acc => !acc.is_negative);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Parsed Data: {reportName}
          </CardTitle>
          <CardDescription>
            Structured data extracted from the credit report
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{positiveAccounts.length}</div>
                <div className="text-sm text-muted-foreground">Positive Accounts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{negativeAccounts.length}</div>
                <div className="text-sm text-muted-foreground">Negative Items</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{accounts.length}</div>
                <div className="text-sm text-muted-foreground">Total Accounts</div>
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSensitive(!showSensitive)}
            >
              {showSensitive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showSensitive ? 'Hide' : 'Show'} Sensitive Data
            </Button>
          </div>

          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="personal">
                <User className="w-4 h-4 mr-2" />
                Personal Info
              </TabsTrigger>
              <TabsTrigger value="accounts">
                <CreditCard className="w-4 h-4 mr-2" />
                All Accounts ({accounts.length})
              </TabsTrigger>
              <TabsTrigger value="negative">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Negative Items ({negativeAccounts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="space-y-4">
              {personalInfo ? (
                <Card>
                  <CardContent className="p-6 space-y-4">
                    {personalInfo.full_name && (
                      <div className="flex justify-between">
                        <span className="font-medium">Full Name:</span>
                        <span>{personalInfo.full_name}</span>
                      </div>
                    )}
                    
                    {personalInfo.ssn_partial && (
                      <div className="flex justify-between">
                        <span className="font-medium">SSN:</span>
                        <span className="font-mono">
                          {showSensitive ? personalInfo.ssn_partial : '***-**-****'}
                        </span>
                      </div>
                    )}
                    
                    {personalInfo.date_of_birth && (
                      <div className="flex justify-between">
                        <span className="font-medium">Date of Birth:</span>
                        <span>{formatDate(personalInfo.date_of_birth)}</span>
                      </div>
                    )}
                    
                    {personalInfo.current_address && (
                      <div className="space-y-2">
                        <span className="font-medium">Current Address:</span>
                        <div className="bg-muted p-3 rounded text-sm">
                          {personalInfo.current_address.full_address || 'Address details not fully parsed'}
                        </div>
                      </div>
                    )}
                    
                    {personalInfo.employer_info && (
                      <div className="space-y-2">
                        <span className="font-medium">Employer Information:</span>
                        <div className="bg-muted p-3 rounded text-sm">
                          {JSON.stringify(personalInfo.employer_info, null, 2)}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center">
                    <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Personal Information Found</h3>
                    <p className="text-muted-foreground">
                      Personal information could not be extracted from this report.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="accounts" className="space-y-4">
              {accounts.length > 0 ? (
                <div className="space-y-4">
                  {accounts.map((account) => (
                    <Card key={account.id}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-2">{account.creditor_name}</h3>
                            <div className="flex items-center gap-2 mb-2">
                              {getAccountStatusBadge(account)}
                              {account.account_type && (
                                <Badge variant="outline">{account.account_type}</Badge>
                              )}
                            </div>
                          </div>
                          {account.is_negative ? (
                            <XCircle className="w-6 h-6 text-red-500" />
                          ) : (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Account #:</span>
                            <div className="font-mono">
                              {showSensitive ? account.account_number : account.account_number?.replace(/\d(?=\d{4})/g, '*') || 'N/A'}
                            </div>
                          </div>
                          
                          <div>
                            <span className="font-medium">Date Opened:</span>
                            <div>{formatDate(account.date_opened)}</div>
                          </div>
                          
                          <div>
                            <span className="font-medium">Current Balance:</span>
                            <div className="font-semibold">{formatCurrency(account.current_balance)}</div>
                          </div>
                          
                          <div>
                            <span className="font-medium">Credit Limit:</span>
                            <div>{formatCurrency(account.credit_limit)}</div>
                          </div>
                        </div>
                        
                        {account.past_due_amount && account.past_due_amount > 0 && (
                          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                            <div className="flex items-center gap-2 text-red-700">
                              <AlertTriangle className="w-4 h-4" />
                              <span className="font-medium">Past Due: {formatCurrency(account.past_due_amount)}</span>
                            </div>
                          </div>
                        )}
                        
                        {account.payment_status && (
                          <div className="mt-2 text-sm">
                            <span className="font-medium">Payment Status:</span> {account.payment_status}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center">
                    <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Accounts Found</h3>
                    <p className="text-muted-foreground">
                      No credit account information could be extracted from this report.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="negative" className="space-y-4">
              {negativeAccounts.length > 0 ? (
                <div className="space-y-4">
                  {negativeAccounts.map((account) => (
                    <Card key={account.id} className="border-red-200">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-2 text-red-700">{account.creditor_name}</h3>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="destructive">Negative Item</Badge>
                              {account.account_type && (
                                <Badge variant="outline">{account.account_type}</Badge>
                              )}
                            </div>
                          </div>
                          <XCircle className="w-6 h-6 text-red-500" />
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Account #:</span>
                            <div className="font-mono">
                              {showSensitive ? account.account_number : account.account_number?.replace(/\d(?=\d{4})/g, '*') || 'N/A'}
                            </div>
                          </div>
                          
                          <div>
                            <span className="font-medium">Date Opened:</span>
                            <div>{formatDate(account.date_opened)}</div>
                          </div>
                          
                          <div>
                            <span className="font-medium">Balance:</span>
                            <div className="font-semibold text-red-600">{formatCurrency(account.current_balance)}</div>
                          </div>
                          
                          <div>
                            <span className="font-medium">Status:</span>
                            <div className="text-red-600">{account.account_status || 'N/A'}</div>
                          </div>
                        </div>
                        
                        {account.past_due_amount && account.past_due_amount > 0 && (
                          <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded">
                            <div className="flex items-center gap-2 text-red-800">
                              <AlertTriangle className="w-4 h-4" />
                              <span className="font-semibold">Past Due Amount: {formatCurrency(account.past_due_amount)}</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Negative Items Found</h3>
                    <p className="text-muted-foreground">
                      Great news! No negative items were detected in this credit report.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};