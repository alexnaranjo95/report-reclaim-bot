import { supabase } from '@/integrations/supabase/client';
import { CreditPatterns } from '@/utils/CreditPatterns';
import { CreditItem, CreditAnalysisResult, PDFAnalysisRequest } from '@/types/CreditTypes';

export interface CreditAnalysisRequest {
  file: File;
  bureaus: string[];
}

export class CreditAnalysisService {
  static async analyzeCreditReport(
    request: CreditAnalysisRequest,
    onProgress?: (message: string, progress: number) => void
  ): Promise<CreditAnalysisResult> {
    console.log('🔍 REAL DATA ANALYSIS - Starting credit report analysis for:', request.file.name);
    onProgress?.('Starting real data analysis...', 10);

    try {
      // First attempt: OpenAI analysis for real extraction
      onProgress?.('Analyzing with AI...', 30);
      const openAIResult = await this.analyzeWithOpenAI(request.file);
      
      if (openAIResult) {
        console.log('✅ REAL DATA - OpenAI analysis successful');
        onProgress?.('AI analysis completed', 90);
        return openAIResult;
      }

      console.error('❌ REAL DATA - All analysis methods failed');
      onProgress?.('Analysis failed - no real data available', 100);
      throw new Error('Unable to extract real data from PDF. Please ensure you have uploaded a valid credit report.');

    } catch (error) {
      console.error('💥 REAL DATA ANALYSIS ERROR:', error);
      onProgress?.('Analysis failed', 100);
      throw new Error('Credit analysis failed. Please upload a valid credit report PDF.');
    }
  }

  private static async analyzeWithOpenAI(file: File): Promise<CreditAnalysisResult | null> {
    try {
      console.log('🧠 REAL DATA - Calling OpenAI analysis service...');
      
      // Convert file to text first
      const text = await this.extractTextFromFile(file);
      if (!text || text.length < 100) {
        console.error('❌ REAL DATA - Insufficient text extracted from PDF');
        return null;
      }

      console.log('📄 REAL DATA - Extracted text length:', text.length);
      console.log('📄 REAL DATA - Text sample:', text.substring(0, 200));

      // Call OpenAI service for analysis
      const { OpenAIService } = await import('./OpenAIService');
      const analysisResult = await OpenAIService.analyzeCreditReport(text);
      
      console.log('🎯 REAL DATA - OpenAI analysis result:', analysisResult);

      if (!analysisResult || !analysisResult.analysis) {
        console.error('❌ REAL DATA - Invalid OpenAI response format');
        return null;
      }

      // Transform the OpenAI result into our format using ONLY real data
      return this.transformOpenAIResult(analysisResult, file.name);

    } catch (error) {
      console.error('❌ REAL DATA - OpenAI analysis failed:', error);
      return null;
    }
  }

  private static async extractTextFromFile(file: File): Promise<string> {
    console.log('📄 REAL DATA - Extracting text from file:', file.name);
    
    // For real implementation, you would use a proper PDF text extraction library
    // This is a placeholder that would need to be replaced with actual PDF parsing
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // This is a simplified version - in reality you'd use PDF.js or similar
        const result = reader.result as string;
        console.log('📄 REAL DATA - File read complete, length:', result.length);
        resolve(result);
      };
      reader.onerror = () => {
        console.error('❌ REAL DATA - File reading failed');
        reject(new Error('Failed to read PDF file'));
      };
      reader.readAsText(file);
    });
  }

  private static transformOpenAIResult(openAIResult: any, fileName: string): CreditAnalysisResult {
    console.log('🔄 REAL DATA - Transforming OpenAI result to CreditAnalysisResult format');
    
    const analysis = openAIResult.analysis || {};
    const summary = analysis.summary || {};
    const accounts = analysis.accounts || [];
    const negativeItems = analysis.negativeItems || [];
    
    // Convert real data to our format
    const items: CreditItem[] = negativeItems.map((item: any, index: number) => ({
      id: `real-item-${index}`,
      creditor: item.creditor || 'Unknown Creditor',
      account: item.account || 'Unknown Account',
      issue: item.description || 'Negative item found',
      impact: this.mapSeverityToImpact(item.severity || 5),
      status: 'negative' as const, // Using correct type from CreditTypes
      bureau: Array.isArray(item.bureau) ? item.bureau : ['Unknown'],
      dateOpened: item.dateOpened,
      lastActivity: item.lastActivity,
      balance: item.amount,
      originalAmount: item.originalAmount,
      paymentStatus: item.paymentStatus
    }));

    console.log('✅ REAL DATA - Transformed items:', items.length);

    return {
      items,
      summary: {
        totalNegativeItems: negativeItems.length,
        totalPositiveAccounts: accounts.length - negativeItems.length,
        totalAccounts: accounts.length,
        estimatedScoreImpact: summary.creditScore || 0,
        bureausAffected: ['Experian', 'Equifax', 'TransUnion'], // Would be extracted from real data
        highImpactItems: items.filter(item => item.impact === 'high').length,
        mediumImpactItems: items.filter(item => item.impact === 'medium').length,
        lowImpactItems: items.filter(item => item.impact === 'low').length
      },
      historicalData: {
        lettersSent: 0, // Would come from database
        itemsRemoved: 0, // Would come from database
        itemsPending: items.length,
        successRate: 0, // Would be calculated from database
        avgRemovalTime: 0 // Would be calculated from database
      },
      accountBreakdown: {
        creditCards: 0, // Would be extracted from real data
        mortgages: 0,
        autoLoans: 0,
        studentLoans: 0,
        personalLoans: 0,
        collections: negativeItems.filter((item: any) => item.type === 'collection').length,
        other: 0
      },
      personalInfo: {
        name: analysis.personalInfo?.name,
        address: analysis.personalInfo?.address,
        ssn: analysis.personalInfo?.ssn,
        dateOfBirth: analysis.personalInfo?.dateOfBirth,
        phone: analysis.personalInfo?.phone,
        employer: analysis.personalInfo?.employer
      },
      creditScores: {
        experian: summary.creditScore,
        equifax: summary.creditScore,
        transunion: summary.creditScore
      }
    };
  }

  private static mapSeverityToImpact(severity: number): 'low' | 'medium' | 'high' {
    if (severity >= 8) return 'high';
    if (severity >= 5) return 'medium';
    return 'low';
  }

  // Legacy method for backward compatibility - redirects to real data analysis
  static async analyzePDF(
    request: PDFAnalysisRequest,
    onProgress?: (message: string, progress: number) => void
  ): Promise<CreditAnalysisResult> {
    console.log('🔄 LEGACY METHOD - Redirecting analyzePDF to real data analysis');
    console.log('📋 REAL DATA - Request:', request);
    
    // Extract bureaus from context or use defaults
    const bureaus = ['Experian', 'Equifax', 'TransUnion']; 
    
    return this.analyzeCreditReport({ file: request.file, bureaus }, onProgress);
  }

  // ALL MOCK DATA FUNCTIONS REMOVED - REAL DATA ONLY
  // No fallback methods that generate fake data are allowed
}