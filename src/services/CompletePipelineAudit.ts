import { supabase } from '@/integrations/supabase/client';

export interface AuditResult {
  phase: string;
  success: boolean;
  details: string;
  data?: any;
}

export class CompletePipelineAudit {
  static async runFullAudit(reportId: string): Promise<AuditResult[]> {
    const results: AuditResult[] = [];
    
    try {
      // Phase 1: File Storage Verification
      results.push(await this.auditFileStorage(reportId));
      
      // Phase 2: Text Extraction Verification  
      results.push(await this.auditTextExtraction(reportId));
      
      // Phase 3: Data Parsing Verification
      results.push(await this.auditDataParsing(reportId));
      
      // Phase 4: Database Storage Verification
      results.push(await this.auditDatabaseStorage(reportId));
      
      // Phase 5: API Retrieval Verification
      results.push(await this.auditAPIRetrieval(reportId));
      
      return results;
    } catch (error) {
      console.error('Audit failed:', error);
      results.push({
        phase: 'Audit System',
        success: false,
        details: `Audit system error: ${error.message}`
      });
      return results;
    }
  }

  static async auditFileStorage(reportId: string): Promise<AuditResult> {
    try {
      const { data: report } = await supabase
        .from('credit_reports')
        .select('file_path, file_name')
        .eq('id', reportId)
        .single();

      if (!report?.file_path) {
        return {
          phase: 'Phase 1: File Storage',
          success: false,
          details: 'No file path found in database record'
        };
      }

      // Test file accessibility
      const { data: fileData, error: fileError } = await supabase.storage
        .from('credit-reports')
        .download(report.file_path);

      if (fileError || !fileData) {
        return {
          phase: 'Phase 1: File Storage',
          success: false,
          details: `File not accessible: ${fileError?.message || 'File data is null'}`
        };
      }

      const fileSize = fileData.size;
      return {
        phase: 'Phase 1: File Storage',
        success: true,
        details: `File accessible: ${report.file_name} (${fileSize} bytes)`,
        data: { filePath: report.file_path, fileSize }
      };
    } catch (error) {
      return {
        phase: 'Phase 1: File Storage',
        success: false,
        details: `Storage audit error: ${error.message}`
      };
    }
  }

  static async auditTextExtraction(reportId: string): Promise<AuditResult> {
    try {
      const { data: report } = await supabase
        .from('credit_reports')
        .select('raw_text, extraction_status, processing_errors')
        .eq('id', reportId)
        .single();

      if (!report) {
        return {
          phase: 'Phase 2: Text Extraction',
          success: false,
          details: 'No report record found'
        };
      }

      if (report.extraction_status === 'failed') {
        return {
          phase: 'Phase 2: Text Extraction',
          success: false,
          details: `Extraction failed: ${report.processing_errors || 'Unknown error'}`
        };
      }

      if (report.extraction_status === 'pending' || report.extraction_status === 'processing') {
        return {
          phase: 'Phase 2: Text Extraction',
          success: false,
          details: `Extraction not completed (status: ${report.extraction_status})`
        };
      }

      if (!report.raw_text || report.raw_text.length < 10) {
        return {
          phase: 'Phase 2: Text Extraction',
          success: false,
          details: 'No extracted text or text too short'
        };
      }

      return {
        phase: 'Phase 2: Text Extraction',
        success: true,
        details: `Text extracted successfully (${report.raw_text.length} characters)`,
        data: { textLength: report.raw_text.length, preview: report.raw_text.substring(0, 200) }
      };
    } catch (error) {
      return {
        phase: 'Phase 2: Text Extraction',
        success: false,
        details: `Text extraction audit error: ${error.message}`
      };
    }
  }

  static async auditDataParsing(reportId: string): Promise<AuditResult> {
    try {
      // Check if parsing functions were executed by looking for parsed data
      const { data: personalInfo } = await supabase
        .from('personal_information')
        .select('*')
        .eq('report_id', reportId);

      const { data: accounts } = await supabase
        .from('credit_accounts')
        .select('*')
        .eq('report_id', reportId);

      const { data: inquiries } = await supabase
        .from('credit_inquiries')
        .select('*')
        .eq('report_id', reportId);

      const parsedDataCount = (personalInfo?.length || 0) + (accounts?.length || 0) + (inquiries?.length || 0);

      if (parsedDataCount === 0) {
        return {
          phase: 'Phase 3: Data Parsing',
          success: false,
          details: 'No parsed data found in any tables - parsing functions may not have executed'
        };
      }

      return {
        phase: 'Phase 3: Data Parsing',
        success: true,
        details: `Data parsing successful - found ${personalInfo?.length || 0} personal records, ${accounts?.length || 0} accounts, ${inquiries?.length || 0} inquiries`,
        data: { personalInfo, accounts, inquiries }
      };
    } catch (error) {
      return {
        phase: 'Phase 3: Data Parsing',
        success: false,
        details: `Data parsing audit error: ${error.message}`
      };
    }
  }

  static async auditDatabaseStorage(reportId: string): Promise<AuditResult> {
    try {
      // Test database connectivity by checking each table individually
      const { data: personalInfo, error: personalError } = await supabase
        .from('personal_information')
        .select('id')
        .eq('report_id', reportId);

      const { data: accounts, error: accountsError } = await supabase
        .from('credit_accounts')
        .select('id')
        .eq('report_id', reportId);

      const { data: inquiries, error: inquiriesError } = await supabase
        .from('credit_inquiries')
        .select('id')
        .eq('report_id', reportId);

      if (personalError || accountsError || inquiriesError) {
        const errors = [personalError, accountsError, inquiriesError]
          .filter(Boolean)
          .map(e => e.message)
          .join(', ');
        
        return {
          phase: 'Phase 4: Database Storage',
          success: false,
          details: `Database access errors: ${errors}`
        };
      }

      const results = [
        { table: 'personal_information', count: personalInfo?.length || 0 },
        { table: 'credit_accounts', count: accounts?.length || 0 },
        { table: 'credit_inquiries', count: inquiries?.length || 0 }
      ];

      const totalRecords = results.reduce((sum, result) => sum + result.count, 0);

      return {
        phase: 'Phase 4: Database Storage',
        success: true,
        details: `Database storage operational - ${totalRecords} total records stored`,
        data: results
      };
    } catch (error) {
      return {
        phase: 'Phase 4: Database Storage',
        success: false,
        details: `Database storage audit error: ${error.message}`
      };
    }
  }

  static async auditAPIRetrieval(reportId: string): Promise<AuditResult> {
    try {
      // Test API endpoints by making actual queries
      const personalInfoQuery = supabase
        .from('personal_information')
        .select('*')
        .eq('report_id', reportId);

      const accountsQuery = supabase
        .from('credit_accounts')
        .select('*')
        .eq('report_id', reportId);

      const inquiriesQuery = supabase
        .from('credit_inquiries')
        .select('*')
        .eq('report_id', reportId);

      const [personalResult, accountsResult, inquiriesResult] = await Promise.all([
        personalInfoQuery,
        accountsQuery,
        inquiriesQuery
      ]);

      const errors = [personalResult.error, accountsResult.error, inquiriesResult.error].filter(Boolean);

      if (errors.length > 0) {
        return {
          phase: 'Phase 5: API Retrieval',
          success: false,
          details: `API retrieval errors: ${errors.map(e => e.message).join(', ')}`
        };
      }

      const totalRecords = (personalResult.data?.length || 0) + 
                          (accountsResult.data?.length || 0) + 
                          (inquiriesResult.data?.length || 0);

      return {
        phase: 'Phase 5: API Retrieval',
        success: true,
        details: `API retrieval successful - retrieved ${totalRecords} records`,
        data: {
          personalInfo: personalResult.data,
          accounts: accountsResult.data,
          inquiries: inquiriesResult.data
        }
      };
    } catch (error) {
      return {
        phase: 'Phase 5: API Retrieval',
        success: false,
        details: `API retrieval audit error: ${error.message}`
      };
    }
  }

  static async triggerProcessingAndAudit(reportId: string): Promise<{
    processingResult: any;
    auditResults: AuditResult[];
  }> {
    try {
      // Fetch file path
      const { data: report } = await supabase
        .from('credit_reports')
        .select('file_path')
        .eq('id', reportId)
        .single();

      if (!report?.file_path) {
        throw new Error('No file path found for report');
      }

      // Reset status and trigger extraction via Docsumo
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'processing',
          consolidation_status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      const { data: processingResult, error } = await supabase.functions.invoke('docsumo-extract', {
        body: { reportId, filePath: report.file_path }
      });

      if (error) {
        throw new Error(`Processing failed: ${error.message}`);
      }

      // Small wait for downstream updates
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Run full audit
      const auditResults = await this.runFullAudit(reportId);

      return { processingResult, auditResults };
    } catch (error) {
      const auditResults = await this.runFullAudit(reportId);
      return { processingResult: { error: error.message }, auditResults };
    }
  }
}