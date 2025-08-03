import { supabase } from '@/integrations/supabase/client';
import { CreditReportParser } from './CreditReportParser';

export class PDFExtractionService {
  /**
   * Manually trigger text extraction for a credit report
   */
  static async extractText(reportId: string): Promise<void> {
    // First, get the report details
    const { data: report, error: reportError } = await supabase
      .from('credit_reports')
      .select('file_path, extraction_status')
      .eq('id', reportId)
      .single();

    if (reportError) {
      throw new Error(`Failed to get report details: ${reportError.message}`);
    }

    if (!report.file_path) {
      throw new Error('No file uploaded for this report');
    }

    // Update status to processing
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({ 
        extraction_status: 'processing',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      throw new Error(`Failed to update report status: ${updateError.message}`);
    }

    // Try Adobe PDF extraction first, then fallback to local processing
    try {
      const { error: extractError } = await supabase.functions.invoke('adobe-pdf-extract', {
        body: {
          reportId,
          filePath: report.file_path,
        },
      });

      if (extractError) {
        console.warn('Adobe extraction failed, using fallback processing:', extractError);
        // Use fallback PDF processing instead of failing
        const { FallbackPDFParser } = await import('./FallbackPDFParser');
        await FallbackPDFParser.processPDFReport(reportId);
        return;
      }
    } catch (adobeError) {
      console.warn('Adobe service unavailable, using fallback processing:', adobeError);
      // Use fallback PDF processing instead of failing
      const { FallbackPDFParser } = await import('./FallbackPDFParser');
      await FallbackPDFParser.processPDFReport(reportId);
      return;
    }

    // Auto-trigger parsing after successful extraction
    try {
      console.log('Auto-triggering report parsing...');
      await CreditReportParser.parseReport(reportId);
      console.log('Auto-parsing completed successfully');
    } catch (parseError) {
      console.warn('Auto-parsing failed, but extraction was successful:', parseError);
      // Don't throw here - extraction was successful, parsing can be done manually
    }
  }

  /**
   * Get extraction status for a report
   */
  static async getExtractionStatus(reportId: string): Promise<{
    status: string;
    error?: string;
    hasText: boolean;
  }> {
    const { data: report, error } = await supabase
      .from('credit_reports')
      .select('extraction_status, processing_errors, raw_text')
      .eq('id', reportId)
      .single();

    if (error) {
      throw new Error(`Failed to get extraction status: ${error.message}`);
    }

    return {
      status: report.extraction_status || 'pending',
      error: report.processing_errors || undefined,
      hasText: !!report.raw_text && report.raw_text.length > 0
    };
  }

  /**
   * Check if extraction is needed for a report
   */
  static async isExtractionNeeded(reportId: string): Promise<boolean> {
    const status = await this.getExtractionStatus(reportId);
    return !status.hasText && status.status !== 'processing';
  }

  /**
   * Get extracted text preview (first 500 characters)
   */
  static async getTextPreview(reportId: string): Promise<string | null> {
    const { data: report, error } = await supabase
      .from('credit_reports')
      .select('raw_text')
      .eq('id', reportId)
      .single();

    if (error || !report.raw_text) {
      return null;
    }

    return report.raw_text.substring(0, 500) + (report.raw_text.length > 500 ? '...' : '');
  }

  /**
   * Retry extraction for failed reports
   */
  static async retryExtraction(reportId: string): Promise<void> {
    // Reset the status and try again
    const { error: resetError } = await supabase
      .from('credit_reports')
      .update({ 
        extraction_status: 'pending',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (resetError) {
      throw new Error(`Failed to reset extraction status: ${resetError.message}`);
    }

    // Trigger extraction
    await this.extractText(reportId);
  }
}