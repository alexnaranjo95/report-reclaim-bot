
import { supabase } from '@/integrations/supabase/client';
import { ComprehensiveCreditParser } from './ComprehensiveCreditParser';

export class PDFExtractionService {
  /**
   * STRICT extraction method - only real data extraction allowed
   */
  static async extractText(reportId: string): Promise<void> {
    console.log('🚀 Starting STRICT PDF extraction for:', reportId);
    
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

    try {
      console.log('🚀 Starting strict PDF extraction with Textract...');
      
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

      console.log('✅ PDF extraction completed, validating content...');
      
      // CRITICAL: Validate extracted text before parsing
      const isValidText = await this.validateExtractedText(reportId);
      if (!isValidText) {
        throw new Error('PDF contains no readable credit report text. Please upload a text-based credit report PDF from Experian, Equifax, or TransUnion.');
      }
      
      console.log('✅ Text validation passed, starting parsing...');
      
      // STEP 2: Parse ONLY if we have valid text
      try {
        const { EnhancedCreditParser } = await import('./EnhancedCreditParser');
        const success = await EnhancedCreditParser.parseWithFuzzyMatching(reportId);
        
        if (!success) {
          throw new Error('Enhanced parser failed to extract any valid data');
        }
        
        // VALIDATION: Ensure we actually parsed data
        const extractedData = await this.validateParsedData(reportId);
        if (!extractedData.hasValidData) {
          throw new Error('No valid credit data was parsed from the text');
        }
        
        console.log('✅ Credit data parsing completed with validation:', extractedData);
        
      } catch (parseError) {
        console.error('❌ Credit data parsing failed:', parseError);
        
        // Mark as failed if parsing fails
        await supabase
          .from('credit_reports')
          .update({ 
            extraction_status: 'failed',
            processing_errors: `Parsing failed: ${parseError.message}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId);
          
        throw new Error(`Data parsing failed: ${parseError.message}`);
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
   * Validate that extracted text contains real credit report data
   */
  static async validateExtractedText(reportId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('validate_extracted_text', { report_id: reportId });
      if (error) {
        console.error('Validation error:', error);
        return false;
      }
      return data || false;
    } catch (error) {
      console.error('Failed to validate text:', error);
      return false;
    }
  }

  /**
   * Validate that we actually parsed meaningful data
   */
  static async validateParsedData(reportId: string): Promise<{
    hasValidData: boolean;
    personalInfo: boolean;
    accounts: number;
    inquiries: number;
    negativeItems: number;
  }> {
    try {
      const [personalResponse, accountsResponse, inquiriesResponse, negativeResponse] = await Promise.all([
        supabase.from('personal_information').select('*').eq('report_id', reportId).maybeSingle(),
        supabase.from('credit_accounts').select('*').eq('report_id', reportId),
        supabase.from('credit_inquiries').select('*').eq('report_id', reportId),
        supabase.from('negative_items').select('*').eq('report_id', reportId)
      ]);

      const personalInfo = !!personalResponse.data?.full_name;
      const accounts = accountsResponse.data?.length || 0;
      const inquiries = inquiriesResponse.data?.length || 0;
      const negativeItems = negativeResponse.data?.length || 0;

      // Require at least personal info OR accounts to consider valid
      const hasValidData = personalInfo || accounts > 0;

      return {
        hasValidData,
        personalInfo,
        accounts,
        inquiries,
        negativeItems
      };
    } catch (error) {
      console.error('Error validating parsed data:', error);
      return {
        hasValidData: false,
        personalInfo: false,
        accounts: 0,
        inquiries: 0,
        negativeItems: 0
      };
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
