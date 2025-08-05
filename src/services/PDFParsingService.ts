import { supabase } from '@/integrations/supabase/client';

export interface ParsedCreditData {
  personalInfo?: {
    full_name?: string;
    date_of_birth?: string;
    ssn_partial?: string;
    current_address?: any;
    phone_numbers?: string[];
    employer_info?: any;
  };
  accounts: Array<{
    creditor_name: string;
    account_number?: string;
    account_type?: string;
    account_status?: string;
    payment_status?: string;
    date_opened?: string;
    date_closed?: string;
    credit_limit?: number;
    high_credit?: number;
    current_balance?: number;
    past_due_amount?: number;
    monthly_payment?: number;
    payment_history?: any;
    terms?: string;
    responsibility?: string;
    is_negative?: boolean;
    bureau_reporting?: string[];
  }>;
  inquiries: Array<{
    inquirer_name: string;
    inquiry_date?: string;
    inquiry_type?: string;
    purpose?: string;
  }>;
  negativeItems: Array<{
    negative_type: string;
    creditor_name?: string;
    original_creditor?: string;
    account_number?: string;
    amount?: number;
    date_occurred?: string;
    date_reported?: string;
    status?: string;
    description?: string;
    severity_score?: number;
  }>;
  scores: Array<{
    bureau: string;
    score?: number;
    score_date?: string;
    score_model?: string;
    factors?: string[];
  }>;
  publicRecords: Array<{
    record_type: string;
    filing_date?: string;
    court_name?: string;
    case_number?: string;
    amount?: number;
    status?: string;
    liability?: string;
  }>;
}

export class PDFParsingService {
  /**
   * Process a PDF file and extract credit report data
   */
  static async processPDF(reportId: string): Promise<ParsedCreditData> {
    console.log('🚀 Starting PDF processing for report:', reportId);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({ 
        extraction_status: 'processing',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    try {
      // Use the existing textract-extract function
      const { data: report } = await supabase
        .from('credit_reports')
        .select('file_path')
        .eq('id', reportId)
        .single();
        
      if (!report?.file_path) {
        throw new Error('No file path found for this report');
      }

      const { data: result, error } = await supabase.functions.invoke('textract-extract', {
        body: { 
          reportId,
          filePath: report.file_path 
        }
      });

      if (error) {
        throw new Error(`PDF processing failed: ${error.message}`);
      }

      if (!result?.success) {
        throw new Error(result?.error || 'PDF processing failed');
      }

      const parsedData = result.data as ParsedCreditData;
      
      // Store the parsed data in the database
      await this.storeParsedData(reportId, parsedData);

      // Update status to completed
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      console.log('✅ PDF processing completed successfully');
      return parsedData;

    } catch (error) {
      console.error('❌ PDF processing failed:', error);
      
      // Update status to failed
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          processing_errors: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      throw error;
    }
  }

  /**
   * Store parsed data in the database
   */
  private static async storeParsedData(reportId: string, data: ParsedCreditData): Promise<void> {
    console.log('💾 Storing parsed data for report:', reportId);

    // Store personal information
    if (data.personalInfo) {
      await supabase.from('personal_information').upsert({
        report_id: reportId,
        bureau: 'TransUnion',
        full_name: data.personalInfo.full_name,
        date_of_birth: data.personalInfo.date_of_birth,
        ssn_last_four: data.personalInfo.ssn_partial
      });
    }

    // Store credit accounts
    if (data.accounts && data.accounts.length > 0) {
      const accountsWithReportId = data.accounts.map(account => ({
        report_id: reportId,
        bureau: 'TransUnion' as const,
        creditor_name: account.creditor_name,
        account_number: account.account_number,
        account_type: account.account_type,
        account_status: account.account_status,
        payment_status: account.payment_status,
        date_opened: account.date_opened,
        date_closed: account.date_closed,
        credit_limit: account.credit_limit,
        high_credit: account.high_credit,
        current_balance: account.current_balance,
        past_due_amount: account.past_due_amount,
        monthly_payment: account.monthly_payment
      }));
      
      await supabase.from('credit_accounts').upsert(accountsWithReportId);
    }

    // Store credit inquiries
    if (data.inquiries && data.inquiries.length > 0) {
      const inquiriesWithReportId = data.inquiries.map(inquiry => ({
        report_id: reportId,
        bureau: 'TransUnion' as const,
        inquirer_name: inquiry.inquirer_name,
        inquiry_date: inquiry.inquiry_date,
        inquiry_type: inquiry.inquiry_type,
        business_type: inquiry.purpose
      }));
      
      await supabase.from('credit_inquiries').upsert(inquiriesWithReportId);
    }

    // Store negative items
    if (data.negativeItems && data.negativeItems.length > 0) {
      const negativeItemsWithReportId = data.negativeItems.map(item => ({
        report_id: reportId,
        ...item
      }));
      
      await supabase.from('negative_items').upsert(negativeItemsWithReportId);
    }

    // Store credit scores (temporarily disabled until table exists in types)
    // if (data.scores && data.scores.length > 0) {
    //   const scoresWithReportId = data.scores.map(score => ({
    //     report_id: reportId,
    //     ...score,
    //     factors: score.factors ? JSON.stringify(score.factors) : null
    //   }));
    //   
    //   await supabase.from('credit_scores').upsert(scoresWithReportId);
    // }

    // Store public records
    if (data.publicRecords && data.publicRecords.length > 0) {
      const publicRecordsWithReportId = data.publicRecords.map(record => ({
        report_id: reportId,
        ...record
      }));
      
      await supabase.from('public_records').upsert(publicRecordsWithReportId);
    }

    console.log('✅ All parsed data stored successfully');
  }

  /**
   * Get processing status for a report
   */
  static async getProcessingStatus(reportId: string): Promise<{
    status: string;
    error?: string;
    hasData: boolean;
  }> {
    const { data: report, error } = await supabase
      .from('credit_reports')
      .select('extraction_status, processing_errors')
      .eq('id', reportId)
      .single();

    if (error) {
      throw new Error(`Failed to get processing status: ${error.message}`);
    }

    // Check if we have any parsed data
    const [personalInfo, accounts] = await Promise.all([
      supabase.from('personal_information').select('id').eq('report_id', reportId).maybeSingle(),
      supabase.from('credit_accounts').select('id').eq('report_id', reportId).limit(1)
    ]);

    const hasData = !!(personalInfo.data || (accounts.data && accounts.data.length > 0));

    return {
      status: report.extraction_status || 'pending',
      error: report.processing_errors || undefined,
      hasData
    };
  }
}