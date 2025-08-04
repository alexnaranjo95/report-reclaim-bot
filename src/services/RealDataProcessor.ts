import { supabase } from '@/integrations/supabase/client';

export interface ExtractedDataCounts {
  personalInfo: number;
  accounts: number;
  inquiries: number;
  negativeItems: number;
}

export class RealDataProcessor {
  /**
   * Verify that real data was extracted and stored for a report
   */
  static async verifyExtractedData(reportId: string): Promise<ExtractedDataCounts> {
    console.log('🔍 VERIFYING REAL DATA for report:', reportId);
    
    const [personalInfo, accounts, inquiries, negativeItems] = await Promise.all([
      supabase.from('personal_information').select('*').eq('report_id', reportId),
      supabase.from('credit_accounts').select('*').eq('report_id', reportId),
      supabase.from('credit_inquiries').select('*').eq('report_id', reportId),
      supabase.from('negative_items').select('*').eq('report_id', reportId)
    ]);

    const counts = {
      personalInfo: personalInfo.data?.length || 0,
      accounts: accounts.data?.length || 0,
      inquiries: inquiries.data?.length || 0,
      negativeItems: negativeItems.data?.length || 0
    };

    console.log('📊 REAL DATA COUNTS:', counts);
    
    return counts;
  }

  /**
   * Completely purge all data for a user's current round
   */
  static async purgeUserData(userId: string): Promise<void> {
    console.log('🗑️ PURGING ALL USER DATA for:', userId);
    
    try {
      // Get all credit reports for this user
      const { data: reports } = await supabase
        .from('credit_reports')
        .select('id, file_path')
        .eq('user_id', userId);

      if (reports && reports.length > 0) {
        for (const report of reports) {
          console.log('🗑️ Cleaning up report:', report.id);
          
          // Delete all related data in correct order (foreign key dependencies)
          await Promise.all([
            supabase.from('negative_items').delete().eq('report_id', report.id),
            supabase.from('credit_inquiries').delete().eq('report_id', report.id),
            supabase.from('credit_accounts').delete().eq('report_id', report.id),
            supabase.from('personal_information').delete().eq('report_id', report.id),
            supabase.from('ai_analysis_results').delete().eq('report_id', report.id),
          ]);
          
          // Delete the file from storage if it exists
          if (report.file_path) {
            console.log('🗑️ Deleting file from storage:', report.file_path);
            await supabase.storage
              .from('credit-reports')
              .remove([report.file_path]);
          }
          
          // Delete the credit report record
          await supabase
            .from('credit_reports')
            .delete()
            .eq('id', report.id);
        }
      }

      // Clear all rounds for this user
      const { data: userRounds } = await supabase
        .from('rounds')
        .select('id')
        .eq('user_id', userId);

      if (userRounds && userRounds.length > 0) {
        await supabase
          .from('rounds')
          .delete()
          .eq('user_id', userId);
      }

      console.log('✅ USER DATA PURGE COMPLETED');
      
    } catch (error) {
      console.error('❌ PURGE FAILED:', error);
      throw error;
    }
  }

  /**
   * Validate that extracted text contains actual credit report content
   */
  static validateCreditReportText(text: string): boolean {
    if (!text || text.length < 500) {
      console.log('❌ TEXT TOO SHORT:', text.length);
      return false;
    }

    const creditKeywords = [
      'credit report', 'credit score', 'equifax', 'experian', 'transunion',
      'account number', 'payment history', 'credit limit', 'balance',
      'inquiry', 'collections', 'trade line', 'late payment'
    ];

    const foundKeywords = creditKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    );

    console.log('🔍 CREDIT KEYWORDS FOUND:', foundKeywords.length, 'of', creditKeywords.length);
    
    return foundKeywords.length >= 3; // Require at least 3 credit-related keywords
  }

  /**
   * Monitor extraction pipeline health
   */
  static async getExtractionHealth(): Promise<{
    totalReports: number;
    successfulExtractions: number;
    failedExtractions: number;
    pendingExtractions: number;
    successRate: number;
  }> {
    const { data: reports } = await supabase
      .from('credit_reports')
      .select('extraction_status');

    if (!reports) {
      return {
        totalReports: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        pendingExtractions: 0,
        successRate: 0
      };
    }

    const total = reports.length;
    const successful = reports.filter(r => r.extraction_status === 'completed').length;
    const failed = reports.filter(r => r.extraction_status === 'failed').length;
    const pending = reports.filter(r => r.extraction_status === 'pending' || r.extraction_status === 'processing').length;

    return {
      totalReports: total,
      successfulExtractions: successful,
      failedExtractions: failed,
      pendingExtractions: pending,
      successRate: total > 0 ? (successful / total) * 100 : 0
    };
  }
}