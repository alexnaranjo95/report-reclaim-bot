export interface CreditItem {
  id: string;
  creditor: string;
  account: string;
  issue: string;
  impact: 'high' | 'medium' | 'low';
  status: 'negative' | 'disputed' | 'resolved';
  bureau: string[];
  dateOpened?: string;
  lastActivity?: string;
  balance?: number;
  originalAmount?: number;
  paymentStatus?: string;
}

export interface CreditAnalysisResult {
  items: CreditItem[];
  summary: {
    totalNegativeItems: number;
    totalPositiveAccounts: number;
    totalAccounts: number;
    estimatedScoreImpact: number;
    bureausAffected: string[];
    highImpactItems: number;
    mediumImpactItems: number;
    lowImpactItems: number;
  };
  historicalData: {
    lettersSent: number;
    itemsRemoved: number;
    itemsPending: number;
    successRate: number;
    avgRemovalTime: number; // in days
  };
  accountBreakdown: {
    creditCards: number;
    mortgages: number;
    autoLoans: number;
    studentLoans: number;
    personalLoans: number;
    collections: number;
    other: number;
  };
  personalInfo: {
    name?: string;
    address?: string;
    ssn?: string;
    dateOfBirth?: string;
    phone?: string;
    employer?: string;
  };
  creditScores?: {
    experian?: number;
    equifax?: number;
    transunion?: number;
  };
}

export interface PDFAnalysisRequest {
  file: File;
  round: number;
}

export interface DisputeLetter {
  id: string;
  creditor: string;
  bureau: string;
  items: string[];
  content: string;
  status: 'draft' | 'ready' | 'sent';
  type: 'validation' | 'verification' | 'goodwill' | 'cease_and_desist' | 'comprehensive' | 'follow_up';
}

// Legacy CreditReportData interface for backward compatibility
export interface CreditReportData {
  reportHeader: {
    referenceNumber: string;
    reportDate: string;
    alerts: Array<{
      type: 'fraud' | 'dispute' | 'security';
      message: string;
      severity: 'high' | 'medium' | 'low';
      bureau?: string;
    }>;
  };
  personalInfo: {
    name: string;
    aliases: string[];
    birthDate: string;
    addresses: Array<{
      address: string;
      type: 'current' | 'previous';
      dates?: string;
    }>;
    employers: Array<{
      name: string;
      dates?: string;
    }>;
  };
  creditScores: {
    transUnion?: { score: number; rank: string; factors: string[] };
    experian?: { score: number; rank: string; factors: string[] };
    equifax?: { score: number; rank: string; factors: string[] };
  };
  accountSummary: {
    totalAccounts: number;
    openAccounts: number;
    closedAccounts: number;
    delinquentAccounts: number;
    collectionsAccounts: number;
    totalBalances: number;
    monthlyPayments: number;
    inquiries2Years: number;
  };
  accounts: Array<{
    id: string;
    creditor: string;
    accountNumber: string;
    type: 'revolving' | 'installment' | 'mortgage';
    status: 'open' | 'closed' | 'derogatory' | 'collection';
    balance: number;
    limit?: number;
    paymentHistory: Array<{
      month: string;
      status: 'ok' | 'late30' | 'late60' | 'late90' | 'chargeoff';
    }>;
    dateOpened: string;
    lastReported: string;
    lastPayment?: string;
    paymentAmount?: number;
    bureaus: string[];
  }>;
  inquiries: Array<{
    id: string;
    creditor: string;
    date: string;
    type: 'hard' | 'soft';
    purpose?: string;
  }>;
  // Add rawData to store the original JSON structure
  rawData?: any;
}