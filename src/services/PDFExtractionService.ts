
import { supabase } from '@/integrations/supabase/client';
import { ComprehensiveCreditParser } from './ComprehensiveCreditParser';

export class PDFExtractionService {
  /**
   * Single extraction method using Amazon Textract
   */
  static async extractText(reportId: string): Promise<void> {
    // Get report details
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

    // Single extraction method with robust error handling
    try {
      console.log('🚀 Starting PDF extraction with Textract...');
      
      const { data: result, error: extractError } = await supabase.functions.invoke('textract-extract', {
        body: {
          reportId,
          filePath: report.file_path,
        },
      });

      if (extractError) {
        throw new Error(`Extraction failed: ${extractError.message}`);
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Extraction failed without specific error');
      }

      console.log('✅ PDF extraction completed successfully');
      console.log(`📊 Extracted text length: ${result.textLength || 0} characters`);
      
      // Step 2: Parse the extracted text into structured credit data
      console.log('🔍 Starting comprehensive credit data parsing...');
      
      try {
        // First try the enhanced parser with better error handling
        const { EnhancedCreditParser } = await import('./EnhancedCreditParser');
        const success = await EnhancedCreditParser.parseWithFuzzyMatching(reportId);
        
        if (success) {
          console.log('✅ Enhanced credit data parsing completed successfully');
        } else {
          // Fallback to comprehensive parser
          await ComprehensiveCreditParser.parseReport(reportId);
          console.log('✅ Fallback credit data parsing completed successfully');
        }
      } catch (parseError) {
        console.error('❌ Credit data parsing failed:', parseError);
        
        // Try to call cleanup for stuck processing reports
        try {
          await supabase.rpc('cleanup_stuck_processing_reports');
        } catch (cleanupError) {
          console.error('Failed to call cleanup function:', cleanupError);
        }
        
        // Don't throw here - we have the raw text, just log the parsing issue
        console.log('Raw text extracted but parsing failed - this will be handled by validation');
      }
      
    } catch (extractionError) {
      console.error('PDF extraction error:', extractionError);
      
      // Update status to failed
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          processing_errors: extractionError.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
        
      throw new Error(`PDF extraction failed: ${extractionError.message}`);
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
