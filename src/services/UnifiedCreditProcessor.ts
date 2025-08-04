
import { supabase } from '@/integrations/supabase/client';

/**
 * Unified Credit Report Processing Service with Amazon Textract Integration
 * Handles the complete workflow from PDF upload to parsed data display
 */
export class UnifiedCreditProcessor {
  
  /**
   * Process a credit report using Amazon Textract - main entry point
   */
  static async processReport(reportId: string): Promise<{
    success: boolean;
    personalInfo: any;
    accounts: any[];
    inquiries: any[];
    negativeItems: any[];
    errors: string[];
  }> {
    console.log('🚀 Starting unified credit report processing with Textract for:', reportId);
    
    const errors: string[] = [];
    let personalInfo = null;
    let accounts: any[] = [];
    let inquiries: any[] = [];
    let negativeItems: any[] = [];
    
    try {
      // Step 1: Get the report
      const { data: report, error: reportError } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('id', reportId)
        .single();
        
      if (reportError || !report) {
        throw new Error('Report not found');
      }
      
      // Step 2: Check if we need to extract text
      if (!report.raw_text || report.extraction_status === 'pending') {
        console.log('📄 No raw text found, triggering Textract extraction...');
        await this.triggerTextractExtraction(reportId, report.file_path);
        
        // Wait for extraction to complete
        await this.waitForExtraction(reportId);
        
        // Reload report with extracted text
        const { data: updatedReport } = await supabase
          .from('credit_reports')
          .select('raw_text, extraction_status')
          .eq('id', reportId)
          .single();
          
        if (!updatedReport?.raw_text) {
          throw new Error('Textract text extraction failed');
        }
        
        report.raw_text = updatedReport.raw_text;
      }
      
      // Step 3: Check if we already have parsed data
      const existingData = await this.checkExistingData(reportId);
      
      if (existingData.hasData) {
        console.log('✅ Using existing parsed data');
        return {
          success: true,
          personalInfo: existingData.personalInfo,
          accounts: existingData.accounts,
          inquiries: existingData.inquiries,
          negativeItems: existingData.negativeItems,
          errors
        };
      }
      
      // Step 4: Parse the raw text (this may have already been done by Textract function)
      console.log('🔍 Parsing raw text...');
      const parsedData = this.parseRawText(report.raw_text);
      
      // Step 5: Store any additional parsed data if needed
      console.log('💾 Storing any additional parsed data...');
      await this.storeParsedData(reportId, parsedData);
      
      return {
        success: true,
        personalInfo: parsedData.personalInfo,
        accounts: parsedData.accounts,
        inquiries: parsedData.inquiries,
        negativeItems: parsedData.negativeItems,
        errors
      };
      
    } catch (error) {
      console.error('❌ Processing failed:', error);
      errors.push(error.message);
      
      return {
        success: false,
        personalInfo,
        accounts,
        inquiries,
        negativeItems,
        errors
      };
    }
  }
  
  /**
   * Trigger Textract PDF text extraction
   */
  private static async triggerTextractExtraction(reportId: string, filePath: string): Promise<void> {
    try {
      console.log('🚀 Triggering Amazon Textract extraction...');
      const { data, error } = await supabase.functions.invoke('textract-extract', {
        body: { reportId, filePath }
      });
      
      if (error) {
        console.log('⚠️ Textract failed, trying fallback extraction...');
        // Fallback to enhanced extraction
        const { error: fallbackError } = await supabase.functions.invoke('enhanced-pdf-extract', {
          body: { reportId, filePath }
        });
        
        if (fallbackError) {
          throw new Error(`Both Textract and fallback extraction failed: ${fallbackError.message}`);
        }
        
        console.log('✅ Fallback extraction successful');
      } else {
        console.log('✅ Textract extraction triggered successfully');
      }
    } catch (error) {
      console.error('❌ Failed to trigger extraction:', error);
      throw error;
    }
  }
  
  /**
   * Wait for extraction to complete
   */
  private static async waitForExtraction(reportId: string, maxWaitTime = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const { data: report } = await supabase
        .from('credit_reports')
        .select('extraction_status, raw_text')
        .eq('id', reportId)
        .single();
        
      if (report?.extraction_status === 'completed' && report.raw_text) {
        console.log('✅ Extraction completed');
        return;
      }
      
      if (report?.extraction_status === 'failed') {
        throw new Error('Text extraction failed');
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Extraction timeout');
  }
  
  /**
   * Check if we already have parsed data
   */
  private static async checkExistingData(reportId: string): Promise<{
    hasData: boolean;
    personalInfo: any;
    accounts: any[];
    inquiries: any[];
    negativeItems: any[];
  }> {
    try {
      // Check all data tables in parallel
      const [personalResponse, accountsResponse, inquiriesResponse, negativeResponse] = await Promise.all([
        supabase.from('personal_information').select('*').eq('report_id', reportId).maybeSingle(),
        supabase.from('credit_accounts').select('*').eq('report_id', reportId),
        supabase.from('credit_inquiries').select('*').eq('report_id', reportId),
        supabase.from('negative_items').select('*').eq('report_id', reportId)
      ]);
      
      const personalInfo = personalResponse.data;
      const accounts = accountsResponse.data || [];
      const inquiries = inquiriesResponse.data || [];
      const negativeItems = negativeResponse.data || [];
      
      const hasData = !!personalInfo || accounts.length > 0 || inquiries.length > 0 || negativeItems.length > 0;
      
      return {
        hasData,
        personalInfo,
        accounts,
        inquiries,
        negativeItems
      };
    } catch (error) {
      console.error('Error checking existing data:', error);
      return {
        hasData: false,
        personalInfo: null,
        accounts: [],
        inquiries: [],
        negativeItems: []
      };
    }
  }
  
  /**
   * Parse raw text into structured data
   */
  private static parseRawText(rawText: string): {
    personalInfo: any;
    accounts: any[];
    inquiries: any[];
    negativeItems: any[];
  } {
    console.log('📊 Parsing raw text, length:', rawText.length);
    
    // Simple but effective parsing
    const personalInfo = this.extractPersonalInfo(rawText);
    const accounts = this.extractAccounts(rawText);
    const inquiries = this.extractInquiries(rawText);
    const negativeItems = this.extractNegativeItems(rawText);
    
    console.log('📈 Parsing results:', {
      personalInfo: !!personalInfo?.full_name,
      accounts: accounts.length,
      inquiries: inquiries.length,
      negativeItems: negativeItems.length
    });
    
    return {
      personalInfo,
      accounts,
      inquiries,
      negativeItems
    };
  }
  
  /**
   * Extract personal information from text
   */
  private static extractPersonalInfo(text: string): any {
    const info: any = {};
    
    // Name extraction
    const namePatterns = [
      /(?:Name|Consumer Name)[:\s]*([A-Z][a-z\s]+)/i,
      /^([A-Z][A-Z\s]+)$/m
    ];
    
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1] && !info.full_name) {
        info.full_name = match[1].trim();
        break;
      }
    }
    
    // Date of birth
    const dobMatch = text.match(/(?:Date of Birth|DOB)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (dobMatch) {
      info.date_of_birth = dobMatch[1];
    }
    
    // Address
    const addressMatch = text.match(/(?:Address|Current Address)[:\s]*([^\n]+)/i);
    if (addressMatch) {
      info.current_address = { street: addressMatch[1].trim() };
    }
    
    // SSN
    const ssnMatch = text.match(/(?:SSN)[:\s]*(XXX-XX-\d{4}|\*\*\*-\*\*-\d{4})/i);
    if (ssnMatch) {
      info.ssn_partial = ssnMatch[1];
    }
    
    return info;
  }
  
  /**
   * Extract credit accounts
   */
  private static extractAccounts(text: string): any[] {
    const accounts: any[] = [];
    
    // Look for account blocks
    const accountPattern = /([A-Z][a-z\s]+(?:Bank|Card|Credit|Loan)[\s\S]*?)(?=(?:[A-Z][a-z\s]+(?:Bank|Card|Credit|Loan))|$)/gi;
    const matches = text.matchAll(accountPattern);
    
    for (const match of matches) {
      const block = match[1];
      const account = this.parseAccountBlock(block);
      
      if (account.creditor_name && account.creditor_name.length > 2) {
        accounts.push(account);
      }
    }
    
    return accounts;
  }
  
  /**
   * Parse individual account block
   */
  private static parseAccountBlock(block: string): any {
    const account: any = {
      creditor_name: '',
      account_type: 'Other',
      is_negative: false
    };
    
    // Extract creditor name (first meaningful line)
    const lines = block.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      account.creditor_name = lines[0].trim().replace(/^\d+\.\s*/, '');
    }
    
    // Account number
    const accountNumMatch = block.match(/(?:Account Number|Account #)[:\s]*([*\dX-]+)/i);
    if (accountNumMatch) {
      account.account_number = accountNumMatch[1];
    }
    
    // Current balance
    const balanceMatch = block.match(/(?:Current Balance|Balance)[:\s]*\$?([0-9,]+)/i);
    if (balanceMatch) {
      account.current_balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }
    
    // Credit limit
    const limitMatch = block.match(/(?:Credit Limit|Limit)[:\s]*\$?([0-9,]+)/i);
    if (limitMatch) {
      account.credit_limit = parseFloat(limitMatch[1].replace(/,/g, ''));
    }
    
    // Account status
    const statusMatch = block.match(/(?:Payment Status|Status)[:\s]*([A-Za-z\s]+)/i);
    if (statusMatch) {
      account.account_status = statusMatch[1].trim();
    }
    
    // Determine account type
    const creditorLower = account.creditor_name.toLowerCase();
    if (creditorLower.includes('credit card') || creditorLower.includes('card')) {
      account.account_type = 'Credit Card';
    } else if (creditorLower.includes('auto') || creditorLower.includes('car')) {
      account.account_type = 'Auto Loan';
    } else if (creditorLower.includes('mortgage') || creditorLower.includes('home')) {
      account.account_type = 'Mortgage';
    } else if (creditorLower.includes('student')) {
      account.account_type = 'Student Loan';
    }
    
    return account;
  }
  
  /**
   * Extract credit inquiries
   */
  private static extractInquiries(text: string): any[] {
    const inquiries: any[] = [];
    
    const inquiryPattern = /([A-Z][a-z\s]+(?:Bank|Financial|Wireless|Inc|LLC))\s*Date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
    const matches = text.matchAll(inquiryPattern);
    
    for (const match of matches) {
      inquiries.push({
        inquirer_name: match[1].trim(),
        inquiry_date: match[2],
        inquiry_type: 'hard'
      });
    }
    
    return inquiries;
  }
  
  /**
   * Extract negative items
   */
  private static extractNegativeItems(text: string): any[] {
    const negativeItems: any[] = [];
    
    const collectionPattern = /([A-Z][a-z\s]*Collection[s]?)\s*(?:Original Creditor[:\s]*([A-Z][a-z\s]+))?\s*(?:Amount[:\s]*\$?([0-9,]+))?/gi;
    const matches = text.matchAll(collectionPattern);
    
    for (const match of matches) {
      negativeItems.push({
        negative_type: 'Collection',
        description: `${match[1]}${match[2] ? ` - ${match[2]}` : ''}`,
        amount: match[3] ? parseFloat(match[3].replace(/,/g, '')) : null
      });
    }
    
    return negativeItems;
  }
  
  /**
   * Store parsed data in database
   */
  private static async storeParsedData(reportId: string, data: any): Promise<void> {
    try {
      // Store personal information
      if (data.personalInfo && data.personalInfo.full_name) {
        await supabase.from('personal_information').upsert({
          report_id: reportId,
          ...data.personalInfo
        });
      }
      
      // Store accounts
      if (data.accounts.length > 0) {
        const accountsWithReportId = data.accounts.map(account => ({
          report_id: reportId,
          ...account
        }));
        
        await supabase.from('credit_accounts').upsert(accountsWithReportId);
      }
      
      // Store inquiries
      if (data.inquiries.length > 0) {
        const inquiriesWithReportId = data.inquiries.map(inquiry => ({
          report_id: reportId,
          ...inquiry
        }));
        
        await supabase.from('credit_inquiries').upsert(inquiriesWithReportId);
      }
      
      // Store negative items
      if (data.negativeItems.length > 0) {
        const negativeItemsWithReportId = data.negativeItems.map(item => ({
          report_id: reportId,
          ...item
        }));
        
        await supabase.from('negative_items').upsert(negativeItemsWithReportId);
      }
      
      console.log('✅ All data stored successfully');
    } catch (error) {
      console.error('❌ Error storing data:', error);
      throw error;
    }
  }
}
