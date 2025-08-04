import { supabase } from '@/integrations/supabase/client';

export interface CreditReport {
  id: string;
  user_id: string;
  bureau_name: string;
  report_date?: string;
  file_path?: string;
  file_name?: string;
  raw_text?: string;
  extraction_status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_errors?: string;
  created_at: string;
  updated_at: string;
}

export interface CreditReportUpload {
  bureau_name: string;
  file_name: string;
  report_date?: Date;
}

export class CreditReportService {
  /**
   * Get all credit reports for the current user
   */
  static async getUserCreditReports(): Promise<CreditReport[]> {
    const { data, error } = await supabase
      .from('credit_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching credit reports:', error);
      throw new Error('Failed to fetch credit reports');
    }

    return (data || []) as CreditReport[];
  }

  /**
   * Get a specific credit report by ID
   */
  static async getCreditReport(id: string): Promise<CreditReport | null> {
    const { data, error } = await supabase
      .from('credit_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No data found
      }
      console.error('Error fetching credit report:', error);
      throw new Error('Failed to fetch credit report');
    }

    return data as CreditReport;
  }

  /**
   * Create a new credit report record
   */
  static async createCreditReport(reportData: CreditReportUpload, userId: string): Promise<CreditReport> {
    const { data, error } = await supabase
      .from('credit_reports')
      .insert({
        user_id: userId,
        bureau_name: reportData.bureau_name,
        file_name: reportData.file_name,
        report_date: reportData.report_date?.toISOString().split('T')[0],
        extraction_status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating credit report:', error);
      throw new Error('Failed to create credit report');
    }

    return data as CreditReport;
  }

  /**
   * Update credit report with file path and status
   */
  static async updateCreditReport(
    id: string, 
    updates: Partial<Omit<CreditReport, 'id' | 'user_id' | 'created_at'>>
  ): Promise<CreditReport> {
    const { data, error } = await supabase
      .from('credit_reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating credit report:', error);
      throw new Error('Failed to update credit report');
    }

    return data as CreditReport;
  }

  /**
   * Delete a credit report and associated file
   */
  static async deleteCreditReport(id: string): Promise<void> {
    // First get the report to find the file path
    const report = await this.getCreditReport(id);
    
    if (report?.file_path) {
      // Delete file from storage
      const { error: storageError } = await supabase.storage
        .from('credit-reports')
        .remove([report.file_path]);

      if (storageError) {
        console.error('Error deleting file from storage:', storageError);
        // Continue with database deletion even if file deletion fails
      }
    }

    // Delete database record
    const { error } = await supabase
      .from('credit_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting credit report:', error);
      throw new Error('Failed to delete credit report');
    }
  }

  /**
   * Get signed URL for accessing credit report file
   */
  static async getFileDownloadUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('credit-reports')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      console.error('Error creating signed URL:', error);
      throw new Error('Failed to get file download URL');
    }

    return data.signedUrl;
  }

  /**
   * Upload file to storage
   */
  static async uploadFile(
    filePath: string, 
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const { data, error } = await supabase.storage
      .from('credit-reports')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading file:', error);
      throw new Error('Failed to upload file');
    }

    return data.path;
  }

  /**
   * Check if user has already uploaded a report for a specific bureau today
   */
  static async hasReportForBureauToday(bureau: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('credit_reports')
      .select('id')
      .eq('bureau_name', bureau)
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59`)
      .limit(1);

    if (error) {
      console.error('Error checking existing reports:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  }

  /**
   * Get summary statistics for user's credit reports
   */
  static async getReportSummary(): Promise<{
    total: number;
    byBureau: Record<string, number>;
    recentCount: number;
  }> {
    const { data, error } = await supabase
      .from('credit_reports')
      .select('bureau_name, created_at');

    if (error) {
      console.error('Error fetching report summary:', error);
      throw new Error('Failed to fetch report summary');
    }

    const total = data?.length || 0;
    const byBureau = (data || []).reduce((acc, report) => {
      acc[report.bureau_name] = (acc[report.bureau_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentCount = (data || []).filter(
      report => new Date(report.created_at) > thirtyDaysAgo
    ).length;

    return {
      total,
      byBureau,
      recentCount,
    };
  }
}

export default CreditReportService;