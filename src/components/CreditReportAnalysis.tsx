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

      // Check if report has been parsed with comprehensive data
      const { data: reportData } = await supabase
        .from('credit_reports')
        .select('raw_text, extraction_status')
        .eq('id', reportId)
        .single();

      // If we have raw text but no parsed data, trigger comprehensive parsing
      if (reportData?.raw_text && reportData.extraction_status === 'completed') {
        try {
          // Check if we already have personal info (indicating parsing was done)
          const { data: existingPersonalInfo } = await supabase
            .from('personal_information')
            .select('id')
            .eq('report_id', reportId)
            .maybeSingle();

          // If no personal info exists, trigger comprehensive parsing
          if (!existingPersonalInfo) {
            console.log('Triggering comprehensive parsing for enhanced data extraction...');
            const { ComprehensiveCreditParser } = await import('@/services/ComprehensiveCreditParser');
            await ComprehensiveCreditParser.parseReport(reportId);
            console.log('Comprehensive parsing completed');
          }
        } catch (parseError) {
          console.error('Error in comprehensive parsing:', parseError);
          // Continue loading existing data even if parsing fails
        }
      }

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
      } else {
        setAccounts(accountsData || []);
      }

      // Load credit inquiries
      const { data: inquiriesData, error: inquiriesError } = await supabase
        .from('credit_inquiries')
        .select('*')
        .eq('report_id', reportId)
        .order('inquiry_date', { ascending: false });

      if (inquiriesError) {
        console.error('Error loading inquiries:', inquiriesError);
      } else {
        setInquiries(inquiriesData || []);
      }

      // If still no data, try fallback PDF parsing
      if ((!personalData && !accountsData?.length && !inquiriesData?.length) && reportData?.raw_text) {
        console.log('No extracted data found, using fallback PDF parsing...');
        const PDFProcessor = await import('@/services/PDFProcessor');
        const parsedData = await import('@/services/CreditReportParser');
        
        try {
          await parsedData.CreditReportParser.parseReport(reportId);
          // Reload data after parsing
          setTimeout(() => loadAnalysisData(), 1000);
        } catch (fallbackError) {
          console.error('Fallback parsing also failed:', fallbackError);
        }
      }

    } catch (error) {
      console.error('Error loading analysis data:', error);
      toast.error('Failed to load analysis data');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = () => {
    toast.info('Download functionality will be implemented');
  };

  const handleForceReparse = async () => {
    try {
      toast.info('Running comprehensive system diagnostics...');
      setLoading(true);
      
      // Run full diagnostics first
      const { CreditReportDiagnostics } = await import('@/services/CreditReportDiagnostics');
      console.log('🔍 Starting full system diagnostics...');
      await CreditReportDiagnostics.runFullDiagnostics(reportId);
      
      // Attempt emergency recovery
      console.log('🚨 Attempting emergency recovery...');
      const recoverySuccess = await CreditReportDiagnostics.attemptEmergencyRecovery(reportId);
      
      if (recoverySuccess) {
        toast.success('Emergency recovery initiated! Check console for detailed diagnostics. Refreshing in 5 seconds...');
        setTimeout(async () => {
          await loadAnalysisData();
        }, 5000);
      } else {
        toast.error('Emergency recovery failed. Check console for detailed diagnostics.');
      }
      
    } catch (error) {
      console.error('❌ Diagnostics and recovery failed:', error);
      toast.error('System diagnostics failed. Check console for details.');
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
                Run Diagnostics & Fix
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