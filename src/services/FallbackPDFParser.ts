import { PDFProcessor } from './PDFProcessor';
import { ComprehensiveCreditParser } from './ComprehensiveCreditParser';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fallback PDF parsing service when Adobe extraction is not available
 * Uses pdfjs-dist to extract text and then applies comprehensive parsing
 */
export class FallbackPDFParser {
  /**
   * Parse PDF file when it hasn't been processed by Adobe
   */
  static async processPDFReport(reportId: string): Promise<boolean> {
    try {
      console.log('Starting fallback PDF processing for:', reportId);

      // Get the report with file path
      const { data: report, error } = await supabase
        .from('credit_reports')
        .select('file_path, file_name, raw_text')
        .eq('id', reportId)
        .single();

      if (error || !report.file_path) {
        throw new Error('No file path found for report');
      }

      // If we already have raw text, skip file processing
      if (report.raw_text) {
        console.log('Raw text already exists, triggering comprehensive parsing...');
        await ComprehensiveCreditParser.parseReport(reportId);
        return true;
      }

      // Update status to processing
      await supabase
        .from('credit_reports')
        .update({ extraction_status: 'processing' })
        .eq('id', reportId);

      // Download the PDF file
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('credit-reports')
        .download(report.file_path);

      if (downloadError) throw downloadError;

      // Convert to File object for PDFProcessor
      const file = new File([fileData], report.file_name || 'report.pdf', { 
        type: 'application/pdf' 
      });

      // Extract text using PDFProcessor
      console.log('Extracting text using PDFProcessor...');
      const extractedText = await PDFProcessor.extractTextFromPDF(file);

      if (!extractedText || extractedText.length < 100) {
        throw new Error('Insufficient text extracted from PDF');
      }

      // Store the extracted text
      await supabase
        .from('credit_reports')
        .update({ 
          raw_text: extractedText,
          extraction_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      console.log('Text extraction completed, triggering comprehensive parsing...');
      
      // Now run comprehensive parsing on the extracted text
      await ComprehensiveCreditParser.parseReport(reportId);

      console.log('Fallback PDF processing completed successfully');
      return true;

    } catch (error) {
      console.error('Fallback PDF processing error:', error);
      
      // Update status to failed
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          processing_errors: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      return false;
    }
  }

  /**
   * Check if a report needs fallback processing
   */
  static async needsFallbackProcessing(reportId: string): Promise<boolean> {
    const { data: report } = await supabase
      .from('credit_reports')
      .select('extraction_status, raw_text, file_path')
      .eq('id', reportId)
      .single();

    // Needs fallback if:
    // 1. Status is pending and we have a file path
    // 2. Status is failed and we have a file path
    // 3. Has raw text but no parsed data in personal_information table
    if (!report) return false;

    if ((report.extraction_status === 'pending' || report.extraction_status === 'failed') && report.file_path) {
      return true;
    }

    if (report.raw_text) {
      // Check if we have parsed data
      const { data: personalInfo } = await supabase
        .from('personal_information')
        .select('id')
        .eq('report_id', reportId)
        .maybeSingle();

      return !personalInfo; // Needs parsing if no personal info exists
    }

    return false;
  }

  /**
   * Auto-trigger fallback processing for reports that need it
   */
  static async autoProcessPendingReports(): Promise<void> {
    try {
      // Find reports that need processing
      const { data: pendingReports } = await supabase
        .from('credit_reports')
        .select('id, file_name')
        .in('extraction_status', ['pending', 'failed'])
        .not('file_path', 'is', null)
        .limit(5); // Process max 5 at a time

      if (!pendingReports?.length) {
        console.log('No pending reports found for fallback processing');
        return;
      }

      console.log(`Found ${pendingReports.length} reports for fallback processing`);

      // Process each report
      for (const report of pendingReports) {
        try {
          console.log(`Processing report: ${report.file_name}`);
          await this.processPDFReport(report.id);
          
          // Add delay between reports to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`Failed to process report ${report.id}:`, error);
          // Continue with next report
        }
      }

      console.log('Fallback processing batch completed');

    } catch (error) {
      console.error('Error in auto-processing:', error);
    }
  }
}