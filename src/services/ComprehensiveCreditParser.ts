import { supabase } from '@/integrations/supabase/client';

export interface ComprehensivePersonalInfo {
  full_name?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;
  ssn_partial?: string;
  date_of_birth?: string;
  current_address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    full_address?: string;
  };
  previous_addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    full_address?: string;
    date_reported?: string;
  }>;
  phone_numbers?: string[];
  employment_current?: {
    employer?: string;
    position?: string;
    income?: number;
    date_hired?: string;
  };
  employment_previous?: Array<{
    employer?: string;
    position?: string;
    dates?: string;
  }>;
}

export interface ComprehensiveCreditAccount {
  creditor_name: string;
  account_number?: string;
  account_type?: string;
  responsibility_type?: string; // Individual, Joint, Authorized User
  bureau_reporting?: string[];
  account_status?: string;
  payment_status?: string;
  date_opened?: string;
  date_closed?: string;
  date_last_activity?: string;
  current_balance?: number;
  credit_limit?: number;
  monthly_payment?: number;
  high_credit?: number;
  past_due_amount?: number;
  days_past_due?: number;
  utilization_percentage?: number;
  payment_history?: {
    [month: string]: 'current' | '30' | '60' | '90' | '120+' | 'no_data';
  };
  account_remarks?: string;
  is_negative?: boolean;
  last_payment_date?: string;
  last_payment_amount?: number;
}

export interface CreditInquiry {
  inquirer_name: string;
  inquiry_date?: string;
  inquiry_type?: 'hard' | 'soft';
  bureau?: string;
  purpose?: string;
}

export interface NegativeItem {
  item_type: 'collection' | 'charge_off' | 'late_payment' | 'bankruptcy' | 'foreclosure' | 'tax_lien' | 'judgment';
  creditor_name: string;
  original_creditor?: string;
  collection_agency?: string;
  account_number?: string;
  amount?: number;
  date_occurred?: string;
  date_reported?: string;
  status?: string;
  bureau_reporting?: string[];
  dispute_status?: 'disputable' | 'disputed' | 'verified' | 'removed';
  severity_score?: number; // 1-10 impact rating
  description?: string;
  balance?: number;
  collection_date?: string;
}

export interface CreditScore {
  score_type: string; // FICO 8, FICO 9, VantageScore 3.0, etc.
  score_value: number;
  bureau: string;
  score_date?: string;
  score_factors?: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    description?: string;
  }>;
  score_range?: {
    min: number;
    max: number;
  };
}

export interface PaymentHistoryDetail {
  account_id: string;
  payment_date: string;
  payment_status: 'current' | '30' | '60' | '90' | '120+';
  days_late?: number;
  payment_amount?: number;
  balance_after_payment?: number;
  bureau_reporting?: string;
  remarks?: string;
}

export interface ComprehensiveParsingResult {
  report_id: string;
  bureau: string;
  personal_info: ComprehensivePersonalInfo;
  credit_accounts: ComprehensiveCreditAccount[];
  negative_items: NegativeItem[];
  credit_inquiries: CreditInquiry[];
  credit_scores: CreditScore[];
  payment_history: PaymentHistoryDetail[];
  account_summary: {
    total_accounts: number;
    open_accounts: number;
    closed_accounts: number;
    negative_accounts: number;
    total_credit_limit: number;
    total_balance: number;
    total_available_credit: number;
    overall_utilization: number;
  };
  parsing_confidence: number;
  extraction_errors: string[];
}

export class ComprehensiveCreditParser {
  /**
   * Main comprehensive parsing function
   */
  static async parseReport(reportId: string): Promise<ComprehensiveParsingResult> {
    console.log('Starting comprehensive credit report parsing for:', reportId);

    // Get the report with raw text
    const { data: report, error } = await supabase
      .from('credit_reports')
      .select('raw_text, bureau_name, file_name')
      .eq('id', reportId)
      .single();

    if (error || !report.raw_text) {
      throw new Error('No text data found for comprehensive parsing');
    }

    const rawText = report.raw_text;
    const extraction_errors: string[] = [];

    try {
      // Enhanced section parsing with better pattern recognition
      const sections = this.parseEnhancedSections(rawText);
      
      // Comprehensive personal information extraction
      const personal_info = this.parseComprehensivePersonalInfo(sections.personal_info || rawText);
      
      // Advanced credit accounts parsing with payment history
      const credit_accounts = this.parseComprehensiveCreditAccounts(sections.accounts || rawText, report.bureau_name);
      
      // Negative items detection and categorization
      const negative_items = this.parseNegativeItems(rawText, credit_accounts);
      
      // Credit inquiries with type detection
      const credit_inquiries = this.parseCreditInquiries(sections.inquiries || rawText);
      
      // Credit scores extraction (all available)
      const credit_scores = this.parseCreditScores(rawText);
      
      // Detailed payment history extraction
      const payment_history = this.parsePaymentHistory(credit_accounts, rawText);
      
      // Calculate comprehensive account summary
      const account_summary = this.calculateAccountSummary(credit_accounts);
      
      // Calculate parsing confidence based on data completeness
      const parsing_confidence = this.calculateComprehensiveConfidence(
        personal_info, 
        credit_accounts, 
        negative_items, 
        credit_scores
      );

      // Store all comprehensive data
      await this.storeComprehensiveData(reportId, {
        personal_info,
        credit_accounts,
        negative_items,
        credit_inquiries,
        credit_scores,
        payment_history
      });

      const result: ComprehensiveParsingResult = {
        report_id: reportId,
        bureau: report.bureau_name,
        personal_info,
        credit_accounts,
        negative_items,
        credit_inquiries,
        credit_scores,
        payment_history,
        account_summary,
        parsing_confidence,
        extraction_errors
      };

      console.log('Comprehensive parsing completed:', {
        accounts: credit_accounts.length,
        negativeItems: negative_items.length,
        inquiries: credit_inquiries.length,
        scores: credit_scores.length,
        confidence: parsing_confidence
      });

      return result;

    } catch (error) {
      console.error('Comprehensive parsing error:', error);
      extraction_errors.push(error.message);
      throw error;
    }
  }

  /**
   * Enhanced section parsing with better pattern recognition
   */
  static parseEnhancedSections(rawText: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const text = rawText.toLowerCase();
    
    const enhancedPatterns = {
      personal_info: [
        'personal information',
        'consumer information', 
        'personal data',
        'identification information',
        'consumer identification',
        'personal profile',
        'identity verification'
      ],
      accounts: [
        'account information',
        'credit accounts',
        'tradeline information',
        'credit history',
        'account details',
        'credit information',
        'account summary',
        'trade accounts'
      ],
      inquiries: [
        'inquiries',
        'credit inquiries',
        'inquiry information',
        'credit requests',
        'requests for credit history'
      ],
      scores: [
        'credit score',
        'fico score',
        'vantagescore',
        'score information',
        'credit rating',
        'score factors'
      ],
      negative_items: [
        'public records',
        'collections',
        'negative accounts',
        'derogatory information',
        'adverse information'
      ]
    };

    // Extract sections with improved boundary detection
    Object.entries(enhancedPatterns).forEach(([sectionName, patterns]) => {
      patterns.forEach(pattern => {
        const index = text.indexOf(pattern);
        if (index !== -1) {
          const startIndex = Math.max(0, index - 50); // Include some context before
          const nextSectionIndex = this.findNextSection(text, index + pattern.length, Object.values(enhancedPatterns).flat());
          const endIndex = nextSectionIndex !== -1 ? nextSectionIndex : text.length;
          
          const sectionContent = rawText.substring(startIndex, endIndex).trim();
          if (sectionContent.length > 100) { // Higher threshold for meaningful content
            sections[sectionName] = sectionContent;
          }
        }
      });
    });

    return sections;
  }

  /**
   * Comprehensive personal information parsing
   */
  static parseComprehensivePersonalInfo(text: string): ComprehensivePersonalInfo {
    const info: ComprehensivePersonalInfo = {};

    // Enhanced name parsing
    const namePatterns = [
      /(?:name|consumer name|legal name):?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]*)*(?:\s+(?:JR|SR|II|III|IV))?)/i,
      /^([A-Z][A-Z\s]+)$/m // All caps name
    ];

    namePatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && match[1] && !info.full_name) {
        const fullName = match[1].trim();
        info.full_name = fullName;
        
        // Parse name components
        const nameParts = fullName.split(/\s+/);
        if (nameParts.length >= 2) {
          info.first_name = nameParts[0];
          info.last_name = nameParts[nameParts.length - 1];
          if (nameParts.length > 2) {
            info.middle_name = nameParts.slice(1, -1).join(' ');
          }
        }
      }
    });

    // Enhanced SSN parsing
    const ssnPatterns = [
      /(?:ssn|social security|ss#):?\s*(?:\*\*\*-\*\*-|XXX-XX-|###-##-)(\d{4})/i,
      /(?:\*{3}-\*{2}-|X{3}-X{2}-)(\d{4})/
    ];
    
    ssnPatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && !info.ssn_partial) {
        info.ssn_partial = `***-**-${match[1]}`;
      }
    });

    // Enhanced date of birth parsing
    const dobPatterns = [
      /(?:date of birth|birth date|dob|born):?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /(?:birth):?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ];

    dobPatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && !info.date_of_birth) {
        info.date_of_birth = match[1];
      }
    });

    // Enhanced address parsing
    const addressPatterns = [
      /(?:current address|address|residence):?\s*([^:\n]+(?:\n[^:\n]+)*?)(?:\n\n|\n(?:[A-Z][a-z]+:)|$)/i,
      /(\d+\s+[^,\n]+,\s*[^,\n]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/i
    ];

    addressPatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && !info.current_address) {
        const addressText = match[1].trim();
        info.current_address = {
          full_address: addressText
        };
        
        // Parse address components
        const addressParts = addressText.split(',');
        if (addressParts.length >= 3) {
          info.current_address.street = addressParts[0].trim();
          info.current_address.city = addressParts[1].trim();
          const stateZip = addressParts[2].trim().match(/([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
          if (stateZip) {
            info.current_address.state = stateZip[1];
            info.current_address.zip = stateZip[2];
          }
        }
      }
    });

    // Phone number extraction
    const phonePatterns = [
      /(?:phone|telephone|tel):?\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/gi
    ];
    
    info.phone_numbers = [];
    phonePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && !info.phone_numbers!.includes(match[1])) {
          info.phone_numbers!.push(match[1]);
        }
      }
    });

    // Employment information
    const employmentPatterns = [
      /(?:employer|employment|occupation):?\s*([^:\n]+)/i,
      /(?:income|salary):?\s*\$?([\d,]+)/i
    ];

    employmentPatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && match[0].toLowerCase().includes('employer')) {
        info.employment_current = { employer: match[1].trim() };
      }
      if (match && match[0].toLowerCase().includes('income')) {
        if (!info.employment_current) info.employment_current = {};
        info.employment_current.income = parseInt(match[1].replace(/,/g, ''));
      }
    });

    return info;
  }

  /**
   * Comprehensive credit accounts parsing with payment history
   */
  static parseComprehensiveCreditAccounts(text: string, bureau: string): ComprehensiveCreditAccount[] {
    const accounts: ComprehensiveCreditAccount[] = [];
    
    // Split into account blocks with better boundary detection
    const accountBlocks = this.splitIntoAccountBlocks(text, bureau);
    
    accountBlocks.forEach(block => {
      const account = this.parseAdvancedAccountBlock(block, bureau);
      if (account.creditor_name && account.creditor_name.length > 2) {
        accounts.push(account);
      }
    });

    return accounts;
  }

  /**
   * Parse individual account block with comprehensive data extraction
   */
  static parseAdvancedAccountBlock(block: string, bureau: string): ComprehensiveCreditAccount {
    const account: ComprehensiveCreditAccount = {
      creditor_name: '',
      is_negative: false,
      bureau_reporting: [bureau]
    };

    // Enhanced creditor name extraction
    const creditorPatterns = [
      /^([A-Z][A-Z\s&]+?)(?:\s+(?:BANK|CARD|CREDIT|LOAN|MORTGAGE))?/m,
      /(?:creditor|company):?\s*([A-Z][^:\n]+)/i,
      /([A-Z][A-Z\s&]+)/
    ];

    creditorPatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && match[1] && !account.creditor_name) {
        account.creditor_name = match[1].trim().replace(/\s+/g, ' ');
      }
    });

    // Account number extraction with various formats
    const accountPatterns = [
      /(?:account number|acct#|account #):?\s*([*\dX-]+)/i,
      /(?:number):?\s*([*\dX-]+)/i,
      /(\*+\d{4})/
    ];

    accountPatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.account_number) {
        account.account_number = match[1];
      }
    });

    // Account type detection
    const typePatterns = [
      /(?:type|account type):?\s*([^:\n]+)/i,
      /(credit card|mortgage|auto loan|personal loan|student loan|installment|revolving|line of credit)/i
    ];

    typePatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.account_type) {
        account.account_type = match[1].trim();
      }
    });

    // Status extraction
    const statusPatterns = [
      /(?:status|account status):?\s*([^:\n]+)/i,
      /(open|closed|paid|collection|charge.?off|current|delinquent)/i
    ];

    statusPatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.account_status) {
        account.account_status = match[1].trim();
        // Determine if negative
        if (/collection|charge.?off|delinquent|120\+/i.test(match[1])) {
          account.is_negative = true;
        }
      }
    });

    // Date extraction
    const datePatterns = [
      /(?:date opened|opened):?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /(?:date closed|closed):?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /(?:last activity):?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    ];

    datePatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match) {
        if (match[0].toLowerCase().includes('opened') && !account.date_opened) {
          account.date_opened = match[1];
        } else if (match[0].toLowerCase().includes('closed') && !account.date_closed) {
          account.date_closed = match[1];
        } else if (match[0].toLowerCase().includes('activity') && !account.date_last_activity) {
          account.date_last_activity = match[1];
        }
      }
    });

    // Balance and limit extraction
    const moneyPatterns = [
      /(?:current balance|balance):?\s*\$?([\d,]+)/i,
      /(?:credit limit|limit):?\s*\$?([\d,]+)/i,
      /(?:high credit):?\s*\$?([\d,]+)/i,
      /(?:monthly payment|payment):?\s*\$?([\d,]+)/i,
      /(?:past due):?\s*\$?([\d,]+)/i
    ];

    moneyPatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match) {
        const amount = parseInt(match[1].replace(/,/g, ''));
        if (match[0].toLowerCase().includes('balance') && !account.current_balance) {
          account.current_balance = amount;
        } else if (match[0].toLowerCase().includes('limit') && !account.credit_limit) {
          account.credit_limit = amount;
        } else if (match[0].toLowerCase().includes('high') && !account.high_credit) {
          account.high_credit = amount;
        } else if (match[0].toLowerCase().includes('payment') && !account.monthly_payment) {
          account.monthly_payment = amount;
        } else if (match[0].toLowerCase().includes('past due') && !account.past_due_amount) {
          account.past_due_amount = amount;
        }
      }
    });

    // Calculate utilization if possible
    if (account.current_balance && account.credit_limit && account.credit_limit > 0) {
      account.utilization_percentage = Math.round((account.current_balance / account.credit_limit) * 100);
    }

    // Payment history pattern detection
    const paymentHistoryMatch = block.match(/payment history:?\s*([^\n]+)/i);
    if (paymentHistoryMatch) {
      account.payment_history = this.parsePaymentHistoryString(paymentHistoryMatch[1]);
    }

    return account;
  }

  /**
   * Parse negative items with categorization
   */
  static parseNegativeItems(text: string, accounts: ComprehensiveCreditAccount[]): NegativeItem[] {
    const negativeItems: NegativeItem[] = [];

    // Add negative accounts as negative items
    accounts.forEach(account => {
      if (account.is_negative) {
        negativeItems.push({
          item_type: this.categorizeNegativeItem(account.account_status || ''),
          creditor_name: account.creditor_name,
          account_number: account.account_number,
          amount: account.current_balance || account.past_due_amount,
          date_occurred: account.date_last_activity || account.date_opened,
          status: account.account_status,
          bureau_reporting: account.bureau_reporting,
          severity_score: this.calculateSeverityScore(account),
          description: `${account.account_type || 'Account'} with ${account.creditor_name}`
        });
      }
    });

    // Parse collections section
    const collectionsPattern = /collections?:?\s*(.*?)(?:\n\n|\nACCOUNT|\nINQUIRIES|$)/is;
    const collectionsMatch = text.match(collectionsPattern);
    if (collectionsMatch) {
      const collectionsText = collectionsMatch[1];
      const collectionBlocks = collectionsText.split(/\n(?=[A-Z])/);
      
      collectionBlocks.forEach(block => {
        const collection = this.parseCollectionBlock(block);
        if (collection) {
          negativeItems.push(collection);
        }
      });
    }

    return negativeItems;
  }

  /**
   * Parse credit inquiries with enhanced detection
   */
  static parseCreditInquiries(text: string): CreditInquiry[] {
    const inquiries: CreditInquiry[] = [];
    
    const inquiryPatterns = [
      /([A-Z][A-Z\s&]+?)\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g,
      /(?:inquirer|company):?\s*([^:\n]+)\s+(?:date|on):?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/gi
    ];

    inquiryPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[2]) {
          inquiries.push({
            inquirer_name: match[1].trim(),
            inquiry_date: match[2],
            inquiry_type: this.determineInquiryType(match[1])
          });
        }
      }
    });

    return inquiries;
  }

  /**
   * Parse credit scores from all sections
   */
  static parseCreditScores(text: string): CreditScore[] {
    const scores: CreditScore[] = [];
    
    const scorePatterns = [
      /(?:fico|score):?\s*(\d{3})/gi,
      /(?:vantagescore|vantage):?\s*(\d{3})/gi,
      /(?:credit score):?\s*(\d{3})/gi
    ];

    scorePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const scoreValue = parseInt(match[1]);
        if (scoreValue >= 300 && scoreValue <= 850) {
          scores.push({
            score_type: this.determineScoreType(match[0]),
            score_value: scoreValue,
            bureau: 'Unknown', // Would be determined from context
            score_range: { min: 300, max: 850 }
          });
        }
      }
    });

    return scores;
  }

  // Helper functions
  static findNextSection(text: string, fromIndex: number, patterns: string[]): number {
    let nextIndex = -1;
    patterns.forEach(pattern => {
      const index = text.indexOf(pattern, fromIndex + 200);
      if (index !== -1 && (nextIndex === -1 || index < nextIndex)) {
        nextIndex = index;
      }
    });
    return nextIndex;
  }

  static splitIntoAccountBlocks(text: string, bureau: string): string[] {
    // Bureau-specific splitting logic
    let blocks: string[] = [];
    
    if (bureau === 'Equifax') {
      blocks = text.split(/\n(?=[A-Z\s]{5,}(?:BANK|CARD|CREDIT|LOAN|MORTGAGE))/);
    } else if (bureau === 'Experian') {
      blocks = text.split(/\n\s*\n(?=\S)/);
    } else {
      blocks = text.split(/\n\s*\n|(?=(?:ACCOUNT|Account)\s*(?:Number|#))/);
    }
    
    return blocks.filter(block => block.trim().length > 100);
  }

  static parsePaymentHistoryString(historyStr: string): { [month: string]: 'current' | '30' | '60' | '90' | '120+' | 'no_data' } {
    const history: { [month: string]: 'current' | '30' | '60' | '90' | '120+' | 'no_data' } = {};
    // Parse payment history codes (0=current, 1=30days late, etc.)
    // This would be implemented based on actual credit report formats
    return history;
  }

  static categorizeNegativeItem(status: string): NegativeItem['item_type'] {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('collection')) return 'collection';
    if (lowerStatus.includes('charge')) return 'charge_off';
    if (lowerStatus.includes('late') || lowerStatus.includes('delinquent')) return 'late_payment';
    if (lowerStatus.includes('bankruptcy')) return 'bankruptcy';
    if (lowerStatus.includes('foreclosure')) return 'foreclosure';
    if (lowerStatus.includes('lien')) return 'tax_lien';
    if (lowerStatus.includes('judgment')) return 'judgment';
    return 'collection'; // default
  }

  static calculateSeverityScore(account: ComprehensiveCreditAccount): number {
    let score = 5; // base score
    if (account.account_status?.toLowerCase().includes('collection')) score += 3;
    if (account.account_status?.toLowerCase().includes('charge')) score += 4;
    if (account.past_due_amount && account.past_due_amount > 1000) score += 2;
    return Math.min(score, 10);
  }

  static parseCollectionBlock(block: string): NegativeItem | null {
    // Parse individual collection account block
    const creditorMatch = block.match(/([A-Z][^:\n]+)/);
    if (!creditorMatch) return null;

    return {
      item_type: 'collection',
      creditor_name: creditorMatch[1].trim(),
      severity_score: 7 // Collections are typically high severity
    };
  }

  static determineInquiryType(inquirerName: string): 'hard' | 'soft' {
    const softInquirers = ['experian', 'equifax', 'transunion', 'credit karma', 'mint'];
    return softInquirers.some(name => inquirerName.toLowerCase().includes(name)) ? 'soft' : 'hard';
  }

  static determineScoreType(scoreText: string): string {
    if (scoreText.toLowerCase().includes('fico')) return 'FICO';
    if (scoreText.toLowerCase().includes('vantage')) return 'VantageScore';
    return 'Credit Score';
  }

  static parsePaymentHistory(accounts: ComprehensiveCreditAccount[], text: string): PaymentHistoryDetail[] {
    // Extract detailed payment history from accounts
    const paymentHistory: PaymentHistoryDetail[] = [];
    // Implementation would parse payment patterns from the raw text
    return paymentHistory;
  }

  static calculateAccountSummary(accounts: ComprehensiveCreditAccount[]) {
    const openAccounts = accounts.filter(a => a.account_status?.toLowerCase() !== 'closed');
    const totalCreditLimit = accounts.reduce((sum, a) => sum + (a.credit_limit || 0), 0);
    const totalBalance = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

    return {
      total_accounts: accounts.length,
      open_accounts: openAccounts.length,
      closed_accounts: accounts.length - openAccounts.length,
      negative_accounts: accounts.filter(a => a.is_negative).length,
      total_credit_limit: totalCreditLimit,
      total_balance: totalBalance,
      total_available_credit: totalCreditLimit - totalBalance,
      overall_utilization: totalCreditLimit > 0 ? Math.round((totalBalance / totalCreditLimit) * 100) : 0
    };
  }

  static calculateComprehensiveConfidence(
    personalInfo: ComprehensivePersonalInfo,
    accounts: ComprehensiveCreditAccount[],
    negativeItems: NegativeItem[],
    scores: CreditScore[]
  ): number {
    let confidence = 0;
    
    // Personal info completeness (25%)
    if (personalInfo.full_name) confidence += 5;
    if (personalInfo.date_of_birth) confidence += 5;
    if (personalInfo.current_address) confidence += 5;
    if (personalInfo.ssn_partial) confidence += 5;
    if (personalInfo.phone_numbers?.length) confidence += 5;
    
    // Accounts data quality (50%)
    if (accounts.length > 0) confidence += 10;
    const accountsWithBalance = accounts.filter(a => a.current_balance !== undefined);
    if (accountsWithBalance.length > 0) confidence += 10;
    const accountsWithDates = accounts.filter(a => a.date_opened);
    if (accountsWithDates.length > 0) confidence += 15;
    const accountsWithStatus = accounts.filter(a => a.account_status);
    if (accountsWithStatus.length > 0) confidence += 15;
    
    // Negative items detection (15%)
    if (negativeItems.length > 0) confidence += 15;
    
    // Credit scores (10%)
    if (scores.length > 0) confidence += 10;
    
    return Math.min(confidence, 100);
  }

  /**
   * Store comprehensive data in enhanced database tables
   */
  static async storeComprehensiveData(reportId: string, data: any): Promise<void> {
    try {
      // Store personal information
      if (data.personal_info) {
        await supabase
          .from('personal_information')
          .upsert({
            report_id: reportId,
            full_name: data.personal_info.full_name,
            date_of_birth: data.personal_info.date_of_birth,
            ssn_partial: data.personal_info.ssn_partial,
            current_address: data.personal_info.current_address,
            previous_addresses: data.personal_info.previous_addresses || [],
            employer_info: data.personal_info.employment_current,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'report_id'
          });
      }

      // Store credit accounts
      if (data.credit_accounts?.length > 0) {
        const accountsToInsert = data.credit_accounts.map((account: ComprehensiveCreditAccount) => ({
          report_id: reportId,
          creditor_name: account.creditor_name,
          account_number: account.account_number,
          account_type: account.account_type,
          date_opened: account.date_opened,
          date_closed: account.date_closed,
          credit_limit: account.credit_limit,
          current_balance: account.current_balance,
          high_credit: account.high_credit,
          payment_status: account.payment_status,
          account_status: account.account_status,
          payment_history: account.payment_history || {},
          is_negative: account.is_negative || false,
          past_due_amount: account.past_due_amount || 0,
          updated_at: new Date().toISOString()
        }));

        // Clear existing accounts for this report
        await supabase
          .from('credit_accounts')
          .delete()
          .eq('report_id', reportId);

        // Insert new accounts
        await supabase
          .from('credit_accounts')
          .insert(accountsToInsert);
      }

      // Store credit inquiries
      if (data.credit_inquiries?.length > 0) {
        const inquiriesToInsert = data.credit_inquiries.map((inquiry: CreditInquiry) => ({
          report_id: reportId,
          inquirer_name: inquiry.inquirer_name,
          inquiry_date: inquiry.inquiry_date,
          inquiry_type: inquiry.inquiry_type,
          updated_at: new Date().toISOString()
        }));

        // Clear existing inquiries for this report
        await supabase
          .from('credit_inquiries')
          .delete()
          .eq('report_id', reportId);

        // Insert new inquiries
        await supabase
          .from('credit_inquiries')
          .insert(inquiriesToInsert);
      }

      // Store negative items
      if (data.negative_items?.length > 0) {
        const negativeItemsToInsert = data.negative_items.map((item: NegativeItem) => ({
          report_id: reportId,
          negative_type: item.item_type,
          creditor_name: item.creditor_name,
          amount: item.amount,
          date_occurred: item.date_occurred,
          severity_score: item.severity_score,
          description: item.description,
          ai_confidence_score: 0.9, // High confidence for parsed items
          human_verified: false,
          dispute_eligible: true,
          updated_at: new Date().toISOString()
        }));

        // Clear existing negative items for this report
        await supabase
          .from('negative_items')
          .delete()
          .eq('report_id', reportId);

        // Insert new negative items
        await supabase
          .from('negative_items')
          .insert(negativeItemsToInsert);
      }

      console.log('Comprehensive data stored successfully for report:', reportId);

    } catch (error) {
      console.error('Error storing comprehensive data:', error);
      throw error;
    }
  }
}