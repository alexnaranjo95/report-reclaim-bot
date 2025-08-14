import { parse } from 'node-html-parser';
import { CreditReportSchema, type CreditReport, type AccountDetails, type CreditorContact } from './schema';

// Helper function to extract creditor contacts from HTML
function extractCreditorContacts(htmlString: string): CreditorContact[] {
  if (!htmlString) return [];
  
  try {
    const root = parse(htmlString);
    const contacts: CreditorContact[] = [];
    
    // Look for common patterns in credit report HTML
    const tables = root.querySelectorAll('table');
    
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const name = cells[0]?.text?.trim();
          const address = cells[1]?.text?.trim();
          
          if (name && address) {
            contacts.push({
              name,
              address,
              phone: cells[2]?.text?.trim(),
              website: cells[3]?.text?.trim(),
            });
          }
        }
      });
    });
    
    return contacts;
  } catch (error) {
    console.warn('Failed to parse creditor contacts HTML:', error);
    return [];
  }
}

// Helper function to group accounts by creditor
function groupAccountsByCreditor(accounts: AccountDetails[]): Record<string, AccountDetails[]> {
  return accounts.reduce((groups, account) => {
    const creditor = account.creditorName || 'Unknown Creditor';
    if (!groups[creditor]) {
      groups[creditor] = [];
    }
    groups[creditor].push(account);
    return groups;
  }, {} as Record<string, AccountDetails[]>);
}

// Helper function to map various field names to standard schema
function mapFields(obj: any, fieldMappings: Record<string, string[]>): any {
  const mapped: any = {};
  
  for (const [standardField, possibleFields] of Object.entries(fieldMappings)) {
    for (const field of possibleFields) {
      if (obj[field] !== undefined && obj[field] !== null && obj[field] !== '') {
        mapped[standardField] = obj[field];
        break;
      }
    }
  }
  
  return mapped;
}

// Main mapping function
export function mapJsonToSchema(rawData: any): CreditReport {
  try {
    // Handle different JSON structures
    const data = rawData?.report || rawData?.creditReport || rawData;
    
    // Map personal information
    const personalInfo = data.personalInformation || data.personal || data.consumer || {};
    const mappedPersonal = mapFields(personalInfo, {
      fullName: ['fullName', 'name', 'consumerName', 'full_name'],
      firstName: ['firstName', 'first_name', 'fname'],
      lastName: ['lastName', 'last_name', 'lname'],
      birthDate: ['birthDate', 'dateOfBirth', 'birth_date', 'dob'],
      ssn: ['ssn', 'socialSecurityNumber', 'social_security_number'],
      phone: ['phone', 'phoneNumber', 'telephone'],
    });
    
    // Map addresses
    const addresses = data.addresses || personalInfo.addresses || [];
    const mappedAddresses = Array.isArray(addresses) ? addresses.map((addr: any) =>
      mapFields(addr, {
        type: ['type', 'addressType', 'kind'],
        street: ['street', 'address', 'streetAddress', 'line1'],
        city: ['city', 'municipality'],
        state: ['state', 'province', 'region'],
        postalCode: ['postalCode', 'zipCode', 'zip', 'postal_code'],
      })
    ) : [];
    
    // Map credit scores
    const scores = data.creditScores || data.scores || [];
    const mappedScores = Array.isArray(scores) ? scores.map((score: any) =>
      mapFields(score, {
        bureau: ['bureau', 'source', 'provider'],
        score: ['score', 'value', 'creditScore'],
        date: ['date', 'reportDate', 'scoreDate'],
        model: ['model', 'scoreModel', 'version'],
      })
    ) : [];
    
    // Map account summary
    const summary = data.accountSummary || data.summary || {};
    const mappedSummary = mapFields(summary, {
      totalAccounts: ['totalAccounts', 'total_accounts', 'accountCount'],
      openAccounts: ['openAccounts', 'open_accounts', 'activeAccounts'],
      closedAccounts: ['closedAccounts', 'closed_accounts', 'inactiveAccounts'],
      delinquentAccounts: ['delinquentAccounts', 'delinquent_accounts', 'pastDueAccounts'],
      totalBalance: ['totalBalance', 'total_balance', 'aggregateBalance'],
      totalCreditLimit: ['totalCreditLimit', 'total_credit_limit', 'aggregateLimit'],
    });
    
    // Map account details
    const accounts = data.accountDetails || data.accounts || data.tradelines || [];
    const mappedAccounts = Array.isArray(accounts) ? accounts.map((account: any) =>
      mapFields(account, {
        creditorName: ['creditorName', 'creditor', 'lender', 'company'],
        accountNumber: ['accountNumber', 'account_number', 'number'],
        accountType: ['accountType', 'account_type', 'type'],
        balance: ['balance', 'currentBalance', 'amount'],
        creditLimit: ['creditLimit', 'credit_limit', 'limit', 'highCredit'],
        status: ['status', 'accountStatus', 'paymentStatus'],
        openDate: ['openDate', 'open_date', 'dateOpened'],
        lastPaymentDate: ['lastPaymentDate', 'last_payment_date'],
        lastReportedDate: ['lastReportedDate', 'last_reported_date', 'reportDate'],
      })
    ) : [];
    
    // Map inquiries
    const inquiries = data.inquiries || [];
    const mappedInquiries = Array.isArray(inquiries) ? inquiries.map((inquiry: any) =>
      mapFields(inquiry, {
        creditorName: ['creditorName', 'creditor', 'company', 'subscriber'],
        date: ['date', 'inquiryDate', 'dateOfInquiry'],
        type: ['type', 'inquiryType'],
        bureau: ['bureau', 'source'],
      })
    ) : [];
    
    // Map public records
    const publicRecords = data.publicRecords || data.public || [];
    const mappedPublicRecords = Array.isArray(publicRecords) ? publicRecords.map((record: any) =>
      mapFields(record, {
        type: ['type', 'recordType', 'kind'],
        filingDate: ['filingDate', 'filing_date', 'dateField'],
        status: ['status', 'recordStatus'],
        amount: ['amount', 'liability', 'debt'],
        court: ['court', 'courthouse', 'jurisdiction'],
      })
    ) : [];
    
    // Extract creditor contacts from HTML fields
    let creditorContacts: CreditorContact[] = [];
    if (data.creditorContactsHtml || data.creditor_contacts_html) {
      creditorContacts = extractCreditorContacts(data.creditorContactsHtml || data.creditor_contacts_html);
    }
    
    // Construct the final mapped object
    const mappedData: CreditReport = {
      personalInformation: {
        ...mappedPersonal,
        addresses: mappedAddresses.length > 0 ? mappedAddresses : undefined,
      },
      creditScores: mappedScores.length > 0 ? mappedScores : undefined,
      accountSummary: Object.keys(mappedSummary).length > 0 ? mappedSummary : undefined,
      accountDetails: mappedAccounts.length > 0 ? mappedAccounts : undefined,
      inquiries: mappedInquiries.length > 0 ? mappedInquiries : undefined,
      publicRecords: mappedPublicRecords.length > 0 ? mappedPublicRecords : undefined,
      creditorContacts: creditorContacts.length > 0 ? creditorContacts : undefined,
      reportDate: data.reportDate || data.report_date,
      reportSource: data.source || data.bureau || data.provider,
    };
    
    // Validate against schema
    const result = CreditReportSchema.safeParse(mappedData);
    
    if (!result.success) {
      console.warn('Schema validation failed:', result.error);
      // Return the mapped data anyway, but log the validation errors
    }
    
    return mappedData;
    
  } catch (error) {
    console.error('Error mapping JSON to schema:', error);
    // Return minimal valid structure
    return {
      personalInformation: undefined,
      creditScores: undefined,
      accountSummary: undefined,
      accountDetails: undefined,
      inquiries: undefined,
      publicRecords: undefined,
      creditorContacts: undefined,
    };
  }
}

// Export utility functions
export { groupAccountsByCreditor, extractCreditorContacts, mapFields };