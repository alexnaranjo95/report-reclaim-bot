import { supabase } from '@/integrations/supabase/client';

export interface ParsedCreditData {
  personalInfo?: {
    fullName?: string;
    dateOfBirth?: string;
    ssn?: string;
    currentAddress?: any;
    previousAddresses?: any[];
    phoneNumbers?: string[];
    employerInfo?: any;
  };
  scores?: Array<{
    bureau: string;
    score: number;
    date?: string;
  }>;
  accounts?: Array<{
    creditorName: string;
    accountNumber: string;
    accountType: string;
    accountStatus: string;
    balance?: number;
    creditLimit?: number;
    paymentStatus?: string;
    openedDate?: string;
    closedDate?: string;
    lastPaymentDate?: string;
  }>;
  inquiries?: Array<{
    creditorName: string;
    inquiryDate: string;
    inquiryType: string;
  }>;
  publicRecords?: Array<{
    type: string;
    filedDate: string;
    status: string;
    amount?: number;
  }>;
}

/**
 * Unified Credit Parser - Single source of truth for credit report parsing
 * Consolidates logic from ComprehensiveCreditParser, EnhancedCreditParser, and EnhancedCreditParserV2
 */
export class UnifiedCreditParser {
  private static readonly BUREAUS = ['TransUnion', 'Experian', 'Equifax'] as const;
  
  /**
   * Main entry point for parsing credit reports
   */
  static async parse(
    reportId: string, 
    rawText?: string
  ): Promise<{ success: boolean; data?: ParsedCreditData; error?: string }> {
    try {
      // Get raw text if not provided
      if (!rawText) {
        const { data: report, error } = await supabase
          .from('credit_reports')
          .select('raw_text')
          .eq('id', reportId)
          .single();
        
        if (error || !report?.raw_text) {
          throw new Error('No raw text found for report');
        }
        
        rawText = report.raw_text;
      }
      
      // Parse the text
      const parsedData = this.parseText(rawText);
      
      // Store in database
      await this.storeData(reportId, parsedData);
      
      // Update report status
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'completed',
          processing_errors: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
      
      return { success: true, data: parsedData };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update report with error
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          processing_errors: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
      
      return { success: false, error: errorMessage };
    }
  }
  
  /**
   * Parse raw text into structured data
   */
  private static parseText(text: string): ParsedCreditData {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    
    return {
      personalInfo: this.extractPersonalInfo(normalizedText),
      scores: this.extractScores(normalizedText),
      accounts: this.extractAccounts(normalizedText),
      inquiries: this.extractInquiries(normalizedText),
      publicRecords: this.extractPublicRecords(normalizedText)
    };
  }
  
  /**
   * Extract personal information
   */
  private static extractPersonalInfo(text: string): ParsedCreditData['personalInfo'] {
    const info: ParsedCreditData['personalInfo'] = {};
    
    // Name extraction
    const namePattern = /(?:Name|Consumer Name)[:\s]+([A-Z][A-Z\s'-]+)/i;
    const nameMatch = text.match(namePattern);
    if (nameMatch) {
      info.fullName = nameMatch[1].trim();
    }
    
    // DOB extraction
    const dobPattern = /(?:Date of Birth|DOB)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i;
    const dobMatch = text.match(dobPattern);
    if (dobMatch) {
      info.dateOfBirth = dobMatch[1];
    }
    
    // SSN extraction (last 4 only)
    const ssnPattern = /(?:SSN|Social Security)[:\s]+(?:XXX-XX-|XXXX|[\*]{4,})(\d{4})/i;
    const ssnMatch = text.match(ssnPattern);
    if (ssnMatch) {
      info.ssn = ssnMatch[1];
    }
    
    // Address extraction
    const addressPattern = /(?:Current Address|Address)[:\s]+([^,\n]+,\s*[A-Z]{2}\s+\d{5})/i;
    const addressMatch = text.match(addressPattern);
    if (addressMatch) {
      info.currentAddress = { address: addressMatch[1].trim() };
    }
    
    return info;
  }
  
  /**
   * Extract credit scores
   */
  private static extractScores(text: string): ParsedCreditData['scores'] {
    const scores: ParsedCreditData['scores'] = [];
    const scorePattern = /(Experian|Equifax|TransUnion)[^0-9]*(\d{3})(?:\s|$)/gi;
    
    let match;
    while ((match = scorePattern.exec(text)) !== null) {
      const score = parseInt(match[2]);
      if (score >= 300 && score <= 850) {
        scores.push({
          bureau: match[1],
          score: score
        });
      }
    }
    
    return scores;
  }
  
  /**
   * Extract credit accounts
   */
  private static extractAccounts(text: string): ParsedCreditData['accounts'] {
    const accounts: ParsedCreditData['accounts'] = [];
    
    // Simple pattern matching for common account patterns
    const accountSections = text.split(/(?:Account|Trade)\s+(?:Information|Details)/i);
    
    for (const section of accountSections.slice(1)) {
      const lines = section.split('\n').slice(0, 20); // Limit to first 20 lines
      
      const account: any = {};
      
      for (const line of lines) {
        // Creditor name
        if (line.includes('Creditor:') || line.includes('Company:')) {
          account.creditorName = line.split(':')[1]?.trim();
        }
        
        // Account number
        if (line.includes('Account:') || line.includes('Number:')) {
          account.accountNumber = line.split(':')[1]?.trim()?.replace(/[X*]/g, '');
        }
        
        // Account type
        if (line.includes('Type:')) {
          account.accountType = line.split(':')[1]?.trim();
        }
        
        // Status
        if (line.includes('Status:')) {
          account.accountStatus = line.split(':')[1]?.trim();
        }
        
        // Balance
        const balanceMatch = line.match(/Balance[:\s]+\$?([\d,]+)/i);
        if (balanceMatch) {
          account.balance = parseInt(balanceMatch[1].replace(/,/g, ''));
        }
      }
      
      if (account.creditorName) {
        accounts.push(account);
      }
    }
    
    return accounts;
  }
  
  /**
   * Extract inquiries
   */
  private static extractInquiries(text: string): ParsedCreditData['inquiries'] {
    const inquiries: ParsedCreditData['inquiries'] = [];
    
    const inquirySection = text.match(/Inquiries[^]*?(?:Public Records|$)/i)?.[0] || '';
    const inquiryLines = inquirySection.split('\n');
    
    for (const line of inquiryLines) {
      const dateMatch = line.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/);
      if (dateMatch) {
        const creditorMatch = line.match(/([A-Z][A-Za-z\s&]+?)(?:\s+\d|$)/);
        if (creditorMatch) {
          inquiries.push({
            creditorName: creditorMatch[1].trim(),
            inquiryDate: dateMatch[1],
            inquiryType: line.includes('Hard') ? 'Hard' : 'Soft'
          });
        }
      }
    }
    
    return inquiries;
  }
  
  /**
   * Extract public records
   */
  private static extractPublicRecords(text: string): ParsedCreditData['publicRecords'] {
    const records: ParsedCreditData['publicRecords'] = [];
    
    const recordTypes = ['Bankruptcy', 'Tax Lien', 'Judgment', 'Collection'];
    
    for (const type of recordTypes) {
      const pattern = new RegExp(`${type}[^]*?(?:Filed|Date)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})`, 'gi');
      let match;
      
      while ((match = pattern.exec(text)) !== null) {
        records.push({
          type: type,
          filedDate: match[1],
          status: 'Active'
        });
      }
    }
    
    return records;
  }
  
  /**
   * Store parsed data in database
   */
  private static async storeData(reportId: string, data: ParsedCreditData): Promise<void> {
    const promises = [];
    
    // Store personal info
    if (data.personalInfo && Object.keys(data.personalInfo).length > 0) {
      promises.push(
        supabase
          .from('personal_information')
          .upsert({
            report_id: reportId,
            full_name: data.personalInfo.fullName,
            date_of_birth: data.personalInfo.dateOfBirth,
            ssn_partial: data.personalInfo.ssn,
            current_address: data.personalInfo.currentAddress,
            previous_addresses: data.personalInfo.previousAddresses || [],
            phone_numbers: data.personalInfo.phoneNumbers || [],
            employer_info: data.personalInfo.employerInfo
          })
      );
    }
    
    // Store accounts
    if (data.accounts && data.accounts.length > 0) {
      const accountsData = data.accounts.map(account => ({
        report_id: reportId,
        creditor_name: account.creditorName,
        account_number: account.accountNumber,
        account_type: account.accountType,
        account_status: account.accountStatus,
        current_balance: account.balance,
        credit_limit: account.creditLimit,
        payment_status: account.paymentStatus,
        date_opened: account.openedDate,
        date_closed: account.closedDate,
        last_payment_date: account.lastPaymentDate
      }));
      
      promises.push(
        supabase
          .from('credit_accounts')
          .insert(accountsData)
      );
    }
    
    // Store inquiries
    if (data.inquiries && data.inquiries.length > 0) {
      const inquiriesData = data.inquiries.map(inquiry => ({
        report_id: reportId,
        creditor_name: inquiry.creditorName,
        inquiry_date: inquiry.inquiryDate,
        inquiry_type: inquiry.inquiryType
      }));
      
      promises.push(
        supabase
          .from('credit_inquiries')
          .insert(inquiriesData)
      );
    }
    
    await Promise.all(promises);
  }
}