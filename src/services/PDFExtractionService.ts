
import { supabase } from '@/integrations/supabase/client';
import { ComprehensiveCreditParser } from './ComprehensiveCreditParser';

export class PDFExtractionService {
  /**
   * Enhanced extraction method with parallel OCR and data consolidation
   */
  static async extractText(reportId: string): Promise<void> {
    console.log('🚀 Starting parallel PDF extraction for:', reportId);
    
    // Get report details
    const { data: report, error: reportError } = await supabase
      .from('credit_reports')
      .select('file_path, extraction_status, consolidation_status')
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
        consolidation_status: 'processing',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      throw new Error(`Failed to update report status: ${updateError.message}`);
    }

    try {
      console.log('🚀 Starting parallel PDF extraction with consolidation...');
      
      // Call the Docsumo extraction edge function
      let result = null;
      let extractError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`📤 Attempt ${attempt} to call docsumo-extract function...`);
        const response = await supabase.functions.invoke('docsumo-extract', {
          body: {
            reportId,
            filePath: report.file_path,
          },
        });
        extractError = response.error;
        result = response.data;
        if (!extractError && result?.success) {
          console.log(`✅ Extraction successful on attempt ${attempt}`);
          console.log(`📊 Results: Primary method: ${result.primaryMethod}, Confidence: ${result.consolidationConfidence}`);
          break;
        }
        console.log(`⚠️ Attempt ${attempt} failed:`, extractError?.message || result?.error);
        if (attempt < 3) {
          console.log(`⏳ Waiting 2 seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (extractError) {
        throw new Error(`Edge function error after 3 attempts: ${extractError.message}`);
      }

      if (!result?.success) {
        throw new Error(`Extraction failed: ${result?.error || 'Unknown error'} | Details: ${result?.details || 'No details'}`);
      }

      console.log(`✅ Parallel extraction completed using primary method: ${result.primaryMethod}`);
      console.log(`📊 Consolidation stats: ${result.textLength} characters, confidence: ${result.consolidationConfidence}`);
      
      // CRITICAL: Validate consolidated text before parsing
      const isValidText = await this.validateExtractedText(reportId);
      if (!isValidText) {
        console.log('❌ Consolidated text validation failed');
        
        // Check if we have alternative extraction results to try
        const extractionResults = await this.getAlternativeExtractionResults(reportId);
        if (extractionResults.length > 1) {
          console.log('🔄 Trying alternative consolidation strategy...');
          const { DataConsolidationService } = await import('./DataConsolidationService');
          const reconsolidated = await DataConsolidationService.reconsolidate(reportId, 'majority_vote');
          
          // Re-validate with new consolidation
          const revalidated = await this.validateExtractedText(reportId);
          if (!revalidated) {
            throw new Error('All consolidation strategies failed validation. This may be an image-based PDF requiring OCR.');
          }
        } else {
          throw new Error('Text validation failed and no alternative extraction results available.');
        }
      }
      
      console.log('✅ Consolidated text validation passed, starting parsing...');
      
      // STEP 2: Parse using the consolidated text
      try {
        console.log('🔍 Starting comprehensive credit report parsing with consolidated data...');
        const parseResult = await ComprehensiveCreditParser.parseReport(
          reportId, 
          result.extractedText || ''
        );
        
        if (parseResult.success) {
          console.log('✅ Comprehensive parsing completed successfully');
        } else {
          console.log('⚠️ Comprehensive parsing had issues:', parseResult.error);
          
          // Fallback to original enhanced parser
          try {
            const { EnhancedCreditParser } = await import('./EnhancedCreditParser');
            await EnhancedCreditParser.parseWithFuzzyMatching(reportId);
            console.log('✅ Fallback parsing completed');
          } catch (fallbackError) {
            console.error('❌ Fallback parsing also failed:', fallbackError);
          }
        }
        
        // VALIDATION: Ensure we actually parsed data
        const extractedData = await this.validateParsedData(reportId);
        if (!extractedData.hasValidData) {
          console.log('⚠️ Warning: Limited data was parsed from consolidated text', extractedData);
          
          // Try parsing alternative extraction results individually
          const alternativeResults = await this.tryAlternativeParsing(reportId);
          if (alternativeResults.hasValidData) {
            console.log('✅ Alternative parsing strategy succeeded');
          }
        } else {
          console.log('✅ Credit data parsing completed with validation:', extractedData);
        }
        
      } catch (parseError) {
        console.error('❌ Credit data parsing failed:', parseError);
        
        // Mark as failed if parsing fails
        await supabase
          .from('credit_reports')
          .update({ 
            extraction_status: 'failed',
            consolidation_status: 'failed',
            processing_errors: `Parsing failed: ${parseError.message}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId);
          
        throw new Error(`Data parsing failed: ${parseError.message}`);
      }
      
    } catch (extractionError) {
      console.error('Parallel PDF extraction error:', extractionError);
      
      // Update status to failed
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          consolidation_status: 'failed',
          processing_errors: extractionError.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
        
      throw new Error(`Parallel PDF extraction failed: ${extractionError.message}`);
    }
  }

  /**
   * Get alternative extraction results for fallback processing
   */
  private static async getAlternativeExtractionResults(reportId: string) {
    const { data, error } = await supabase
      .from('extraction_results')
      .select('*')
      .eq('report_id', reportId)
      .order('confidence_score', { ascending: false });

    if (error) {
      console.error('Failed to get extraction results:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Try parsing with alternative extraction results
   */
  private static async tryAlternativeParsing(reportId: string) {
    const results = await this.getAlternativeExtractionResults(reportId);
    
    for (const result of results) {
      if (result.extracted_text && result.extracted_text.length > 500) {
        try {
          console.log(`🔄 Trying parsing with ${result.extraction_method}...`);
          
          const parseResult = await ComprehensiveCreditParser.parseReport(
            reportId, 
            result.extracted_text
          );
          
          if (parseResult.success) {
            const validationResult = await this.validateParsedData(reportId);
            if (validationResult.hasValidData) {
              console.log(`✅ Alternative parsing successful with ${result.extraction_method}`);
              
              // Update the primary extraction method
              await supabase
                .from('credit_reports')
                .update({
                  raw_text: result.extracted_text,
                  primary_extraction_method: result.extraction_method
                })
                .eq('id', reportId);
              
              return validationResult;
            }
          }
        } catch (parseError) {
          console.log(`❌ Alternative parsing with ${result.extraction_method} failed:`, parseError);
        }
      }
    }
    
    return {
      hasValidData: false,
      personalInfo: false,
      accounts: 0,
      inquiries: 0,
      negativeItems: 0
    };
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
