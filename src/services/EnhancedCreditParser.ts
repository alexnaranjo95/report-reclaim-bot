import { supabase } from '@/integrations/supabase/client';

/**
 * Enhanced Credit Parser with improved text quality processing
 * and fuzzy matching for better parsing results
 */
export class EnhancedCreditParser {
  
  /**
   * Preprocess raw text to improve parsing quality
   */
  static preprocessText(rawText: string): string {
    console.log('🔧 Preprocessing text for better parsing quality...');
    
    let processedText = rawText;
    
    // Remove garbled characters and control sequences
    processedText = processedText
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ') // Remove control characters
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Keep only printable ASCII + newlines/tabs
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Fix common OCR/extraction errors
    processedText = processedText
      .replace(/\b0\b/g, 'O') // Fix 0/O confusion in names
      .replace(/\bl\b/g, 'I') // Fix l/I confusion
      .replace(/(\d)\s+(\d)/g, '$1$2') // Join separated digits
      .replace(/([A-Z])\s+([A-Z])/g, '$1$2'); // Join separated capitals

    // Normalize common credit report sections
    const sectionMappings = {
      'PERSONAL INFORMATION': 'PERSONAL_INFO',
      'CONSUMER INFORMATION': 'PERSONAL_INFO',
      'ACCOUNT INFORMATION': 'ACCOUNTS',
      'CREDIT ACCOUNTS': 'ACCOUNTS',
      'TRADELINE INFORMATION': 'ACCOUNTS',
      'INQUIRIES': 'INQUIRIES',
      'CREDIT INQUIRIES': 'INQUIRIES',
      'PUBLIC RECORDS': 'PUBLIC_RECORDS',
      'COLLECTIONS': 'COLLECTIONS'
    };

    Object.entries(sectionMappings).forEach(([original, normalized]) => {
      const regex = new RegExp(`\\b${original.replace(/\s/g, '\\s+')}\\b`, 'gi');
      processedText = processedText.replace(regex, normalized);
    });

    console.log(`✅ Text preprocessing completed. Length: ${processedText.length}`);
    return processedText;
  }

  /**
   * Calculate text quality score to determine if parsing should proceed
   */
  static calculateTextQuality(text: string): number {
    if (!text || text.length < 100) return 0;

    let score = 0;
    const totalChars = text.length;

    // Check for reasonable character distribution
    const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
    const digitCount = (text.match(/[0-9]/g) || []).length;
    const spaceCount = (text.match(/\s/g) || []).length;
    const punctCount = (text.match(/[.,;:!?()-]/g) || []).length;

    // Good text should have reasonable distribution
    const alphaRatio = alphaCount / totalChars;
    const digitRatio = digitCount / totalChars;
    const spaceRatio = spaceCount / totalChars;

    if (alphaRatio > 0.3 && alphaRatio < 0.8) score += 30;
    if (digitRatio > 0.05 && digitRatio < 0.3) score += 20;
    if (spaceRatio > 0.1 && spaceRatio < 0.3) score += 20;

    // Check for credit report keywords
    const creditKeywords = [
      'credit', 'account', 'balance', 'payment', 'report', 'bureau',
      'equifax', 'experian', 'transunion', 'fico', 'score', 'inquiry',
      'collection', 'tradeline', 'creditor', 'bank', 'card'
    ];

    const keywordCount = creditKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    ).length;

    score += Math.min(keywordCount * 5, 30); // Max 30 points for keywords

    console.log(`📊 Text quality score: ${score}/100`);
    return score;
  }

  /**
   * Enhanced parsing with fuzzy matching and error recovery
   */
  static async parseWithFuzzyMatching(reportId: string): Promise<boolean> {
    console.log('🔍 Starting enhanced parsing with fuzzy matching...');

    try {
      // Get the report
      const { data: report, error } = await supabase
        .from('credit_reports')
        .select('raw_text, bureau_name')
        .eq('id', reportId)
        .single();

      if (error || !report.raw_text) {
        throw new Error('No raw text found for parsing');
      }

      // Preprocess text
      const processedText = this.preprocessText(report.raw_text);
      
      // Check text quality
      const qualityScore = this.calculateTextQuality(processedText);
      if (qualityScore < 40) {
        console.warn('⚠️ Text quality score too low for reliable parsing');
        // Still attempt parsing but with lower confidence
      }

      // Parse different sections with fuzzy matching
      const personalInfo = this.extractPersonalInfoFuzzy(processedText);
      const accounts = this.extractAccountsFuzzy(processedText);
      const inquiries = this.extractInquiriesFuzzy(processedText);
      const negativeItems = this.extractNegativeItemsFuzzy(processedText);

      // Store parsed data
      await this.storeEnhancedData(reportId, {
        personalInfo,
        accounts,
        inquiries,
        negativeItems,
        qualityScore,
        processingMethod: 'enhanced_fuzzy_parsing'
      });

      console.log('✅ Enhanced parsing completed successfully');
      return true;

    } catch (error) {
      console.error('❌ Enhanced parsing failed:', error);
      throw error;
    }
  }

  /**
   * Fuzzy personal information extraction
   */
  static extractPersonalInfoFuzzy(text: string): any {
    const info: any = {};

    // Enhanced name patterns with fuzzy matching
    const namePatterns = [
      /(?:name|consumer|person)[\s:]*([A-Z][A-Z\s]{10,50})/i,
      /^([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)/m,
      /PERSONAL_INFO[\s\S]*?name[\s:]*([A-Z][A-Za-z\s]{5,30})/i
    ];

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && !info.full_name) {
        info.full_name = match[1].trim().replace(/\s+/g, ' ');
        break;
      }
    }

    // Enhanced SSN patterns
    const ssnPatterns = [
      /(?:ssn|social)[\s:]*(?:\*+|X+|#+)(\d{4})/i,
      /(\*{3}-\*{2}-\d{4})/,
      /(XXX-XX-\d{4})/
    ];

    for (const pattern of ssnPatterns) {
      const match = text.match(pattern);
      if (match && !info.ssn_partial) {
        info.ssn_partial = match[1];
        break;
      }
    }

    // Enhanced date of birth patterns
    const dobPatterns = [
      /(?:birth|born|dob)[\s:]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/g
    ];

    for (const pattern of dobPatterns) {
      const match = text.match(pattern);
      if (match && !info.date_of_birth) {
        // Validate date format
        const dateStr = match[1];
        if (this.isValidDate(dateStr)) {
          info.date_of_birth = dateStr;
          break;
        }
      }
    }

    // Enhanced address patterns
    const addressPatterns = [
      /(\d+\s+[A-Z][A-Za-z\s,]{10,80}[A-Z]{2}\s+\d{5})/i,
      /(?:address|residence)[\s:]*([^:\n]{20,100})/i
    ];

    for (const pattern of addressPatterns) {
      const match = text.match(pattern);
      if (match && !info.current_address) {
        info.current_address = { full_address: match[1].trim() };
        break;
      }
    }

    return info;
  }

  /**
   * Fuzzy credit accounts extraction
   */
  static extractAccountsFuzzy(text: string): any[] {
    const accounts: any[] = [];
    
    // Split text into potential account blocks
    const sections = text.split(/(?=\b[A-Z][A-Z\s&]{5,30}(?:BANK|CARD|CREDIT|LOAN|MORTGAGE)\b)/i);
    
    for (const section of sections) {
      if (section.length < 50) continue;
      
      const account = this.parseAccountBlockFuzzy(section);
      if (account.creditor_name && account.creditor_name.length > 2) {
        accounts.push(account);
      }
    }

    return accounts;
  }

  /**
   * Parse individual account block with fuzzy matching
   */
  static parseAccountBlockFuzzy(block: string): any {
    const account: any = {
      creditor_name: '',
      is_negative: false
    };

    // Enhanced creditor name extraction
    const creditorPatterns = [
      /^([A-Z][A-Z\s&]{3,30}(?:BANK|CARD|CREDIT|LOAN|MORTGAGE))/i,
      /([A-Z][A-Z\s&]{3,30})/
    ];

    for (const pattern of creditorPatterns) {
      const match = block.match(pattern);
      if (match && !account.creditor_name) {
        account.creditor_name = match[1].trim().replace(/\s+/g, ' ');
        break;
      }
    }

    // Account number patterns
    const accountPatterns = [
      /(?:account|acct)[\s#]*([*\dX-]{4,20})/i,
      /(\*+\d{4})/
    ];

    for (const pattern of accountPatterns) {
      const match = block.match(pattern);
      if (match && !account.account_number) {
        account.account_number = match[1];
        break;
      }
    }

    // Balance extraction
    const balancePatterns = [
      /(?:balance|current)[\s:]*\$?([\d,]+)/i,
      /\$(\d{1,3}(?:,\d{3})*)/
    ];

    for (const pattern of balancePatterns) {
      const match = block.match(pattern);
      if (match && !account.current_balance) {
        account.current_balance = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }

    // Status detection
    const statusIndicators = {
      'paid': /paid|closed|satisfied/i,
      'current': /current|good|ok/i,
      'late': /late|past due|delinquent/i,
      'charge off': /charge.*off|charged.*off/i,
      'collection': /collection|collected/i
    };

    for (const [status, pattern] of Object.entries(statusIndicators)) {
      if (pattern.test(block)) {
        account.account_status = status;
        if (['late', 'charge off', 'collection'].includes(status)) {
          account.is_negative = true;
        }
        break;
      }
    }

    return account;
  }

  /**
   * Extract inquiries with fuzzy matching
   */
  static extractInquiriesFuzzy(text: string): any[] {
    const inquiries: any[] = [];
    
    const inquiryPatterns = [
      /([A-Z][A-Z\s&]{3,30})\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
      /inquiry[\s:]*([^:\n]{10,50})/gi
    ];

    for (const pattern of inquiryPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        inquiries.push({
          inquirer_name: match[1]?.trim(),
          inquiry_date: match[2] || null,
          inquiry_type: 'hard' // Default assumption
        });
      }
    }

    return inquiries;
  }

  /**
   * Extract negative items with fuzzy matching
   */
  static extractNegativeItemsFuzzy(text: string): any[] {
    const negativeItems: any[] = [];
    
    const negativePatterns = {
      'collection': /collection|collector|collect/gi,
      'charge_off': /charge.*off|charged.*off/gi,
      'late_payment': /late|past due|delinquent/gi,
      'bankruptcy': /bankruptcy|bankrupt/gi,
      'foreclosure': /foreclosure|foreclose/gi
    };

    Object.entries(negativePatterns).forEach(([type, pattern]) => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const contextStart = Math.max(0, match.index! - 100);
        const contextEnd = Math.min(text.length, match.index! + 100);
        const context = text.substring(contextStart, contextEnd);
        
        negativeItems.push({
          item_type: type,
          description: context.trim(),
          severity_score: this.calculateSeverityScore(type),
          dispute_eligible: true
        });
      }
    });

    return negativeItems;
  }

  /**
   * Store enhanced parsed data
   */
  static async storeEnhancedData(reportId: string, data: any): Promise<void> {
    console.log('💾 Storing enhanced parsed data...');

    try {
      // Store personal information
      if (data.personalInfo && Object.keys(data.personalInfo).length > 0) {
        await supabase
          .from('personal_information')
          .upsert({
            report_id: reportId,
            ...data.personalInfo,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }

      // Store credit accounts
      if (data.accounts && data.accounts.length > 0) {
        for (const account of data.accounts) {
          await supabase
            .from('credit_accounts')
            .upsert({
              report_id: reportId,
              ...account,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      }

      // Store inquiries
      if (data.inquiries && data.inquiries.length > 0) {
        for (const inquiry of data.inquiries) {
          await supabase
            .from('credit_inquiries')
            .upsert({
              report_id: reportId,
              ...inquiry,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      }

      // Store negative items
      if (data.negativeItems && data.negativeItems.length > 0) {
        for (const item of data.negativeItems) {
          await supabase
            .from('negative_items')
            .upsert({
              report_id: reportId,
              ...item,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      }

      console.log('✅ Enhanced data storage completed');

    } catch (error) {
      console.error('❌ Failed to store enhanced data:', error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  static isValidDate(dateStr: string): boolean {
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && date.getFullYear() > 1900;
  }

  static calculateSeverityScore(itemType: string): number {
    const severityMap: Record<string, number> = {
      'late_payment': 3,
      'collection': 6,
      'charge_off': 8,
      'bankruptcy': 10,
      'foreclosure': 9
    };
    return severityMap[itemType] || 5;
  }
}