import { supabase } from '@/integrations/supabase/client';
import { UnifiedCreditParser } from './UnifiedCreditParser';
import { Logger } from '@/utils/logger';

/**
 * Simplified PDF Extraction Service
 * Removes complex retry logic and fallback chains
 */
export class SimplifiedPDFExtraction {
  /**
   * Extract and parse PDF in one streamlined flow
   */
  static async processReport(reportId: string): Promise<{ success: boolean; error?: string }> {
    try {
      Logger.info(`Starting PDF extraction for report: ${reportId}`);
      
      // Get report details
      const { data: report, error } = await supabase
        .from('credit_reports')
        .select('file_path, bureau_name')
        .eq('id', reportId)
        .single();
      
      if (error || !report?.file_path) {
        throw new Error('Report not found or no file uploaded');
      }
      
      // Update status
      await this.updateStatus(reportId, 'processing');
      
      // Extract text from PDF
      const extractedText = await this.extractText(reportId, report.file_path);
      
      if (!extractedText) {
        throw new Error('Failed to extract text from PDF');
      }
      
      // Save raw text
      await supabase
        .from('credit_reports')
        .update({ 
          raw_text: extractedText,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
      
      // Parse using unified parser
      const parseResult = await UnifiedCreditParser.parse(reportId, extractedText);
      
      if (!parseResult.success) {
        throw new Error(parseResult.error || 'Failed to parse credit report');
      }
      
      Logger.success(`Successfully processed report: ${reportId}`);
      return { success: true };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Failed to process report ${reportId}:`, errorMessage);
      
      await this.updateStatus(reportId, 'failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }
  
  /**
   * Extract text from PDF using edge function
   */
  private static async extractText(reportId: string, filePath: string): Promise<string | null> {
    try {
      Logger.debug('Calling extraction edge function');
      
      const { data, error } = await supabase.functions.invoke('docsumo-extract', {
        body: {
          reportId,
          filePath,
        },
      });
      
      if (error) {
        throw error;
      }
      
      if (!data?.success || !data?.extractedText) {
        throw new Error('No text extracted from PDF');
      }
      
      Logger.info(`Extracted ${data.textLength || 0} characters from PDF`);
      return data.extractedText;
      
    } catch (error) {
      Logger.error('Text extraction failed:', error);
      return null;
    }
  }
  
  /**
   * Update report status
   */
  private static async updateStatus(
    reportId: string, 
    status: string, 
    error?: string
  ): Promise<void> {
    await supabase
      .from('credit_reports')
      .update({ 
        extraction_status: status,
        processing_errors: error || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);
  }
  
  /**
   * Validate that we have minimum required data
   */
  static async validateParsedData(reportId: string): Promise<boolean> {
    const { data } = await supabase
      .from('credit_accounts')
      .select('id')
      .eq('report_id', reportId)
      .limit(1);
    
    return data && data.length > 0;
  }
}