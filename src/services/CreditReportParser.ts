import { supabase } from '@/integrations/supabase/client';

export interface BureauDetectionResult {
  bureau: 'Equifax' | 'Experian' | 'TransUnion' | 'Unknown';
  confidence: 'high' | 'medium' | 'low';
  indicators: string[];
}

export interface ParsedSections {
  personal_info?: string;
  accounts?: string;
  collections?: string;
  public_records?: string;
  inquiries?: string;
  account_summary?: string;
}

export interface PersonalInfo {
  full_name?: string;
  ssn_partial?: string;
  date_of_birth?: string;
  current_address?: any;
  previous_addresses?: any[];
  employer_info?: any;
}

export interface CreditAccount {
  creditor_name: string;
  account_number?: string;
  account_type?: string;
  date_opened?: string;
  date_closed?: string;
  credit_limit?: number;
  current_balance?: number;
  high_credit?: number;
  payment_status?: string;
  account_status?: string;
  payment_history?: any;
  is_negative?: boolean;
  past_due_amount?: number;
}

export interface ParsingResult {
  bureau: BureauDetectionResult;
  sections: ParsedSections;
  personalInfo?: PersonalInfo;
  accounts: CreditAccount[];
  collectionsCount: number;
  publicRecordsCount: number;
  inquiriesCount: number;
  parsingConfidence: number;
  errors: string[];
  warnings: string[];
}

export class CreditReportParser {
  /**
   * Main parsing function - orchestrates the entire parsing process
   */
  static async parseReport(reportId: string): Promise<ParsingResult> {
    console.log('Starting report parsing for:', reportId);

    // Get the report with raw text
    const { data: report, error } = await supabase
      .from('credit_reports')
      .select('raw_text, bureau_name')
      .eq('id', reportId)
      .single();

    if (error || !report.raw_text) {
      throw new Error('No text data found for parsing');
    }

    const rawText = report.raw_text;
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Step 1: Detect bureau
      console.log('Detecting bureau...');
      const bureau = this.detectBureau(rawText);

      // Step 2: Parse sections
      console.log('Parsing sections...');
      const sections = this.parseSections(rawText, bureau.bureau);

      // Step 3: Parse personal information
      console.log('Parsing personal information...');
      const personalInfo = this.parsePersonalInfo(sections.personal_info || '', bureau.bureau);

      // Step 4: Parse credit accounts
      console.log('Parsing credit accounts...');
      const accounts = this.parseAccounts(sections.accounts || '', bureau.bureau);

      // Step 5: Count other sections
      const collectionsCount = this.countItems(sections.collections || '');
      const publicRecordsCount = this.countItems(sections.public_records || '');
      const inquiriesCount = this.countItems(sections.inquiries || '');

      // Step 6: Calculate confidence
      const parsingConfidence = this.calculateParsingConfidence(bureau, sections, accounts);

      // Step 7: Store parsed data in database
      await this.storeParsedData(reportId, bureau, personalInfo, accounts);

      // Step 8: Update report with parsing status
      await supabase
        .from('credit_reports')
        .update({
          bureau_name: bureau.bureau,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      console.log('Parsing completed successfully');

      return {
        bureau,
        sections,
        personalInfo,
        accounts,
        collectionsCount,
        publicRecordsCount,
        inquiriesCount,
        parsingConfidence,
        errors,
        warnings
      };

    } catch (error) {
      console.error('Parsing error:', error);
      errors.push(error.message);
      throw error;
    }
  }

  /**
   * Detect which credit bureau the report is from
   */
  static detectBureau(rawText: string): BureauDetectionResult {
    const first1000 = rawText.substring(0, 1000).toLowerCase();
    const indicators: string[] = [];

    // Equifax indicators
    const equifaxPatterns = [
      'equifax credit report',
      'equifax information services',
      'www.equifax.com',
      '1-800-685-1111',
      'equifax inc'
    ];

    // Experian indicators  
    const experianPatterns = [
      'experian credit report',
      'experian information solutions',
      'www.experian.com',
      'report number:',
      'experian plc'
    ];

    // TransUnion indicators
    const transunionPatterns = [
      'transunion credit report',
      'transunion llc',
      'www.transunion.com',
      'file number:',
      'transunion'
    ];

    let equifaxScore = 0;
    let experianScore = 0;
    let transunionScore = 0;

    // Check Equifax patterns
    equifaxPatterns.forEach(pattern => {
      if (first1000.includes(pattern)) {
        equifaxScore++;
        indicators.push(`Found Equifax indicator: ${pattern}`);
      }
    });

    // Check Experian patterns
    experianPatterns.forEach(pattern => {
      if (first1000.includes(pattern)) {
        experianScore++;
        indicators.push(`Found Experian indicator: ${pattern}`);
      }
    });

    // Check TransUnion patterns
    transunionPatterns.forEach(pattern => {
      if (first1000.includes(pattern)) {
        transunionScore++;
        indicators.push(`Found TransUnion indicator: ${pattern}`);
      }
    });

    // Determine bureau and confidence
    const maxScore = Math.max(equifaxScore, experianScore, transunionScore);
    let bureau: 'Equifax' | 'Experian' | 'TransUnion' | 'Unknown' = 'Unknown';
    let confidence: 'high' | 'medium' | 'low' = 'low';

    if (maxScore >= 2) {
      confidence = 'high';
    } else if (maxScore === 1) {
      confidence = 'medium';
    }

    if (equifaxScore === maxScore && maxScore > 0) {
      bureau = 'Equifax';
    } else if (experianScore === maxScore && maxScore > 0) {
      bureau = 'Experian';
    } else if (transunionScore === maxScore && maxScore > 0) {
      bureau = 'TransUnion';
    }

    return { bureau, confidence, indicators };
  }

  /**
   * Parse report into sections
   */
  static parseSections(rawText: string, bureau: string): ParsedSections {
    const sections: ParsedSections = {};
    const text = rawText.toLowerCase();

    // Common section headers across bureaus
    const sectionPatterns = {
      personal_info: [
        'personal information',
        'consumer information',
        'personal data',
        'identification information',
        'personal identification'
      ],
      accounts: [
        'account information',
        'credit accounts',
        'account details',
        'accounts',
        'credit information',
        'tradeline information'
      ],
      collections: [
        'collections',
        'collection accounts',
        'collection information'
      ],
      public_records: [
        'public records',
        'public record information',
        'court records'
      ],
      inquiries: [
        'inquiries',
        'credit inquiries',
        'inquiry information'
      ],
      account_summary: [
        'account summary',
        'credit summary',
        'summary'
      ]
    };

    // Extract sections based on patterns
    Object.entries(sectionPatterns).forEach(([sectionName, patterns]) => {
      patterns.forEach(pattern => {
        const index = text.indexOf(pattern);
        if (index !== -1) {
          // Found section header, extract content
          const startIndex = index;
          const nextSectionIndex = this.findNextSectionStart(text, index + pattern.length, Object.values(sectionPatterns).flat());
          const endIndex = nextSectionIndex !== -1 ? nextSectionIndex : text.length;
          
          const sectionContent = rawText.substring(startIndex, endIndex).trim();
          if (sectionContent.length > pattern.length + 50) { // Minimum content threshold
            sections[sectionName as keyof ParsedSections] = sectionContent;
          }
        }
      });
    });

    return sections;
  }

  /**
   * Find the start of the next section
   */
  static findNextSectionStart(text: string, fromIndex: number, allPatterns: string[]): number {
    let nextIndex = -1;
    
    allPatterns.forEach(pattern => {
      const index = text.indexOf(pattern, fromIndex + 100); // Skip ahead to avoid same section
      if (index !== -1 && (nextIndex === -1 || index < nextIndex)) {
        nextIndex = index;
      }
    });

    return nextIndex;
  }

  /**
   * Parse personal information
   */
  static parsePersonalInfo(sectionText: string, bureau: string): PersonalInfo {
    const info: PersonalInfo = {};

    // Extract full name
    const namePatterns = [
      /name:?\s*([a-z\s]+)/i,
      /consumer name:?\s*([a-z\s]+)/i,
      /^([A-Z\s]+)$/m // All caps name at start of line
    ];

    namePatterns.forEach(pattern => {
      const match = sectionText.match(pattern);
      if (match && match[1] && !info.full_name) {
        info.full_name = match[1].trim();
      }
    });

    // Extract SSN (last 4 digits only)
    const ssnPattern = /(?:\*\*\*-\*\*-|XXX-XX-)(\d{4})/;
    const ssnMatch = sectionText.match(ssnPattern);
    if (ssnMatch) {
      info.ssn_partial = `***-**-${ssnMatch[1]}`;
    }

    // Extract date of birth
    const dobPatterns = [
      /(?:date of birth|birth date|dob):?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /(?:born|birth):?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
    ];

    dobPatterns.forEach(pattern => {
      const match = sectionText.match(pattern);
      if (match && !info.date_of_birth) {
        info.date_of_birth = match[1];
      }
    });

    // Extract current address
    const addressPattern = /(?:address|current address):?\s*([^\n]+(?:\n[^\n]+)*?)(?:\n\n|\n(?:[A-Z])|$)/i;
    const addressMatch = sectionText.match(addressPattern);
    if (addressMatch) {
      info.current_address = {
        full_address: addressMatch[1].trim()
      };
    }

    return info;
  }

  /**
   * Parse credit accounts
   */
  static parseAccounts(sectionText: string, bureau: string): CreditAccount[] {
    const accounts: CreditAccount[] = [];
    
    // Split text into potential account blocks
    let accountBlocks: string[] = [];

    if (bureau === 'Equifax') {
      accountBlocks = this.parseEquifaxAccounts(sectionText);
    } else if (bureau === 'Experian') {
      accountBlocks = this.parseExperianAccounts(sectionText);
    } else if (bureau === 'TransUnion') {
      accountBlocks = this.parseTransUnionAccounts(sectionText);
    } else {
      // Generic parsing for unknown bureau
      accountBlocks = this.parseGenericAccounts(sectionText);
    }

    accountBlocks.forEach(block => {
      const account = this.parseAccountBlock(block, bureau);
      if (account.creditor_name) {
        accounts.push(account);
      }
    });

    return accounts;
  }

  /**
   * Parse Equifax-specific account format
   */
  static parseEquifaxAccounts(text: string): string[] {
    // Equifax typically has creditor names in caps followed by account details
    const blocks = text.split(/\n(?=[A-Z\s]{3,}(?:BANK|CARD|CREDIT|LOAN|MORT))/);
    return blocks.filter(block => block.trim().length > 50);
  }

  /**
   * Parse Experian-specific account format  
   */
  static parseExperianAccounts(text: string): string[] {
    // Experian typically separates accounts with specific formatting
    const blocks = text.split(/\n\s*\n(?=\S)/);
    return blocks.filter(block => block.trim().length > 50);
  }

  /**
   * Parse TransUnion-specific account format
   */
  static parseTransUnionAccounts(text: string): string[] {
    // TransUnion has distinct account separation
    const blocks = text.split(/\n\s*Account\s+\d+|^Account\s+\d+/im);
    return blocks.filter(block => block.trim().length > 50);
  }

  /**
   * Generic account parsing for unknown bureaus
   */
  static parseGenericAccounts(text: string): string[] {
    // Try to split on double newlines or account-like patterns
    const blocks = text.split(/\n\s*\n|(?=(?:ACCOUNT|Account)\s*(?:Number|#))/);
    return blocks.filter(block => block.trim().length > 50);
  }

  /**
   * Parse individual account block
   */
  static parseAccountBlock(block: string, bureau: string): CreditAccount {
    const account: CreditAccount = {
      creditor_name: '',
      is_negative: false
    };

    // Extract creditor name (usually first line or all caps)
    const firstLine = block.split('\n')[0].trim();
    if (firstLine.length > 0) {
      account.creditor_name = firstLine.replace(/^\d+\.\s*/, ''); // Remove numbering
    }

    // Extract account number
    const accountNumPatterns = [
      /(?:account number|acct#|account #):?\s*([*\dX-]+)/i,
      /#(\d+[*\dX-]*)/,
      /(\*+\d{4})/
    ];

    accountNumPatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.account_number) {
        account.account_number = match[1];
      }
    });

    // Extract account type
    const typePatterns = [
      /(?:type|account type):?\s*([^\n]+)/i,
      /(credit card|mortgage|auto loan|personal loan|student loan|installment|revolving)/i
    ];

    typePatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.account_type) {
        account.account_type = match[1].trim();
      }
    });

    // Extract dates
    const dateOpenedPatterns = [
      /(?:date opened|opened):?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /(?:open date):?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
    ];

    dateOpenedPatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.date_opened) {
        account.date_opened = match[1];
      }
    });

    // Extract balances
    const balancePatterns = [
      /(?:current balance|balance):?\s*\$?([\d,]+)/i,
      /(?:balance):?\s*\$?([\d,]+)/i
    ];

    balancePatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.current_balance) {
        account.current_balance = parseInt(match[1].replace(/,/g, ''));
      }
    });

    // Extract credit limit
    const limitPatterns = [
      /(?:credit limit|limit):?\s*\$?([\d,]+)/i,
      /(?:high credit):?\s*\$?([\d,]+)/i
    ];

    limitPatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.credit_limit) {
        account.credit_limit = parseInt(match[1].replace(/,/g, ''));
      }
    });

    // Extract status
    const statusPatterns = [
      /(?:status|account status):?\s*([^\n]+)/i,
      /(?:payment status):?\s*([^\n]+)/i
    ];

    statusPatterns.forEach(pattern => {
      const match = block.match(pattern);
      if (match && !account.account_status) {
        account.account_status = match[1].trim();
      }
    });

    // Determine if negative
    const negativeIndicators = [
      'charged off', 'collection', 'late', 'delinquent', 
      '30 days', '60 days', '90 days', '120 days',
      'past due', 'default'
    ];

    negativeIndicators.forEach(indicator => {
      if (block.toLowerCase().includes(indicator)) {
        account.is_negative = true;
      }
    });

    return account;
  }

  /**
   * Count items in a section
   */
  static countItems(sectionText: string): number {
    if (!sectionText) return 0;
    
    // Count potential items by looking for patterns
    const lines = sectionText.split('\n').filter(line => line.trim().length > 10);
    return Math.max(1, Math.floor(lines.length / 3)); // Estimate items
  }

  /**
   * Calculate overall parsing confidence
   */
  static calculateParsingConfidence(
    bureau: BureauDetectionResult,
    sections: ParsedSections,
    accounts: CreditAccount[]
  ): number {
    let confidence = 0;

    // Bureau detection confidence (0-30 points)
    if (bureau.confidence === 'high') confidence += 30;
    else if (bureau.confidence === 'medium') confidence += 20;
    else if (bureau.confidence === 'low') confidence += 10;

    // Sections found (0-40 points)
    const sectionsFound = Object.keys(sections).length;
    confidence += Math.min(40, sectionsFound * 8);

    // Accounts parsed (0-30 points)
    confidence += Math.min(30, accounts.length * 3);

    return Math.min(100, confidence);
  }

  /**
   * Store parsed data in database
   */
  static async storeParsedData(
    reportId: string,
    bureau: BureauDetectionResult,
    personalInfo: PersonalInfo,
    accounts: CreditAccount[]
  ): Promise<void> {
    console.log('Storing parsed data...');

    // Store personal information
    if (personalInfo.full_name || personalInfo.ssn_partial) {
      await supabase
        .from('personal_information')
        .upsert({
          report_id: reportId,
          bureau: 'TransUnion',
          full_name: personalInfo.full_name,
          ssn_last_four: personalInfo.ssn_partial,
          date_of_birth: personalInfo.date_of_birth ? personalInfo.date_of_birth : null
        });
    }

    // Store credit accounts
    for (const account of accounts) {
      if (account.creditor_name) {
        await supabase
          .from('credit_accounts')
          .insert({
            report_id: reportId,
            bureau: 'TransUnion',
            creditor_name: account.creditor_name,
            account_number: account.account_number,
            account_type: account.account_type,
            date_opened: account.date_opened ? account.date_opened : null,
            date_closed: account.date_closed ? account.date_closed : null,
            credit_limit: account.credit_limit,
            current_balance: account.current_balance,
            high_credit: account.high_credit,
            payment_status: account.payment_status,
            account_status: account.account_status,
            past_due_amount: account.past_due_amount || 0
          });
      }
    }

    console.log(`Stored ${accounts.length} accounts and personal information`);
  }
}