import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Download,
  FileText,
  User,
  CreditCard,
  Search,
  ArrowLeft
} from 'lucide-react';
import { CreditReportTimeline } from './CreditReportTimeline';
import { CreditReportPersonalInfo } from './CreditReportPersonalInfo';
import { CreditReportAccountsTable } from './CreditReportAccountsTable';
import { CreditReportInquiriesTable } from './CreditReportInquiriesTable';
import { CreditReport } from '@/services/CreditReportService';

interface CreditReportAnalysisProps {
  reportId: string;
  reportName: string;
  onBack: () => void;
}

interface PersonalInfo {
  full_name?: string;
  date_of_birth?: string;
  current_address?: any;
  previous_addresses?: any;
  phone_number?: string;
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
  account_status?: string;
  is_negative: boolean;
  payment_status?: string;
}

interface CreditInquiry {
  id: string;
  inquirer_name: string;
  inquiry_date?: string;
  inquiry_type?: string;
}

export const CreditReportAnalysis: React.FC<CreditReportAnalysisProps> = ({
  reportId,
  reportName,
  onBack
}) => {
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [inquiries, setInquiries] = useState<CreditInquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalysisData();
  }, [reportId]);

  const loadAnalysisData = async () => {
    try {
      setLoading(true);

      console.log('🔄 Loading analysis data for report:', reportId);

      // Use the unified processor to handle everything
      const { UnifiedCreditProcessor } = await import('@/services/UnifiedCreditProcessor');
      const result = await UnifiedCreditProcessor.processReport(reportId);

      if (result.success) {
        console.log('✅ Processing successful:', {
          personalInfo: !!result.personalInfo,
          accounts: result.accounts.length,
          inquiries: result.inquiries.length,
          negativeItems: result.negativeItems.length
        });

        // Set the data
        setPersonalInfo(result.personalInfo);
        setAccounts(result.accounts);
        setInquiries(result.inquiries);

        // Show success message
        if (result.accounts.length > 0 || result.personalInfo) {
          toast.success(`Successfully loaded ${result.accounts.length} accounts and personal information`);
        }
      } else {
        console.error('❌ Processing failed:', result.errors);
        toast.error(`Processing failed: ${result.errors.join(', ')}`);
        
        // Still try to load any existing data
        const [personalResponse, accountsResponse, inquiriesResponse] = await Promise.all([
          supabase.from('personal_information').select('*').eq('report_id', reportId).maybeSingle(),
          supabase.from('credit_accounts').select('*').eq('report_id', reportId),
          supabase.from('credit_inquiries').select('*').eq('report_id', reportId)
        ]);

        setPersonalInfo(personalResponse.data);
        setAccounts(accountsResponse.data || []);
        setInquiries(inquiriesResponse.data || []);
      }

    } catch (error) {
      console.error('❌ Error in loadAnalysisData:', error);
      toast.error('Failed to load credit report data');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = () => {
    toast.info('Download functionality will be implemented');
  };

  const handleForceReparse = async () => {
    try {
      toast.info('Re-processing credit report...');
      setLoading(true);
      
      // Clear existing data first
      await Promise.all([
        supabase.from('personal_information').delete().eq('report_id', reportId),
        supabase.from('credit_accounts').delete().eq('report_id', reportId),
        supabase.from('credit_inquiries').delete().eq('report_id', reportId),
        supabase.from('negative_items').delete().eq('report_id', reportId)
      ]);

      // Reset extraction status
      await supabase
        .from('credit_reports')
        .update({ extraction_status: 'pending', raw_text: null })
        .eq('id', reportId);

      // Use unified processor to re-process everything
      const { UnifiedCreditProcessor } = await import('@/services/UnifiedCreditProcessor');
      const result = await UnifiedCreditProcessor.processReport(reportId);

      if (result.success) {
        toast.success('Re-processing completed! Data extracted successfully.');
        
        // Update UI with new data
        setPersonalInfo(result.personalInfo);
        setAccounts(result.accounts);
        setInquiries(result.inquiries);
      } else {
        toast.error(`Re-processing failed: ${result.errors.join(', ')}`);
      }
      
    } catch (error) {
      console.error('Re-processing failed:', error);
      toast.error('Re-processing failed');
    } finally {
      setLoading(false);
    }
  };

  // Mock rounds data - this would come from actual round system
  const mockRounds: Record<number, CreditReport | undefined> = {
    1: {
      id: reportId,
      user_id: '',
      bureau_name: 'Equifax',
      file_name: reportName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      extraction_status: 'completed'
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-dashboard">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2">Loading credit report analysis...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Dashboard</span>
                <span className="text-muted-foreground">&gt;</span>
                <span className="font-medium">Credit Report</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleForceReparse} className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Process Report
              </Button>
              <Button onClick={handleDownloadReport} className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download Report
              </Button>
            </div>
          </div>
          
          <div className="mt-4">
            <h1 className="text-2xl font-bold">Client Credit Report</h1>
            <p className="text-muted-foreground">A complete overview of the client's credit history.</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Timeline Section */}
        <CreditReportTimeline
          rounds={mockRounds}
          currentRound={1}
          onUploadReport={(round) => toast.info(`Upload for round ${round}`)}
          onPreviewReport={(report) => toast.info(`Preview ${report.file_name}`)}
          onViewReport={(id) => toast.info(`View report ${id}`)}
        />

        <Separator />

        {/* Personal Information Section */}
        <CreditReportPersonalInfo personalInfo={personalInfo} />

        {/* Accounts Section */}
        <CreditReportAccountsTable accounts={accounts} />

        {/* Inquiries Section */}
        <CreditReportInquiriesTable inquiries={inquiries} />
      </div>
    </div>
  );
};