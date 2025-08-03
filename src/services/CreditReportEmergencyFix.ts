import { supabase } from '@/integrations/supabase/client';
import { FallbackPDFParser } from './FallbackPDFParser';
import { ComprehensiveCreditParser } from './ComprehensiveCreditParser';

/**
 * Emergency service to fix stuck credit report processing
 */
export class CreditReportEmergencyFix {
  /**
   * Fix stuck processing status and force extraction
   */
  static async fixStuckProcessing(reportId: string): Promise<void> {
    console.log('Emergency fix for stuck processing:', reportId);

    try {
      // Get the stuck report
      const { data: report } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (!report) {
        throw new Error('Report not found');
      }

      console.log('Report status:', report.extraction_status, 'Has file:', !!report.file_path);

      // If stuck in processing, reset and try fallback
      if (report.extraction_status === 'processing' && report.file_path) {
        console.log('Resetting stuck processing status and using fallback extraction...');
        
        // Reset status
        await supabase
          .from('credit_reports')
          .update({ 
            extraction_status: 'pending',
            processing_errors: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId);

        // Force fallback processing
        await FallbackPDFParser.processPDFReport(reportId);
        
        // Wait a moment then trigger comprehensive parsing
        setTimeout(async () => {
          try {
            await ComprehensiveCreditParser.parseReport(reportId);
            console.log('Emergency comprehensive parsing completed');
          } catch (error) {
            console.error('Emergency comprehensive parsing failed:', error);
          }
        }, 2000);
      }

    } catch (error) {
      console.error('Emergency fix failed:', error);
      throw error;
    }
  }

  /**
   * Force complete reprocessing of a report
   */
  static async forceReprocess(reportId: string): Promise<void> {
    console.log('Force reprocessing report:', reportId);

    try {
      // Clear all existing data
      await Promise.all([
        supabase.from('personal_information').delete().eq('report_id', reportId),
        supabase.from('credit_accounts').delete().eq('report_id', reportId),
        supabase.from('credit_inquiries').delete().eq('report_id', reportId),
        supabase.from('negative_items').delete().eq('report_id', reportId)
      ]);

      // Reset report status
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'pending',
          raw_text: null,
          processing_errors: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      // Start fresh processing
      await this.fixStuckProcessing(reportId);

    } catch (error) {
      console.error('Force reprocess failed:', error);
      throw error;
    }
  }
}