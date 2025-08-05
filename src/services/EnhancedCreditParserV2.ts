import { supabase } from "@/integrations/supabase/client";

/**
 * Enhanced Credit Parser V2 - Robust parsing with better error handling and validation
 * Designed to handle corrupted text and various credit report formats
 */
export class EnhancedCreditParserV2 {
  
  /**
   * Main parsing method with comprehensive error handling
   */
  static async parseReport(reportId: string): Promise<boolean> {
    console.log('🔍 Starting enhanced credit report parsing V2...');
    
    try {
      // Fetch the report
      const { data: report, error } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error || !report) {
        throw new Error(`Failed to fetch report: ${error?.message}`);
      }

      if (!report.raw_text) {
        throw new Error('No raw text found for parsing');
      }

      // Update status to parsing
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'parsing',
          processing_errors: null 
        })
        .eq('id', reportId);

      // Parse the text with enhanced methods
      const parseResult = await this.parseWithEnhancedMethods(report.raw_text, reportId);
      
      if (parseResult.success) {
        await supabase
          .from('credit_reports')
          .update({ 
            extraction_status: 'completed',
            processing_errors: null 
          })
          .eq('id', reportId);
        
        console.log('✅ Enhanced parsing completed successfully');
        return true;
      } else {
        throw new Error(parseResult.error || 'Unknown parsing error');
      }

    } catch (error) {
      console.error('❌ Enhanced parsing failed:', error);
      
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          processing_errors: `Enhanced parsing failed: ${error.message}` 
        })
        .eq('id', reportId);
      
      return false;
    }
  }

  /**
   * Enhanced parsing with multiple extraction strategies
   */
  private static async parseWithEnhancedMethods(rawText: string, reportId: string) {
    console.log('📊 Analyzing text quality and structure...');
    
    // Preprocess text
    const processedText = this.preprocessText(rawText);
    const quality = this.calculateTextQuality(processedText);
    
    console.log(`📈 Text quality score: ${quality}/100`);
    
    if (quality < 20) {
      console.log('⚠️ Very low quality text detected - attempting recovery...');
      return await this.attemptTextRecovery(rawText, reportId);
    }

    // Try different parsing strategies based on text quality
    if (quality >= 70) {
      return await this.parseHighQualityText(processedText, reportId);
    } else if (quality >= 40) {
      return await this.parseMediumQualityText(processedText, reportId);
    } else {
      return await this.parseLowQualityText(processedText, reportId);
    }
  }

  /**
   * Preprocess text to improve parsing accuracy
   */
  private static preprocessText(text: string): string {
    console.log('🔧 Preprocessing text for better parsing...');
    
    // Remove common OCR artifacts and noise
    let processed = text
      // Remove PDF metadata patterns
      .replace(/\/Filter.*?\/Length.*?stream/g, '')
      .replace(/endstream\s+endobj/g, '')
      // Fix common OCR errors
      .replace(/(\d)\s+(\d)/g, '$1$2') // Fix split numbers
      .replace(/([A-Z])\s+([A-Z])/g, '$1$2') // Fix split uppercase words
      .replace(/\s{3,}/g, ' ') // Normalize spaces
      // Clean up line breaks
      .replace(/\n\s*\n/g, '\n')
      .replace(/\r\n/g, '\n')
      // Fix common character substitutions
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/–/g, '-')
      .replace(/—/g, '-');

    console.log(`📝 Text preprocessed: ${text.length} → ${processed.length} characters`);
    return processed;
  }

  /**
   * Calculate text quality score
   */
  private static calculateTextQuality(text: string): number {
    if (!text || text.length < 100) return 0;

    let score = 0;
    const length = text.length;

    // Readable character ratio
    const readableChars = (text.match(/[a-zA-Z0-9\s.,!?;:\-()]/g) || []).length;
    score += (readableChars / length) * 40;

    // Credit report keywords
    const keywords = [
      'credit', 'report', 'account', 'balance', 'experian', 'equifax', 
      'transunion', 'inquiry', 'tradeline', 'payment', 'history'
    ];
    const foundKeywords = keywords.filter(k => text.toLowerCase().includes(k)).length;
    score += (foundKeywords / keywords.length) * 30;

    // Structured data indicators
    const hasSSN = /\d{3}-?\d{2}-?\d{4}/.test(text);
    const hasAccount = /account|acct/i.test(text);
    const hasDates = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text);
    const hasAmounts = /\$\d+|\d+\.\d{2}/.test(text);

    if (hasSSN) score += 7.5;
    if (hasAccount) score += 7.5;
    if (hasDates) score += 7.5;
    if (hasAmounts) score += 7.5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Parse high quality text (quality >= 70)
   */
  private static async parseHighQualityText(text: string, reportId: string) {
    console.log('✨ Parsing high quality text with standard methods...');
    
    try {
      const personalInfo = this.extractPersonalInfoStrict(text);
      const accounts = this.extractAccountsStrict(text);
      const inquiries = this.extractInquiriesStrict(text);
      const negativeItems = this.extractNegativeItemsStrict(text);

      await this.storeExtractedData(reportId, {
        personalInfo,
        accounts,
        inquiries,
        negativeItems
      });

      console.log(`📊 High quality parsing results: Personal: ${personalInfo ? 1 : 0}, Accounts: ${accounts.length}, Inquiries: ${inquiries.length}, Negative: ${negativeItems.length}`);
      
      return { 
        success: true, 
        quality: 'high',
        counts: {
          personal: personalInfo ? 1 : 0,
          accounts: accounts.length,
          inquiries: inquiries.length,
          negative: negativeItems.length
        }
      };
    } catch (error) {
      console.error('❌ High quality parsing failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse medium quality text (quality 40-69)
   */
  private static async parseMediumQualityText(text: string, reportId: string) {
    console.log('⚡ Parsing medium quality text with fuzzy matching...');
    
    try {
      const personalInfo = this.extractPersonalInfoFuzzy(text);
      const accounts = this.extractAccountsFuzzy(text);
      const inquiries = this.extractInquiriesFuzzy(text);
      const negativeItems = this.extractNegativeItemsFuzzy(text);

      await this.storeExtractedData(reportId, {
        personalInfo,
        accounts,
        inquiries,
        negativeItems
      });

      console.log(`📊 Medium quality parsing results: Personal: ${personalInfo ? 1 : 0}, Accounts: ${accounts.length}, Inquiries: ${inquiries.length}, Negative: ${negativeItems.length}`);
      
      return { 
        success: true, 
        quality: 'medium',
        counts: {
          personal: personalInfo ? 1 : 0,
          accounts: accounts.length,
          inquiries: inquiries.length,
          negative: negativeItems.length
        }
      };
    } catch (error) {
      console.error('❌ Medium quality parsing failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse low quality text (quality 20-39)
   */
  private static async parseLowQualityText(text: string, reportId: string) {
    console.log('🔍 Parsing low quality text with aggressive pattern matching...');
    
    try {
      const personalInfo = this.extractPersonalInfoAggressive(text);
      const accounts = this.extractAccountsAggressive(text);
      const inquiries = this.extractInquiriesAggressive(text);
      const negativeItems = this.extractNegativeItemsAggressive(text);

      await this.storeExtractedData(reportId, {
        personalInfo,
        accounts,
        inquiries,
        negativeItems
      });

      console.log(`📊 Low quality parsing results: Personal: ${personalInfo ? 1 : 0}, Accounts: ${accounts.length}, Inquiries: ${inquiries.length}, Negative: ${negativeItems.length}`);
      
      return { 
        success: true, 
        quality: 'low',
        counts: {
          personal: personalInfo ? 1 : 0,
          accounts: accounts.length,
          inquiries: inquiries.length,
          negative: negativeItems.length
        }
      };
    } catch (error) {
      console.error('❌ Low quality parsing failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Attempt text recovery for very low quality text
   */
  private static async attemptTextRecovery(text: string, reportId: string) {
    console.log('🚨 Attempting text recovery for very low quality content...');
    
    try {
      // Try to extract any meaningful patterns from corrupted text
      const patterns = this.extractBasicPatterns(text);
      
      if (patterns.hasAnyMeaningfulData) {
        await this.storeExtractedData(reportId, patterns.data);
        
        console.log('⚠️ Partial recovery successful - limited data extracted');
        return { 
          success: true, 
          quality: 'recovered',
          warning: 'Text quality extremely low - only partial data recovered',
          counts: patterns.counts
        };
      } else {
        throw new Error('No meaningful data could be recovered from corrupted text');
      }
    } catch (error) {
      console.error('❌ Text recovery failed:', error);
      return { success: false, error: `Text recovery failed: ${error.message}` };
    }
  }

  /**
   * Extract basic patterns from heavily corrupted text
   */
  private static extractBasicPatterns(text: string) {
    const data = {
      personalInfo: null,
      accounts: [],
      inquiries: [],
      negativeItems: []
    };

    let hasAnyMeaningfulData = false;

    // Try to extract SSN pattern
    const ssnMatch = text.match(/\d{3}[-\s]?\d{2}[-\s]?\d{4}/);
    if (ssnMatch) {
      data.personalInfo = { ssn: ssnMatch[0] };
      hasAnyMeaningfulData = true;
    }

    // Try to extract account numbers
    const accountMatches = text.match(/(?:account|acct)[\s#:]*(\w+)/gi);
    if (accountMatches) {
      accountMatches.forEach(match => {
        data.accounts.push({
          creditor_name: 'Unknown Creditor',
          account_number: match.replace(/(?:account|acct)[\s#:]*/i, ''),
          account_status: 'Unknown'
        });
      });
      hasAnyMeaningfulData = true;
    }

    return {
      hasAnyMeaningfulData,
      data,
      counts: {
        personal: data.personalInfo ? 1 : 0,
        accounts: data.accounts.length,
        inquiries: data.inquiries.length,
        negative: data.negativeItems.length
      }
    };
  }

  // Placeholder methods for different quality parsing strategies
  private static extractPersonalInfoStrict(text: string) {
    // Implementation for high-quality text parsing
    return this.extractPersonalInfoFuzzy(text);
  }

  private static extractAccountsStrict(text: string) {
    // Implementation for high-quality text parsing
    return this.extractAccountsFuzzy(text);
  }

  private static extractInquiriesStrict(text: string) {
    // Implementation for high-quality text parsing
    return this.extractInquiriesFuzzy(text);
  }

  private static extractNegativeItemsStrict(text: string) {
    // Implementation for high-quality text parsing
    return this.extractNegativeItemsFuzzy(text);
  }

  private static extractPersonalInfoFuzzy(text: string) {
    const info: any = {};

    // Extract name (fuzzy)
    const nameMatch = text.match(/(?:name|consumer)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (nameMatch) info.full_name = nameMatch[1];

    // Extract SSN (flexible patterns)
    const ssnMatch = text.match(/(?:ssn|social)[\s:]*(\d{3}[-\s]?\d{2}[-\s]?\d{4})/i);
    if (ssnMatch) info.ssn = ssnMatch[1];

    // Extract DOB (flexible patterns)
    const dobMatch = text.match(/(?:birth|dob)[\s:]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (dobMatch) info.date_of_birth = dobMatch[1];

    // Extract address (basic pattern)
    const addressMatch = text.match(/(\d+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard))/i);
    if (addressMatch) {
      info.current_address = { street: addressMatch[1] };
    }

    return Object.keys(info).length > 0 ? info : null;
  }

  private static extractAccountsFuzzy(text: string) {
    const accounts = [];
    
    // Look for account patterns
    const accountBlocks = text.split(/(?=account|creditor|lender)/i);
    
    for (const block of accountBlocks) {
      if (block.length < 50) continue;
      
      const account: any = {};
      
      // Extract creditor name
      const creditorMatch = block.match(/(?:creditor|lender)[\s:]*([A-Za-z\s]+)/i);
      if (creditorMatch) {
        account.creditor_name = creditorMatch[1].trim();
      }
      
      // Extract account number
      const accountMatch = block.match(/(?:account|acct)[\s#:]*(\w+)/i);
      if (accountMatch) {
        account.account_number = accountMatch[1];
      }
      
      // Extract balance
      const balanceMatch = block.match(/(?:balance|amount)[\s:]*\$?([\d,]+(?:\.\d{2})?)/i);
      if (balanceMatch) {
        account.current_balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
      }
      
      if (account.creditor_name || account.account_number) {
        accounts.push(account);
      }
    }
    
    return accounts;
  }

  private static extractInquiriesFuzzy(text: string) {
    const inquiries = [];
    
    // Look for inquiry patterns
    const inquiryMatches = text.match(/(?:inquiry|pull)[\s:]*([A-Za-z\s]+)/gi);
    
    if (inquiryMatches) {
      inquiryMatches.forEach(match => {
        const company = match.replace(/(?:inquiry|pull)[\s:]*/i, '').trim();
        if (company && company.length > 2) {
          inquiries.push({
            company_name: company,
            inquiry_type: 'Unknown'
          });
        }
      });
    }
    
    return inquiries;
  }

  private static extractNegativeItemsFuzzy(text: string) {
    const negativeItems = [];
    
    // Look for negative item patterns
    const negativePatterns = [
      /collection/gi,
      /charge.?off/gi,
      /late.?payment/gi,
      /delinquent/gi
    ];
    
    negativePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          negativeItems.push({
            item_type: match.toLowerCase(),
            description: `Negative item: ${match}`,
            status: 'Reported'
          });
        });
      }
    });
    
    return negativeItems;
  }

  private static extractPersonalInfoAggressive(text: string) {
    // More aggressive extraction for low quality text
    return this.extractPersonalInfoFuzzy(text);
  }

  private static extractAccountsAggressive(text: string) {
    // More aggressive extraction for low quality text
    return this.extractAccountsFuzzy(text);
  }

  private static extractInquiriesAggressive(text: string) {
    // More aggressive extraction for low quality text
    return this.extractInquiriesFuzzy(text);
  }

  private static extractNegativeItemsAggressive(text: string) {
    // More aggressive extraction for low quality text
    return this.extractNegativeItemsFuzzy(text);
  }

  /**
   * Store extracted data in database
   */
  private static async storeExtractedData(reportId: string, data: any) {
    console.log('💾 Storing extracted data in database...');
    
    try {
      // Store personal information
      if (data.personalInfo) {
        const { error: personalError } = await supabase
          .from('personal_information')
          .upsert({ 
            report_id: reportId, 
            ...data.personalInfo 
          });
        
        if (personalError) {
          console.error('Error storing personal info:', personalError);
        }
      }

      // Store credit accounts
      if (data.accounts && data.accounts.length > 0) {
        const { error: accountsError } = await supabase
          .from('credit_accounts')
          .upsert(
            data.accounts.map((account: any) => ({
              report_id: reportId,
              ...account
            }))
          );
        
        if (accountsError) {
          console.error('Error storing accounts:', accountsError);
        }
      }

      // Store inquiries
      if (data.inquiries && data.inquiries.length > 0) {
        const { error: inquiriesError } = await supabase
          .from('credit_inquiries')
          .upsert(
            data.inquiries.map((inquiry: any) => ({
              report_id: reportId,
              ...inquiry
            }))
          );
        
        if (inquiriesError) {
          console.error('Error storing inquiries:', inquiriesError);
        }
      }

      // Store negative items
      if (data.negativeItems && data.negativeItems.length > 0) {
        const { error: negativeError } = await supabase
          .from('negative_items')
          .upsert(
            data.negativeItems.map((item: any) => ({
              report_id: reportId,
              ...item
            }))
          );
        
        if (negativeError) {
          console.error('Error storing negative items:', negativeError);
        }
      }

      console.log('✅ Data storage completed');
    } catch (error) {
      console.error('❌ Error storing extracted data:', error);
      throw error;
    }
  }
}