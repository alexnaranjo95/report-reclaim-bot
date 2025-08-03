import { supabase } from '@/integrations/supabase/client';
import { FallbackPDFParser } from './FallbackPDFParser';
import { ComprehensiveCreditParser } from './ComprehensiveCreditParser';

/**
 * Auto-processing service to ensure all credit reports have comprehensive data
 */
export class AutoCreditProcessor {
  /**
   * Process a specific report if it needs processing
   */
  static async processReport(reportId: string): Promise<boolean> {
    try {
      console.log('Checking report processing status:', reportId);

      const { data: report } = await supabase
        .from('credit_reports')
        .select('extraction_status, raw_text, file_path, file_name')
        .eq('id', reportId)
        .single();

      if (!report) {
        console.log('Report not found');
        return false;
      }

      console.log('Report status:', report.extraction_status, 'Has raw text:', !!report.raw_text);

      // Check if we need fallback processing
      if (await FallbackPDFParser.needsFallbackProcessing(reportId)) {
        console.log('Starting fallback PDF processing...');
        return await FallbackPDFParser.processPDFReport(reportId);
      }

      // If we have raw text but no comprehensive data, parse it
      if (report.raw_text) {
        const { data: personalInfo } = await supabase
          .from('personal_information')
          .select('id')
          .eq('report_id', reportId)
          .maybeSingle();

        if (!personalInfo) {
          console.log('Raw text available but no comprehensive data, triggering comprehensive parsing...');
          await ComprehensiveCreditParser.parseReport(reportId);
          return true;
        }
      }

      console.log('Report already processed or processing not needed');
      return true;

    } catch (error) {
      console.error('Error in auto-processing report:', error);
      return false;
    }
  }

  /**
   * Process all pending reports for a user
   */
  static async processUserReports(userId?: string): Promise<void> {
    try {
      let query = supabase
        .from('credit_reports')
        .select('id, file_name, extraction_status')
        .in('extraction_status', ['pending', 'completed']);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: reports } = await query.limit(10);

      if (!reports?.length) {
        console.log('No reports found for processing');
        return;
      }

      console.log(`Processing ${reports.length} reports...`);

      for (const report of reports) {
        try {
          await this.processReport(report.id);
          // Small delay between reports
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Failed to process report ${report.id}:`, error);
        }
      }

      console.log('Batch processing completed');

    } catch (error) {
      console.error('Error in batch processing:', error);
    }
  }

  /**
   * Force comprehensive re-parsing of a report
   */
  static async forceReparse(reportId: string): Promise<boolean> {
    try {
      console.log('Force re-parsing report:', reportId);

      // Clear existing parsed data
      await Promise.all([
        supabase.from('personal_information').delete().eq('report_id', reportId),
        supabase.from('credit_accounts').delete().eq('report_id', reportId),
        supabase.from('credit_inquiries').delete().eq('report_id', reportId),
        supabase.from('negative_items').delete().eq('report_id', reportId)
      ]);

      // Re-run comprehensive parsing
      await ComprehensiveCreditParser.parseReport(reportId);
      
      console.log('Force re-parsing completed');
      return true;

    } catch (error) {
      console.error('Error in force re-parsing:', error);
      return false;
    }
  }

  /**
   * Get processing status for a report
   */
  static async getProcessingStatus(reportId: string): Promise<{
    hasRawText: boolean;
    hasPersonalInfo: boolean;
    hasAccounts: boolean;
    hasInquiries: boolean;
    accountCount: number;
    inquiryCount: number;
    extractionStatus: string;
  }> {
    try {
      const [reportResult, personalResult, accountsResult, inquiriesResult] = await Promise.all([
        supabase.from('credit_reports').select('raw_text, extraction_status').eq('id', reportId).single(),
        supabase.from('personal_information').select('id').eq('report_id', reportId).maybeSingle(),
        supabase.from('credit_accounts').select('id').eq('report_id', reportId),
        supabase.from('credit_inquiries').select('id').eq('report_id', reportId)
      ]);

      return {
        hasRawText: !!reportResult.data?.raw_text,
        hasPersonalInfo: !!personalResult.data,
        hasAccounts: (accountsResult.data?.length || 0) > 0,
        hasInquiries: (inquiriesResult.data?.length || 0) > 0,
        accountCount: accountsResult.data?.length || 0,
        inquiryCount: inquiriesResult.data?.length || 0,
        extractionStatus: reportResult.data?.extraction_status || 'unknown'
      };

    } catch (error) {
      console.error('Error getting processing status:', error);
      return {
        hasRawText: false,
        hasPersonalInfo: false,
        hasAccounts: false,
        hasInquiries: false,
        accountCount: 0,
        inquiryCount: 0,
        extractionStatus: 'error'
      };
    }
  }
}