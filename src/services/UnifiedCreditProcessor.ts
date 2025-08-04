
import { supabase } from '@/integrations/supabase/client';

/**
 * Unified Credit Report Processing Service with Amazon Textract Integration
 * Handles the complete workflow from PDF upload to parsed data display
 */
export class UnifiedCreditProcessor {
  
  /**
   * STRICT processing - only real extracted data allowed
   */
  static async processReport(reportId: string): Promise<{
    success: boolean;
    personalInfo: any;
    accounts: any[];
    inquiries: any[];
    negativeItems: any[];
    errors: string[];
  }> {
    console.log('🚀 Starting STRICT unified credit report processing for:', reportId);
    
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
      
      // Step 2: MANDATORY extraction - no bypassing
      console.log('📄 Starting mandatory text extraction...');
      await this.triggerStrictTextractExtraction(reportId, report.file_path);
      
      // Wait for extraction to complete with validation
      await this.waitForStrictExtraction(reportId);
      
      // Step 3: Get ONLY validated parsed data  
      const validatedData = await this.getValidatedData(reportId);
      
      if (!validatedData.hasValidData) {
        throw new Error('No valid credit report data was extracted and parsed');
      }
      
      console.log('✅ Processing successful:', {
        personalInfo: validatedData.personalInfo,
        accounts: validatedData.accounts,
        inquiries: validatedData.inquiries,
        negativeItems: validatedData.negativeItems
      });
      
      return {
        success: true,
        personalInfo: validatedData.personalInfo,
        accounts: validatedData.accounts,
        inquiries: validatedData.inquiries,
        negativeItems: validatedData.negativeItems,
        errors
      };
      
    } catch (error) {
      console.error('❌ STRICT Processing failed:', error);
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
   * Trigger STRICT Textract extraction with validation
   */
  private static async triggerStrictTextractExtraction(reportId: string, filePath: string): Promise<void> {
    try {
      console.log('🚀 Triggering STRICT Amazon Textract extraction...');
      
      // Import the strict extraction service
      const { PDFExtractionService } = await import('./PDFExtractionService');
      await PDFExtractionService.extractText(reportId);
      
      console.log('✅ Strict Textract extraction completed');
    } catch (error) {
      console.error('❌ Failed strict extraction:', error);
      throw new Error(`Strict text extraction failed: ${error.message}`);
    }
  }
  
  /**
   * Wait for STRICT extraction to complete with validation
   */
  private static async waitForStrictExtraction(reportId: string, maxWaitTime = 60000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const { data: report } = await supabase
        .from('credit_reports')
        .select('extraction_status, raw_text, processing_errors')
        .eq('id', reportId)
        .single();
        
      if (report?.extraction_status === 'completed' && report.raw_text) {
        // Additional validation: Check if we have actual parsed data
        const { PDFExtractionService } = await import('./PDFExtractionService');
        const validatedData = await PDFExtractionService.validateParsedData(reportId);
        
        if (validatedData.hasValidData) {
          console.log('✅ Strict extraction completed with valid data');
          return;
        } else {
          throw new Error('Extraction completed but no valid credit data was parsed');
        }
      }
      
      if (report?.extraction_status === 'failed') {
        throw new Error(`Text extraction failed: ${report.processing_errors || 'Unknown error'}`);
      }
      
      // Wait 3 seconds before checking again (longer for thorough processing)
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    throw new Error('Strict extraction timeout - processing took too long');
  }
  
  /**
   * Get VALIDATED data only - ensures data quality
   */
  private static async getValidatedData(reportId: string): Promise<{
    hasValidData: boolean;
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
      
      // STRICT validation: Must have meaningful personal info OR valid accounts
      const hasValidPersonalInfo = !!(personalInfo?.full_name && personalInfo.full_name.length > 2);
      const hasValidAccounts = accounts.length > 0 && accounts.some(acc => 
        acc.creditor_name && 
        acc.creditor_name.length > 2 && 
        !acc.creditor_name.toLowerCase().includes('test') &&
        !acc.creditor_name.toLowerCase().includes('sample')
      );
      
      const hasValidData = hasValidPersonalInfo || hasValidAccounts;
      
      if (!hasValidData) {
        console.log('❌ No valid data found:', {
          personalInfoValid: hasValidPersonalInfo,
          accountsValid: hasValidAccounts,
          personalInfoName: personalInfo?.full_name,
          accountsCount: accounts.length
        });
      }
      
      return {
        hasValidData,
        personalInfo,
        accounts,
        inquiries,
        negativeItems
      };
    } catch (error) {
      console.error('Error getting validated data:', error);
      return {
        hasValidData: false,
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
