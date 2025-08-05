import { supabase } from '@/integrations/supabase/client';

export interface CreditReportParsedData {
  reportHeader: {
    referenceNumber: string;
    reportDate: string;
    alerts: Array<{
      bureau: 'TransUnion' | 'Experian' | 'Equifax';
      alertType: string;
      alertText: string;
      contactPhone?: string;
      alertDate?: string;
      expiryDate?: string;
    }>;
  };
  personalInfo: {
    [bureau: string]: {
      fullName: string;
      alsoKnownAs: string[];
      dateOfBirth?: string;
      ssnLastFour?: string;
    };
  };
  addresses: {
    [bureau: string]: Array<{
      addressType: 'current' | 'previous';
      streetAddress: string;
      city?: string;
      state?: string;
      zipCode?: string;
      dateReported?: string;
    }>;
  };
  creditScores: {
    [bureau: string]: {
      score?: number;
      scoreRank?: string;
      scoreScaleMin: number;
      scoreScaleMax: number;
      riskFactors: string[];
    };
  };
  accountSummary: {
    [bureau: string]: {
      totalAccounts: number;
      openAccounts: number;
      closedAccounts: number;
      delinquentAccounts: number;
      derogatoryAccounts: number;
      collectionAccounts: number;
      totalBalance?: number;
      totalPayments?: number;
      publicRecords: number;
      inquiries2Years: number;
    };
  };
  accounts: Array<{
    bureau: 'TransUnion' | 'Experian' | 'Equifax';
    creditorName: string;
    accountNumberMasked: string;
    accountType: 'Revolving' | 'Installment' | 'Mortgage';
    accountSubtype?: string;
    accountStatus: 'Open' | 'Closed' | 'Derogatory';
    paymentStatus: string;
    currentBalance?: number;
    creditLimit?: number;
    highCredit?: number;
    monthlyPayment?: number;
    pastDueAmount?: number;
    dateOpened?: string;
    dateClosed?: string;
    lastReported?: string;
    lastActive?: string;
    lastPayment?: string;
    loanTermMonths?: number;
    comments?: string;
    disputeFlag: boolean;
    paymentHistory: Array<{
      month: number;
      year: number;
      status: 'OK' | '30' | '60' | '90' | '120' | 'CO' | 'NA' | null;
    }>;
  }>;
  inquiries: Array<{
    bureau: 'TransUnion' | 'Experian' | 'Equifax';
    creditorName: string;
    businessType?: string;
    inquiryDate: string;
    inquiryType: 'hard' | 'soft';
  }>;
  creditorContacts: Array<{
    creditorName: string;
    address?: string;
    phoneNumber?: string;
  }>;
}

export class ComprehensiveCreditParser {
  private static readonly BUREAUS = ['TransUnion', 'Experian', 'Equifax'] as const;
  
  static async parseReport(
    reportId: string, 
    extractedText?: string
  ): Promise<{ success: boolean; error?: string; data?: CreditReportParsedData }> {
    // If no extractedText provided, get it from the database
    if (!extractedText) {
      const { data: report } = await supabase
        .from('credit_reports')
        .select('raw_text')
        .eq('id', reportId)
        .single();
      
      if (!report?.raw_text) {
        throw new Error('No raw text found for this report');
      }
      
      extractedText = report.raw_text;
    }
    try {
      console.log('🔍 Starting comprehensive credit report parsing...');
      
      // Step 1: Parse the extracted text into structured data
      const parsedData = await this.parseTextToStructuredData(extractedText);
      
      if (!parsedData) {
        throw new Error('Failed to parse credit report text into structured data');
      }

      // Step 2: Store the parsed data in Supabase
      await this.storeStructuredDataInSupabase(reportId, parsedData);
      
      console.log('✅ Credit report parsing and storage completed successfully');
      
      return { success: true, data: parsedData };
    } catch (error) {
      console.error('❌ Error in comprehensive credit report parsing:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown parsing error' 
      };
    }
  }

  private static async parseTextToStructuredData(text: string): Promise<CreditReportParsedData | null> {
    console.log('📄 Parsing text into structured data...');
    
    // Initialize result structure
    const result: CreditReportParsedData = {
      reportHeader: {
        referenceNumber: '',
        reportDate: '',
        alerts: []
      },
      personalInfo: {},
      addresses: {},
      creditScores: {},
      accountSummary: {},
      accounts: [],
      inquiries: [],
      creditorContacts: []
    };

    // Step 1: Extract report header information
    result.reportHeader = this.extractReportHeader(text);
    
    // Step 2: Extract data for each bureau
    for (const bureau of this.BUREAUS) {
      try {
        // Extract bureau-specific sections
        const bureauSection = this.extractBureauSection(text, bureau);
        
        if (bureauSection) {
          // Parse personal information
          const personalInfo = this.parsePersonalInformation(bureauSection, bureau);
          if (personalInfo) {
            result.personalInfo[bureau] = personalInfo;
          }

          // Parse addresses
          const addresses = this.parseAddresses(bureauSection, bureau);
          if (addresses.length > 0) {
            result.addresses[bureau] = addresses;
          }

          // Parse credit scores
          const creditScore = this.parseCreditScore(bureauSection, bureau);
          if (creditScore) {
            result.creditScores[bureau] = creditScore;
          }

          // Parse account summary
          const accountSummary = this.parseAccountSummary(bureauSection, bureau);
          if (accountSummary) {
            result.accountSummary[bureau] = accountSummary;
          }

          // Parse accounts
          const accounts = this.parseAccounts(bureauSection, bureau);
          result.accounts.push(...accounts);

          // Parse inquiries
          const inquiries = this.parseInquiries(bureauSection, bureau);
          result.inquiries.push(...inquiries);
        }
      } catch (error) {
        console.warn(`⚠️ Error parsing ${bureau} section:`, error);
        // Continue with other bureaus even if one fails
      }
    }

    // Step 3: Extract creditor contacts (bureau-independent)
    result.creditorContacts = this.parseCreditorContacts(text);

    return result;
  }

  private static extractReportHeader(text: string): CreditReportParsedData['reportHeader'] {
    const header = {
      referenceNumber: '',
      reportDate: '',
      alerts: [] as Array<{
        bureau: 'TransUnion' | 'Experian' | 'Equifax';
        alertType: string;
        alertText: string;
        contactPhone?: string;
        alertDate?: string;
        expiryDate?: string;
      }>
    };

    // Extract reference number
    const refMatch = text.match(/Reference\s*#?\s*:?\s*([A-Z0-9]+)/i);
    if (refMatch) {
      header.referenceNumber = refMatch[1];
    }

    // Extract report date
    const dateMatch = text.match(/Report\s*Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (dateMatch) {
      header.reportDate = this.normalizeDate(dateMatch[1]);
    }

    // Extract alerts
    const alertPatterns = [
      /FRAUD\s*ALERT/gi,
      /SECURITY\s*ALERT/gi,
      /INITIAL\s*FRAUD/gi
    ];

    for (const pattern of alertPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const alertIndex = match.index || 0;
        const alertSection = text.substring(alertIndex, alertIndex + 500);
        
        // Extract phone number from alert
        const phoneMatch = alertSection.match(/(\d{3}-\d{3}-\d{4})/);
        
        // Determine bureau (simple heuristic)
        let bureau: 'TransUnion' | 'Experian' | 'Equifax' = 'TransUnion';
        if (alertSection.toLowerCase().includes('experian')) bureau = 'Experian';
        if (alertSection.toLowerCase().includes('equifax')) bureau = 'Equifax';

        header.alerts.push({
          bureau,
          alertType: match[0],
          alertText: alertSection.substring(0, 200),
          contactPhone: phoneMatch ? phoneMatch[1] : undefined
        });
      }
    }

    return header;
  }

  private static extractBureauSection(text: string, bureau: string): string | null {
    // This is a simplified extraction - in practice, you'd need more sophisticated
    // section identification based on the specific credit report format
    const bureauPattern = new RegExp(`${bureau}[\\s\\S]*?(?=${this.BUREAUS.filter(b => b !== bureau).join('|')}|$)`, 'i');
    const match = text.match(bureauPattern);
    return match ? match[0] : null;
  }

  private static parsePersonalInformation(text: string, bureau: string) {
    const info = {
      fullName: '',
      alsoKnownAs: [] as string[],
      dateOfBirth: undefined as string | undefined,
      ssnLastFour: undefined as string | undefined
    };

    // Extract name
    const nameMatch = text.match(/Name\s*:?\s*([A-Z\s]+)/i);
    if (nameMatch) {
      info.fullName = nameMatch[1].trim();
    }

    // Extract aliases
    const aliasMatch = text.match(/Also\s*Known\s*As\s*:?\s*([\s\S]*?)(?:\n|Date)/i);
    if (aliasMatch) {
      const aliases = aliasMatch[1].split(/[,\n]/).map(alias => alias.trim()).filter(Boolean);
      info.alsoKnownAs = aliases;
    }

    // Extract date of birth
    const dobMatch = text.match(/Date\s*of\s*Birth\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4})/i);
    if (dobMatch) {
      info.dateOfBirth = dobMatch[1];
    }

    // Extract SSN last four
    const ssnMatch = text.match(/SSN\s*:?\s*\*{3}-\*{2}-(\d{4})/i);
    if (ssnMatch) {
      info.ssnLastFour = ssnMatch[1];
    }

    return info.fullName ? info : null;
  }

  private static parseAddresses(text: string, bureau: string) {
    const addresses: Array<{
      addressType: 'current' | 'previous';
      streetAddress: string;
      city?: string;
      state?: string;
      zipCode?: string;
      dateReported?: string;
    }> = [];

    // This is a simplified address parser - real implementation would be more complex
    const addressPattern = /(\d+\s+[A-Z\s]+(?:ST|AVE|BLVD|RD|DR|LN|CT|PL))\s*([A-Z\s]+),?\s*([A-Z]{2})\s*(\d{5})/gi;
    
    let match;
    while ((match = addressPattern.exec(text)) !== null) {
      addresses.push({
        addressType: addresses.length === 0 ? 'current' : 'previous',
        streetAddress: match[1].trim(),
        city: match[2].trim(),
        state: match[3],
        zipCode: match[4]
      });
    }

    return addresses;
  }

  private static parseCreditScore(text: string, bureau: string) {
    const score = {
      score: undefined as number | undefined,
      scoreRank: undefined as string | undefined,
      scoreScaleMin: 300,
      scoreScaleMax: 850,
      riskFactors: [] as string[]
    };

    // Extract score
    const scorePattern = new RegExp(`${bureau}[\\s\\S]*?Score[\\s:]*?(\\d{3})`, 'i');
    const scoreMatch = text.match(scorePattern);
    if (scoreMatch) {
      score.score = parseInt(scoreMatch[1]);
    }

    // Extract rank
    const rankPatterns = ['Excellent', 'Great', 'Good', 'Fair', 'Poor'];
    for (const rank of rankPatterns) {
      if (text.toLowerCase().includes(rank.toLowerCase())) {
        score.scoreRank = rank;
        break;
      }
    }

    // Extract risk factors (simplified)
    const riskFactorSection = text.match(/Risk\s*Factors?[:\s]*([\s\S]*?)(?:\n\n|\n[A-Z])/i);
    if (riskFactorSection) {
      const factors = riskFactorSection[1].split('\n').map(f => f.trim()).filter(Boolean);
      score.riskFactors = factors.slice(0, 5); // Limit to top 5
    }

    return score.score ? score : null;
  }

  private static parseAccountSummary(text: string, bureau: string) {
    // Simplified account summary parsing
    return {
      totalAccounts: this.extractNumber(text, 'Total Accounts') || 0,
      openAccounts: this.extractNumber(text, 'Open Accounts') || 0,
      closedAccounts: this.extractNumber(text, 'Closed Accounts') || 0,
      delinquentAccounts: this.extractNumber(text, 'Delinquent') || 0,
      derogatoryAccounts: this.extractNumber(text, 'Derogatory') || 0,
      collectionAccounts: this.extractNumber(text, 'Collection') || 0,
      totalBalance: this.extractDollarAmount(text, 'Total Balance'),
      totalPayments: this.extractDollarAmount(text, 'Total Payments'),
      publicRecords: this.extractNumber(text, 'Public Records') || 0,
      inquiries2Years: this.extractNumber(text, 'Inquiries') || 0
    };
  }

  private static parseAccounts(text: string, bureau: string) {
    const accounts: CreditReportParsedData['accounts'] = [];
    
    // This is a very simplified account parser
    // Real implementation would need sophisticated pattern matching
    
    const accountPattern = /([A-Z\s]+)\s+([\d\*]+)\s+Revolving|Installment/gi;
    let match;
    
    while ((match = accountPattern.exec(text)) !== null) {
      const account = {
        bureau: bureau as 'TransUnion' | 'Experian' | 'Equifax',
        creditorName: match[1].trim(),
        accountNumberMasked: match[2],
        accountType: 'Revolving' as const,
        accountSubtype: 'Credit Card',
        accountStatus: 'Open' as const,
        paymentStatus: 'Current',
        currentBalance: 0,
        creditLimit: undefined,
        highCredit: undefined,
        monthlyPayment: undefined,
        pastDueAmount: 0,
        dateOpened: undefined,
        dateClosed: undefined,
        lastReported: undefined,
        lastActive: undefined,
        lastPayment: undefined,
        loanTermMonths: undefined,
        comments: undefined,
        disputeFlag: false,
        paymentHistory: [] as Array<{
          month: number;
          year: number;
          status: 'OK' | '30' | '60' | '90' | '120' | 'CO' | 'NA' | null;
        }>
      };
      
      accounts.push(account);
    }
    
    return accounts;
  }

  private static parseInquiries(text: string, bureau: string) {
    const inquiries: CreditReportParsedData['inquiries'] = [];
    
    // Simplified inquiry parsing
    const inquiryPattern = /([A-Z\s]+)\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi;
    let match;
    
    while ((match = inquiryPattern.exec(text)) !== null) {
      inquiries.push({
        bureau: bureau as 'TransUnion' | 'Experian' | 'Equifax',
        creditorName: match[1].trim(),
        businessType: undefined,
        inquiryDate: this.normalizeDate(match[2]),
        inquiryType: 'hard'
      });
    }
    
    return inquiries;
  }

  private static parseCreditorContacts(text: string) {
    const contacts: CreditReportParsedData['creditorContacts'] = [];
    
    // Simplified contact parsing
    const contactPattern = /([A-Z\s]+)\s+([\d\s\-\(\)]+)\s*([A-Z\s,]+)/gi;
    let match;
    
    while ((match = contactPattern.exec(text)) !== null) {
      contacts.push({
        creditorName: match[1].trim(),
        phoneNumber: match[2].replace(/\D/g, ''),
        address: match[3].trim()
      });
    }
    
    return contacts;
  }

  private static async storeStructuredDataInSupabase(reportId: string, data: CreditReportParsedData) {
    console.log('💾 Storing structured data in Supabase...');

    try {
      // Update credit report with header info
      if (data.reportHeader.referenceNumber || data.reportHeader.reportDate) {
        await supabase
          .from('credit_reports')
          .update({
            reference_number: data.reportHeader.referenceNumber || null,
            report_date: data.reportHeader.reportDate || null
          })
          .eq('id', reportId);
      }

      // Store credit alerts
      for (const alert of data.reportHeader.alerts) {
        await supabase
          .from('credit_alerts')
          .insert({
            report_id: reportId,
            bureau: alert.bureau,
            alert_type: alert.alertType,
            alert_text: alert.alertText,
            contact_phone: alert.contactPhone,
            alert_date: alert.alertDate ? new Date(alert.alertDate).toISOString().split('T')[0] : null,
            expiry_date: alert.expiryDate ? new Date(alert.expiryDate).toISOString().split('T')[0] : null
          });
      }

      // Store personal information for each bureau
      for (const [bureau, info] of Object.entries(data.personalInfo)) {
        await supabase
          .from('personal_information')
          .insert({
            report_id: reportId,
            bureau: bureau as 'TransUnion' | 'Experian' | 'Equifax',
            full_name: info.fullName,
            also_known_as: info.alsoKnownAs,
            date_of_birth: info.dateOfBirth,
            ssn_partial: info.ssnLastFour
          });
      }

      // Store addresses for each bureau
      for (const [bureau, addresses] of Object.entries(data.addresses)) {
        for (const address of addresses) {
          await supabase
            .from('addresses')
            .insert({
              report_id: reportId,
              bureau: bureau as 'TransUnion' | 'Experian' | 'Equifax',
              address_type: address.addressType,
              street_address: address.streetAddress,
              city: address.city,
              state: address.state,
              zip_code: address.zipCode,
              date_reported: address.dateReported ? new Date(address.dateReported).toISOString().split('T')[0] : null
            });
        }
      }

      // Store credit scores for each bureau
      for (const [bureau, score] of Object.entries(data.creditScores)) {
        await supabase
          .from('credit_scores')
          .insert({
            report_id: reportId,
            bureau: bureau as 'TransUnion' | 'Experian' | 'Equifax',
            score: score.score,
            score_rank: score.scoreRank,
            score_scale_min: score.scoreScaleMin,
            score_scale_max: score.scoreScaleMax,
            risk_factors: score.riskFactors
          });
      }

      // Store account summary for each bureau
      for (const [bureau, summary] of Object.entries(data.accountSummary)) {
        await supabase
          .from('account_summary')
          .insert({
            report_id: reportId,
            bureau: bureau as 'TransUnion' | 'Experian' | 'Equifax',
            total_accounts: summary.totalAccounts,
            open_accounts: summary.openAccounts,
            closed_accounts: summary.closedAccounts,
            delinquent_accounts: summary.delinquentAccounts,
            derogatory_accounts: summary.derogatoryAccounts,
            collection_accounts: summary.collectionAccounts,
            total_balance: summary.totalBalance,
            total_payments: summary.totalPayments,
            public_records: summary.publicRecords,
            inquiries_2_years: summary.inquiries2Years
          });
      }

      // Store accounts
      for (const account of data.accounts) {
        const { data: insertedAccount } = await supabase
          .from('credit_accounts')
          .insert({
            report_id: reportId,
            bureau: account.bureau,
            creditor_name: account.creditorName,
            account_number_masked: account.accountNumberMasked,
            account_type: account.accountType.toLowerCase(),
            account_subtype: account.accountSubtype,
            account_status: account.accountStatus.toLowerCase(),
            payment_status: account.paymentStatus,
            current_balance: account.currentBalance,
            credit_limit: account.creditLimit,
            high_credit: account.highCredit,
            monthly_payment: account.monthlyPayment,
            past_due_amount: account.pastDueAmount,
            date_opened: account.dateOpened ? new Date(account.dateOpened).toISOString().split('T')[0] : null,
            date_closed: account.dateClosed ? new Date(account.dateClosed).toISOString().split('T')[0] : null,
            last_reported: account.lastReported ? new Date(account.lastReported).toISOString().split('T')[0] : null,
            last_active: account.lastActive ? new Date(account.lastActive).toISOString().split('T')[0] : null,
            last_payment: account.lastPayment ? new Date(account.lastPayment).toISOString().split('T')[0] : null,
            loan_term_months: account.loanTermMonths,
            comments: account.comments,
            dispute_flag: account.disputeFlag
          })
          .select()
          .single();

        // Store payment history for this account
        if (insertedAccount && account.paymentHistory.length > 0) {
          for (const payment of account.paymentHistory) {
            await supabase
              .from('payment_history')
              .insert({
                account_id: insertedAccount.id,
                bureau: account.bureau,
                month: payment.month,
                year: payment.year,
                status: payment.status
              });
          }
        }
      }

      // Store inquiries
      for (const inquiry of data.inquiries) {
        await supabase
          .from('credit_inquiries')
          .insert({
            report_id: reportId,
            bureau: inquiry.bureau,
            inquirer_name: inquiry.creditorName,
            business_type: inquiry.businessType,
            inquiry_date: new Date(inquiry.inquiryDate).toISOString().split('T')[0],
            inquiry_type: inquiry.inquiryType
          });
      }

      // Store creditor contacts
      for (const contact of data.creditorContacts) {
        await supabase
          .from('creditor_contacts')
          .insert({
            report_id: reportId,
            creditor_name: contact.creditorName,
            address: contact.address,
            phone_number: contact.phoneNumber
          });
      }

      console.log('✅ All structured data stored successfully in Supabase');
    } catch (error) {
      console.error('❌ Error storing data in Supabase:', error);
      throw error;
    }
  }

  // Helper methods
  private static extractNumber(text: string, pattern: string): number | null {
    const regex = new RegExp(`${pattern}[\\s:]*?(\\d+)`, 'i');
    const match = text.match(regex);
    return match ? parseInt(match[1]) : null;
  }

  private static extractDollarAmount(text: string, pattern: string): number | null {
    const regex = new RegExp(`${pattern}[\\s:]*?\\$([\\d,]+(?:\\.\\d{2})?)`, 'i');
    const match = text.match(regex);
    return match ? parseFloat(match[1].replace(/,/g, '')) : null;
  }

  private static normalizeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch {
      return dateStr; // Return original if parsing fails
    }
  }
}