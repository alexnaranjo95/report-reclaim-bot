import { supabase } from '@/integrations/supabase/client';

export interface CreditReport {
  id: string;
  user_id: string;
  bureau_name: string;
  file_name: string;
  file_path?: string;
  report_date?: string;
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
        return null;
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
   * Update credit report status and data
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
   * Upload file to storage
   */
  static async uploadFile(
    filePath: string, 
    file: File
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
   * Get signed URL for file download
   */
  static async getFileDownloadUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('credit-reports')
      .createSignedUrl(filePath, 3600);

    if (error) {
      console.error('Error creating signed URL:', error);
      throw new Error('Failed to get file download URL');
    }

    return data.signedUrl;
  }

  /**
   * Delete a credit report and associated data
   */
  static async deleteCreditReport(id: string): Promise<void> {
    const report = await this.getCreditReport(id);
    
    if (report?.file_path) {
      const { error: storageError } = await supabase.storage
        .from('credit-reports')
        .remove([report.file_path]);

      if (storageError) {
        console.error('Error deleting file from storage:', storageError);
      }
    }

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
   * Get parsed data for a credit report
   */
  static async getParsedData(reportId: string) {
    const [personalInfo, accounts, inquiries, negativeItems, publicRecords] = await Promise.all([
      supabase.from('personal_information').select('*').eq('report_id', reportId).maybeSingle(),
      supabase.from('credit_accounts').select('*').eq('report_id', reportId),
      supabase.from('credit_inquiries').select('*').eq('report_id', reportId),
      supabase.from('negative_items').select('*').eq('report_id', reportId),
      supabase.from('public_records').select('*').eq('report_id', reportId)
    ]);

    return {
      personalInfo: personalInfo.data,
      accounts: accounts.data || [],
      inquiries: inquiries.data || [],
      negativeItems: negativeItems.data || [],
      scores: [],
      publicRecords: publicRecords.data || []
    };
  }
}