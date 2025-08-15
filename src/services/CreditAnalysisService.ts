import { supabase } from '@/integrations/supabase/client';
import { SimplifiedPDFExtraction } from './SimplifiedPDFExtraction';
import { UnifiedCreditParser } from './UnifiedCreditParser';
import { Logger } from '@/utils/logger';
import { ErrorHandler } from '@/utils/errorHandler';
import { CreditAnalysisResult, CreditItem, PDFAnalysisRequest } from '@/types/CreditTypes';

export interface CreditAnalysisRequest {
  file: File;
  bureaus: string[];
}

/**
 * Simplified Credit Analysis Service
 * Uses unified parser and simplified extraction
 */
export class CreditAnalysisService {
  /**
   * Main analysis entry point
   */
  static async analyzeCreditReport(
    request: CreditAnalysisRequest,
    onProgress?: (message: string, progress: number) => void
  ): Promise<CreditAnalysisResult> {
    return ErrorHandler.wrapAsync(async () => {
      Logger.info(`Starting credit report analysis for: ${request.file.name}`);
      onProgress?.('Starting analysis...', 10);

      // Upload file and create report
      onProgress?.('Uploading file...', 20);
      const reportId = await this.uploadFile(request.file, request.bureaus[0]);
      
      // Process the report
      onProgress?.('Processing PDF...', 40);
      const result = await SimplifiedPDFExtraction.processReport(reportId);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to process credit report');
      }
      
      // Get parsed data
      onProgress?.('Extracting credit information...', 70);
      const analysisResult = await this.buildAnalysisResult(reportId);
      
      onProgress?.('Analysis completed', 100);
      Logger.success('Credit report analysis completed successfully');
      
      return analysisResult;
    }, 'CreditAnalysisService').then(result => {
      if (!result.success) {
        throw new Error(ErrorHandler.getUserMessage(result.error));
      }
      return result.data!;
    });
  }

  /**
   * Upload file to Supabase storage and create report record
   */
  private static async uploadFile(file: File, bureau: string): Promise<string> {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('User not authenticated');
    
    const timestamp = Date.now();
    const fileName = `${userId}/${timestamp}_${file.name}`;
    
    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('credit-reports')
      .upload(fileName, file);
    
    if (uploadError) {
      throw new Error(`File upload failed: ${uploadError.message}`);
    }
    
    // Create report record
    const { data: report, error: dbError } = await supabase
      .from('credit_reports')
      .insert({
        user_id: userId,
        bureau_name: bureau,
        file_name: file.name,
        file_path: fileName,
        report_date: new Date().toISOString().split('T')[0],
        extraction_status: 'pending'
      })
      .select('id')
      .single();
    
    if (dbError || !report) {
      throw new Error('Failed to create report record');
    }
    
    return report.id;
  }

  /**
   * Build analysis result from parsed data
   */
  private static async buildAnalysisResult(reportId: string): Promise<CreditAnalysisResult> {
    // Get accounts from database
    const { data: accounts } = await supabase
      .from('credit_accounts')
      .select('*')
      .eq('report_id', reportId);
    
    const { data: inquiries } = await supabase
      .from('credit_inquiries')
      .select('*')
      .eq('report_id', reportId);
    
    const { data: personalInfo } = await supabase
      .from('personal_information')
      .select('*')
      .eq('report_id', reportId)
      .single();
    
    // Build negative items
    const negativeItems: CreditItem[] = [];
    
    if (accounts) {
      accounts.forEach((account, index) => {
        if (this.isNegativeAccount(account)) {
          negativeItems.push({
            id: `item-${index}`,
            creditor: account.creditor_name || 'Unknown',
            account: account.account_number || 'Unknown',
            issue: this.determineIssue(account),
            impact: this.determineImpact(account),
            status: 'negative' as const,
            bureau: ['Unknown'],
            dateOpened: account.date_opened,
            lastActivity: account.last_payment_date,
            balance: account.current_balance,
            originalAmount: account.credit_limit
          });
        }
      });
    }
    
    // Build summary
    const totalAccounts = accounts?.length || 0;
    const totalNegative = negativeItems.length;
    const totalPositive = totalAccounts - totalNegative;
    
    return {
      items: negativeItems,
      summary: {
        totalNegativeItems: totalNegative,
        totalPositiveAccounts: totalPositive,
        totalAccounts: totalAccounts,
        estimatedScoreImpact: totalNegative * 15, // Simple estimate
        bureausAffected: ['Experian', 'Equifax', 'TransUnion'],
        highImpactItems: negativeItems.filter(i => i.impact === 'high').length,
        mediumImpactItems: negativeItems.filter(i => i.impact === 'medium').length,
        lowImpactItems: negativeItems.filter(i => i.impact === 'low').length
      },
      historicalData: {
        lettersSent: 0,
        itemsRemoved: 0,
        itemsPending: totalNegative,
        successRate: 0,
        avgRemovalTime: 0
      },
      accountBreakdown: this.getAccountBreakdown(accounts || []),
      personalInfo: {
        name: personalInfo?.full_name,
        address: personalInfo?.current_address?.address,
        ssn: personalInfo?.ssn_partial,
        dateOfBirth: personalInfo?.date_of_birth
      },
      creditScores: {
        experian: 0,
        equifax: 0,
        transunion: 0
      }
    };
  }

  /**
   * Determine if account is negative
   */
  private static isNegativeAccount(account: any): boolean {
    const negativeStatuses = ['delinquent', 'charged off', 'collection', 'late', 'default'];
    const status = (account.account_status || '').toLowerCase();
    return negativeStatuses.some(neg => status.includes(neg));
  }

  /**
   * Determine issue description
   */
  private static determineIssue(account: any): string {
    const status = (account.account_status || '').toLowerCase();
    if (status.includes('collection')) return 'Account in collections';
    if (status.includes('charged off')) return 'Account charged off';
    if (status.includes('late')) return 'Late payments reported';
    if (status.includes('delinquent')) return 'Account delinquent';
    return 'Negative account status';
  }

  /**
   * Determine impact level
   */
  private static determineImpact(account: any): 'low' | 'medium' | 'high' {
    const status = (account.account_status || '').toLowerCase();
    if (status.includes('collection') || status.includes('charged off')) return 'high';
    if (status.includes('delinquent') || status.includes('default')) return 'medium';
    return 'low';
  }

  /**
   * Get account breakdown by type
   */
  private static getAccountBreakdown(accounts: any[]) {
    const breakdown = {
      creditCards: 0,
      mortgages: 0,
      autoLoans: 0,
      studentLoans: 0,
      personalLoans: 0,
      collections: 0,
      other: 0
    };
    
    accounts.forEach(account => {
      const type = (account.account_type || '').toLowerCase();
      if (type.includes('credit card')) breakdown.creditCards++;
      else if (type.includes('mortgage')) breakdown.mortgages++;
      else if (type.includes('auto')) breakdown.autoLoans++;
      else if (type.includes('student')) breakdown.studentLoans++;
      else if (type.includes('personal')) breakdown.personalLoans++;
      else if (type.includes('collection')) breakdown.collections++;
      else breakdown.other++;
    });
    
    return breakdown;
  }

  /**
   * Legacy method for backward compatibility
   */
  static async analyzePDF(
    request: PDFAnalysisRequest,
    onProgress?: (message: string, progress: number) => void
  ): Promise<CreditAnalysisResult> {
    Logger.debug('Legacy analyzePDF method called, redirecting to analyzeCreditReport');
    const bureaus = ['Experian', 'Equifax', 'TransUnion'];
    return this.analyzeCreditReport({ file: request.file, bureaus }, onProgress);
  }
}