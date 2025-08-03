import { supabase } from '@/integrations/supabase/client';

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

    // Call the Adobe PDF extraction function
    const { error: extractError } = await supabase.functions.invoke('adobe-pdf-extract', {
      body: {
        reportId,
        filePath: report.file_path,
      },
    });

    if (extractError) {
      // Update status to failed
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          processing_errors: extractError.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
      
      throw new Error(`Text extraction failed: ${extractError.message}`);
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