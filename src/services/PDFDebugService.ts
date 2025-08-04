import { supabase } from '@/integrations/supabase/client';

export class PDFDebugService {
  
  static async debugPDFProcessing(file: File): Promise<{
    fileInfo: any;
    extractionAttempts: any[];
    finalResult: any;
  }> {
    console.log('🔍 DEBUG: Starting PDF processing audit...');
    
    const fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    };
    
    console.log('📄 File Info:', fileInfo);
    
    const extractionAttempts = [];
    
    // Attempt 1: Check if this is a valid PDF
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const header = new TextDecoder().decode(uint8Array.slice(0, 10));
      
      const attempt1 = {
        method: 'PDF Header Check',
        success: header.startsWith('%PDF'),
        details: { header, isPDF: header.startsWith('%PDF') }
      };
      
      extractionAttempts.push(attempt1);
      console.log('🔍 PDF Header Check:', attempt1);
      
      if (!attempt1.success) {
        return { fileInfo, extractionAttempts, finalResult: { error: 'Not a valid PDF file' } };
      }
      
    } catch (error) {
      extractionAttempts.push({
        method: 'PDF Header Check',
        success: false,
        error: error.message
      });
    }
    
    // Attempt 2: Try basic text extraction from current edge function
    try {
      console.log('🔄 Attempting current edge function analysis...');
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('action', 'analyzePDF');
      
      const { data, error } = await supabase.functions.invoke('openai-analysis', {
        body: formData
      });
      
      const attempt2 = {
        method: 'Current Edge Function',
        success: !error && data && Object.keys(data).length > 0,
        details: { data, error },
        dataSize: data ? JSON.stringify(data).length : 0
      };
      
      extractionAttempts.push(attempt2);
      console.log('🔍 Current Edge Function Result:', attempt2);
      
      if (attempt2.success) {
        return { fileInfo, extractionAttempts, finalResult: data };
      }
      
    } catch (error) {
      extractionAttempts.push({
        method: 'Current Edge Function',
        success: false,
        error: error.message
      });
    }
    
    // Attempt 3: Try enhanced PDF extraction
    try {
      console.log('🔄 Attempting enhanced PDF extraction...');
      
      const { data, error } = await supabase.functions.invoke('enhanced-pdf-extract', {
        body: { 
          filePath: `temp/${file.name}`,
          reportId: 'debug-' + Date.now()
        }
      });
      
      const attempt3 = {
        method: 'Enhanced PDF Extract',
        success: !error,
        details: { data, error }
      };
      
      extractionAttempts.push(attempt3);
      console.log('🔍 Enhanced PDF Extract Result:', attempt3);
      
    } catch (error) {
      extractionAttempts.push({
        method: 'Enhanced PDF Extract',
        success: false,
        error: error.message
      });
    }
    
    // Attempt 4: Try PDF.js extraction directly
    try {
      console.log('🔄 Attempting PDF.js extraction...');
      
      // Import PDFProcessor and try direct extraction
      const { PDFProcessor } = await import('./PDFProcessor');
      const extractedText = await PDFProcessor.extractTextFromPDF(file);
      
      const attempt4 = {
        method: 'PDF.js Direct',
        success: extractedText && extractedText.length > 100,
        details: { 
          textLength: extractedText?.length || 0, 
          preview: extractedText?.substring(0, 200) || '',
          isValidCreditReport: PDFProcessor.isValidCreditReportText(extractedText || '')
        }
      };
      
      extractionAttempts.push(attempt4);
      console.log('🔍 PDF.js Direct Result:', attempt4);
      
      if (attempt4.success) {
        // If we got text, try to analyze it
        try {
          const { data, error } = await supabase.functions.invoke('openai-analysis', {
            body: { 
              action: 'analyzeCreditReport',
              data: { reportText: extractedText }
            }
          });
          
          return { 
            fileInfo, 
            extractionAttempts, 
            finalResult: error ? { error } : data 
          };
          
        } catch (analysisError) {
          return { 
            fileInfo, 
            extractionAttempts, 
            finalResult: { 
              extractedText: extractedText?.substring(0, 500),
              analysisError: analysisError.message 
            }
          };
        }
      }
      
    } catch (error) {
      extractionAttempts.push({
        method: 'PDF.js Direct',
        success: false,
        error: error.message
      });
    }
    
    return { 
      fileInfo, 
      extractionAttempts, 
      finalResult: { error: 'All extraction methods failed' }
    };
  }
  
  static async checkCreditReportsTable(): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('credit_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
        
      console.log('📊 Recent Credit Reports:', { data, error });
      return { data, error };
      
    } catch (error) {
      console.error('❌ Error checking credit reports:', error);
      return { error: error.message };
    }
  }
  
  static async checkCreditAccountsTable(reportId?: string): Promise<any> {
    try {
      let query = supabase
        .from('credit_accounts')
        .select('*');
        
      if (reportId) {
        query = query.eq('report_id', reportId);
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(10);
        
      console.log('💳 Credit Accounts:', { data, error });
      return { data, error };
      
    } catch (error) {
      console.error('❌ Error checking credit accounts:', error);
      return { error: error.message };
    }
  }
}