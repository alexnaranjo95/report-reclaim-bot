import { supabase } from '@/integrations/supabase/client';

export interface ExtractionDebugInfo {
  reportId: string;
  filePath: string;
  fileSize: number;
  extractionStatus: string;
  processingErrors?: string;
  rawTextLength: number;
  rawTextPreview: string;
  hasCreditKeywords: boolean;
  extractionMethod: string;
  timestamp: string;
}

export class PDFDebugService {
  /**
   * Get comprehensive debug information for a PDF extraction
   */
  static async getExtractionDebugInfo(reportId: string): Promise<ExtractionDebugInfo> {
    try {
      // Get report details
      const { data: report, error: reportError } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (reportError || !report) {
        throw new Error(`Report not found: ${reportError?.message || 'Unknown error'}`);
      }

      // Get file size from storage
      let fileSize = 0;
      try {
        if (report.file_path) {
          const { data: fileData } = await supabase.storage
            .from('credit-reports')
            .download(report.file_path);
          
          if (fileData) {
            fileSize = fileData.size;
          }
        }
      } catch (error) {
        console.warn('Could not get file size:', error);
      }

      // Analyze raw text
      const rawText = report.raw_text || '';
      const hasCreditKeywords = this.hasCreditKeywords(rawText);
      const extractionMethod = this.determineExtractionMethod(report);

      return {
        reportId,
        filePath: report.file_path || 'N/A',
        fileSize,
        extractionStatus: report.extraction_status || 'unknown',
        processingErrors: report.processing_errors || undefined,
        rawTextLength: rawText.length,
        rawTextPreview: rawText.substring(0, 500),
        hasCreditKeywords,
        extractionMethod,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting debug info:', error);
      throw error;
    }
  }

  /**
   * Test different extraction methods on a report
   */
  static async testExtractionMethods(reportId: string): Promise<{
    textract: { success: boolean; textLength: number; error?: string };
    enhanced: { success: boolean; textLength: number; error?: string };
    process: { success: boolean; textLength: number; error?: string };
  }> {
    const results = {
      textract: { success: false, textLength: 0, error: undefined as string | undefined },
      enhanced: { success: false, textLength: 0, error: undefined as string | undefined },
      process: { success: false, textLength: 0, error: undefined as string | undefined }
    };

    // Get report file path
    const { data: report } = await supabase
      .from('credit_reports')
      .select('file_path')
      .eq('id', reportId)
      .single();

    if (!report?.file_path) {
      throw new Error('Report file path not found');
    }

    // Test Textract extraction
    try {
      console.log('Testing Textract extraction...');
      const { data, error } = await supabase.functions.invoke('textract-extract', {
        body: { reportId, filePath: report.file_path }
      });

      if (error) {
        results.textract.error = error.message;
      } else if (data?.success) {
        results.textract.success = true;
        results.textract.textLength = data.textLength || 0;
      } else {
        results.textract.error = data?.error || 'Unknown error';
      }
    } catch (error) {
      results.textract.error = error.message;
    }

    // Test Enhanced extraction
    try {
      console.log('Testing Enhanced extraction...');
      const { data, error } = await supabase.functions.invoke('enhanced-pdf-extract', {
        body: { reportId, filePath: report.file_path }
      });

      if (error) {
        results.enhanced.error = error.message;
      } else if (data?.success) {
        results.enhanced.success = true;
        results.enhanced.textLength = data.textLength || 0;
      } else {
        results.enhanced.error = data?.error || 'Unknown error';
      }
    } catch (error) {
      results.enhanced.error = error.message;
    }

    // Test Process extraction
    try {
      console.log('Testing Process extraction...');
      const { data, error } = await supabase.functions.invoke('process-credit-report', {
        body: { reportId, filePath: report.file_path }
      });

      if (error) {
        results.process.error = error.message;
      } else if (data?.success) {
        results.process.success = true;
        results.process.textLength = data.textLength || 0;
      } else {
        results.process.error = data?.error || 'Unknown error';
      }
    } catch (error) {
      results.process.error = error.message;
    }

    return results;
  }

  /**
   * Analyze extracted text quality
   */
  static analyzeTextQuality(text: string): {
    score: number;
    issues: string[];
    suggestions: string[];
    creditKeywords: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Check text length
    if (text.length < 100) {
      issues.push('Text too short (less than 100 characters)');
      score -= 30;
    } else if (text.length < 500) {
      issues.push('Text relatively short (less than 500 characters)');
      score -= 10;
    }

    // Check for credit keywords
    const creditKeywords = this.findCreditKeywords(text);
    if (creditKeywords.length === 0) {
      issues.push('No credit report keywords found');
      score -= 40;
      suggestions.push('This may not be a credit report PDF');
    } else if (creditKeywords.length < 3) {
      issues.push('Very few credit report keywords found');
      score -= 20;
    }

    // Check for readable text patterns
    const readableWords = text.match(/\b[A-Za-z]{3,}\b/g) || [];
    if (readableWords.length < 10) {
      issues.push('Very few readable words found');
      score -= 25;
    }

    // Check for gibberish patterns
    const gibberishPatterns = [
      /[A-Za-z]{1,2}[A-Za-z0-9]{1,2}[A-Za-z]{1,2}/g, // Short random sequences
      /[^\w\s]{3,}/g, // Too many special characters
      /[A-Z]{5,}/g, // All caps sequences
    ];

    let gibberishCount = 0;
    for (const pattern of gibberishPatterns) {
      const matches = text.match(pattern) || [];
      gibberishCount += matches.length;
    }

    if (gibberishCount > readableWords.length * 0.5) {
      issues.push('High amount of gibberish detected');
      score -= 35;
      suggestions.push('Consider using a different extraction method');
    }

    // Check for specific credit report elements
    const hasName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(text);
    const hasAddress = /\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road)/.test(text);
    const hasAccount = /(?:Account|Credit|Balance|Payment)/i.test(text);
    const hasDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text);

    if (!hasName && !hasAddress && !hasAccount) {
      issues.push('Missing common credit report elements (name, address, accounts)');
      score -= 15;
    }

    // Generate suggestions
    if (score < 50) {
      suggestions.push('Consider re-uploading the PDF or using a different file');
    }
    if (score < 70) {
      suggestions.push('Try the enhanced extraction method');
    }

    return {
      score: Math.max(0, score),
      issues,
      suggestions,
      creditKeywords
    };
  }

  /**
   * Get extraction health summary
   */
  static async getExtractionHealth(): Promise<{
    totalReports: number;
    successfulExtractions: number;
    failedExtractions: number;
    pendingExtractions: number;
    averageTextLength: number;
    commonErrors: string[];
  }> {
    try {
      // Get all reports
      const { data: reports, error } = await supabase
        .from('credit_reports')
        .select('extraction_status, raw_text, processing_errors')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      const totalReports = reports.length;
      const successfulExtractions = reports.filter(r => r.extraction_status === 'completed').length;
      const failedExtractions = reports.filter(r => r.extraction_status === 'failed').length;
      const pendingExtractions = reports.filter(r => r.extraction_status === 'pending' || r.extraction_status === 'processing').length;

      // Calculate average text length
      const completedReports = reports.filter(r => r.extraction_status === 'completed' && r.raw_text);
      const totalTextLength = completedReports.reduce((sum, r) => sum + (r.raw_text?.length || 0), 0);
      const averageTextLength = completedReports.length > 0 ? Math.round(totalTextLength / completedReports.length) : 0;

      // Get common errors
      const errors = reports
        .filter(r => r.processing_errors)
        .map(r => r.processing_errors)
        .filter(Boolean) as string[];

      const errorCounts: Record<string, number> = {};
      errors.forEach(error => {
        const key = error.substring(0, 50); // Truncate long errors
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      });

      const commonErrors = Object.entries(errorCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([error]) => error);

      return {
        totalReports,
        successfulExtractions,
        failedExtractions,
        pendingExtractions,
        averageTextLength,
        commonErrors
      };
    } catch (error) {
      console.error('Error getting extraction health:', error);
      throw error;
    }
  }

  // Helper methods
  private static hasCreditKeywords(text: string): boolean {
    const keywords = [
      'credit', 'account', 'balance', 'payment', 'inquiry', 'collection',
      'name', 'address', 'phone', 'date', 'birth', 'social', 'security',
      'experian', 'equifax', 'transunion', 'fico', 'score', 'visa', 'mastercard',
      'chase', 'capital', 'wells', 'bank', 'mortgage', 'loan'
    ];
    
    return keywords.some(keyword => text.toLowerCase().includes(keyword));
  }

  private static findCreditKeywords(text: string): string[] {
    const keywords = [
      'credit', 'account', 'balance', 'payment', 'inquiry', 'collection',
      'name', 'address', 'phone', 'date', 'birth', 'social', 'security',
      'experian', 'equifax', 'transunion', 'fico', 'score', 'visa', 'mastercard',
      'chase', 'capital', 'wells', 'bank', 'mortgage', 'loan'
    ];
    
    return keywords.filter(keyword => text.toLowerCase().includes(keyword));
  }

  private static determineExtractionMethod(report: any): string {
    if (report.processing_errors?.includes('Textract')) {
      return 'textract-failed';
    }
    if (report.raw_text && report.raw_text.length > 0) {
      return 'extracted';
    }
    return 'unknown';
  }
}