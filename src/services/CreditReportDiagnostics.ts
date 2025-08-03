import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Comprehensive debugging service for credit report processing pipeline
 */
export class CreditReportDiagnostics {
  
  /**
   * Run complete system diagnostics
   */
  static async runFullDiagnostics(reportId: string): Promise<void> {
    console.log('🔍 Starting comprehensive system diagnostics for report:', reportId);
    
    try {
      // Phase 1: File upload and storage verification
      await this.checkFileStorage(reportId);
      
      // Phase 2: Adobe PDF processing investigation
      await this.checkAdobeProcessing(reportId);
      
      // Phase 3: Database operations analysis
      await this.checkDatabaseOperations(reportId);
      
      // Phase 4: Data flow verification
      await this.checkDataFlow(reportId);
      
      console.log('✅ Diagnostics completed - check console for detailed results');
      
    } catch (error) {
      console.error('❌ Diagnostics failed:', error);
      throw error;
    }
  }

  /**
   * Phase 1: File upload and storage verification
   */
  static async checkFileStorage(reportId: string): Promise<void> {
    console.log('📁 Phase 1: File Storage Verification');
    
    try {
      // Get report file information
      const { data: report, error: reportError } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (reportError) {
        console.error('❌ Failed to get report:', reportError);
        return;
      }

      console.log('📋 Report data:', {
        id: report.id,
        file_name: report.file_name,
        file_path: report.file_path,
        extraction_status: report.extraction_status,
        created_at: report.created_at,
        updated_at: report.updated_at,
        raw_text_length: report.raw_text?.length || 0
      });

      if (!report.file_path) {
        console.error('❌ No file path found in report');
        return;
      }

      // Test file accessibility
      console.log('🔍 Testing file accessibility...');
      try {
        const { data: urlData, error: urlError } = await supabase.storage
          .from('credit-reports')
          .createSignedUrl(report.file_path, 300); // 5 minute expiry

        if (urlError) {
          console.error('❌ Failed to create signed URL:', urlError);
        } else {
          console.log('✅ File is accessible, signed URL created');
          console.log('🔗 File URL generated successfully');
          
          // Test if file actually exists by attempting to fetch metadata
          const { data: fileList, error: listError } = await supabase.storage
            .from('credit-reports')
            .list(report.file_path.split('/').slice(0, -1).join('/'));
            
          if (listError) {
            console.error('❌ Failed to list files in directory:', listError);
          } else {
            const fileName = report.file_path.split('/').pop();
            const fileExists = fileList?.some(file => file.name === fileName);
            console.log(fileExists ? '✅ File exists in storage' : '❌ File not found in storage');
          }
        }
      } catch (accessError) {
        console.error('❌ File access test failed:', accessError);
      }

    } catch (error) {
      console.error('❌ File storage check failed:', error);
    }
  }

  /**
   * Phase 2: Adobe PDF processing investigation
   */
  static async checkAdobeProcessing(reportId: string): Promise<void> {
    console.log('🤖 Phase 2: Adobe PDF Processing Investigation');
    
    try {
      const { data: report } = await supabase
        .from('credit_reports')
        .select('file_path, extraction_status, processing_errors, updated_at')
        .eq('id', reportId)
        .single();

      console.log('📊 Processing status:', {
        extraction_status: report.extraction_status,
        processing_errors: report.processing_errors,
        last_updated: report.updated_at,
        stuck_duration: new Date().getTime() - new Date(report.updated_at).getTime()
      });

      // Test Adobe edge function availability
      console.log('🔍 Testing Adobe edge function...');
      try {
        const testResponse = await supabase.functions.invoke('adobe-pdf-extract', {
          body: { test: true }
        });
        
        console.log('📡 Adobe function response:', testResponse);
        
        if (testResponse.error) {
          console.error('❌ Adobe function error:', testResponse.error);
        } else {
          console.log('✅ Adobe function is accessible');
        }
      } catch (adobeError) {
        console.error('❌ Adobe function test failed:', adobeError);
      }

      // If stuck in processing, show detailed timing
      if (report.extraction_status === 'processing') {
        const stuckTime = new Date().getTime() - new Date(report.updated_at).getTime();
        const stuckMinutes = Math.floor(stuckTime / (1000 * 60));
        
        console.warn(`⚠️ Report stuck in processing for ${stuckMinutes} minutes`);
        
        if (stuckMinutes > 5) {
          console.error('🚨 Processing timeout detected - system likely hung');
        }
      }

    } catch (error) {
      console.error('❌ Adobe processing check failed:', error);
    }
  }

  /**
   * Phase 3: Database operations analysis
   */
  static async checkDatabaseOperations(reportId: string): Promise<void> {
    console.log('💾 Phase 3: Database Operations Analysis');
    
    try {
      // Check all related data tables
      const checks = await Promise.all([
        supabase.from('personal_information').select('*').eq('report_id', reportId),
        supabase.from('credit_accounts').select('*').eq('report_id', reportId),
        supabase.from('credit_inquiries').select('*').eq('report_id', reportId),
        supabase.from('negative_items').select('*').eq('report_id', reportId)
      ]);

      const [personalInfo, accounts, inquiries, negativeItems] = checks;

      console.log('📊 Database content summary:', {
        personal_info_records: personalInfo.data?.length || 0,
        credit_accounts: accounts.data?.length || 0,
        credit_inquiries: inquiries.data?.length || 0,
        negative_items: negativeItems.data?.length || 0,
        personal_info_error: personalInfo.error?.message,
        accounts_error: accounts.error?.message,
        inquiries_error: inquiries.error?.message,
        negative_items_error: negativeItems.error?.message
      });

      // Check if ANY data exists for this report
      const totalRecords = (personalInfo.data?.length || 0) + 
                          (accounts.data?.length || 0) + 
                          (inquiries.data?.length || 0) + 
                          (negativeItems.data?.length || 0);

      if (totalRecords === 0) {
        console.error('🚨 CRITICAL: No extracted data found in any table');
        console.error('📋 This indicates complete extraction failure');
      } else {
        console.log(`✅ Found ${totalRecords} total data records`);
      }

      // Test database connectivity
      console.log('🔍 Testing database connectivity...');
      const { data: testQuery, error: testError } = await supabase
        .from('credit_reports')
        .select('id')
        .limit(1);

      if (testError) {
        console.error('❌ Database connectivity test failed:', testError);
      } else {
        console.log('✅ Database connectivity working');
      }

    } catch (error) {
      console.error('❌ Database operations check failed:', error);
    }
  }

  /**
   * Phase 4: Data flow verification
   */
  static async checkDataFlow(reportId: string): Promise<void> {
    console.log('🔄 Phase 4: Data Flow Verification');
    
    try {
      // Get report with all metadata
      const { data: report } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      // Analyze the complete processing pipeline
      const pipeline = {
        step1_file_upload: !!report.file_path,
        step2_extraction_triggered: report.extraction_status !== 'pending',
        step3_raw_text_extracted: !!report.raw_text,
        step4_data_parsed: false, // Will check below
        step5_interface_display: false // Will check below
      };

      // Check if data was parsed
      const { data: anyData } = await supabase
        .from('personal_information')
        .select('id')
        .eq('report_id', reportId)
        .limit(1);
      
      pipeline.step4_data_parsed = !!anyData?.length;

      console.log('🔍 Pipeline analysis:', pipeline);

      // Identify failure point
      if (!pipeline.step1_file_upload) {
        console.error('🚨 FAILURE POINT: File upload failed');
      } else if (!pipeline.step2_extraction_triggered) {
        console.error('🚨 FAILURE POINT: Extraction never triggered');
      } else if (!pipeline.step3_raw_text_extracted) {
        console.error('🚨 FAILURE POINT: Raw text extraction failed');
      } else if (!pipeline.step4_data_parsed) {
        console.error('🚨 FAILURE POINT: Data parsing failed');
      } else {
        console.log('✅ Pipeline appears to be working');
      }

      // Generate recommendations
      this.generateRecommendations(pipeline, report);

    } catch (error) {
      console.error('❌ Data flow verification failed:', error);
    }
  }

  /**
   * Generate specific recommendations based on diagnostics
   */
  static generateRecommendations(pipeline: any, report: any): void {
    console.log('💡 Diagnostic Recommendations:');
    
    if (!pipeline.step3_raw_text_extracted && report.extraction_status === 'processing') {
      console.log('🔧 RECOMMENDATION: Reset and retry extraction with fallback processor');
      console.log('📝 ACTION: Click "Extract Data" button to trigger emergency processing');
    }
    
    if (pipeline.step3_raw_text_extracted && !pipeline.step4_data_parsed) {
      console.log('🔧 RECOMMENDATION: Raw text exists but parsing failed');
      console.log('📝 ACTION: Trigger comprehensive parsing manually');
    }
    
    if (!pipeline.step1_file_upload) {
      console.log('🔧 RECOMMENDATION: Re-upload the PDF file');
      console.log('📝 ACTION: Use the upload button to submit file again');
    }
    
    if (report.extraction_status === 'processing') {
      const stuckTime = new Date().getTime() - new Date(report.updated_at).getTime();
      if (stuckTime > 300000) { // 5 minutes
        console.log('🔧 RECOMMENDATION: Processing timeout detected');
        console.log('📝 ACTION: Force reset processing status and retry');
      }
    }
  }

  /**
   * Attempt emergency recovery
   */
  static async attemptEmergencyRecovery(reportId: string): Promise<boolean> {
    console.log('🚨 Attempting emergency recovery...');
    
    try {
      // Step 1: Reset processing status
      console.log('🔄 Step 1: Resetting processing status...');
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'pending',
          processing_errors: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      // Step 2: Trigger emergency processing
      console.log('🔄 Step 2: Triggering emergency fallback processing...');
      const { CreditReportEmergencyFix } = await import('./CreditReportEmergencyFix');
      await CreditReportEmergencyFix.forceReprocess(reportId);
      
      console.log('✅ Emergency recovery initiated');
      return true;
      
    } catch (error) {
      console.error('❌ Emergency recovery failed:', error);
      return false;
    }
  }
}