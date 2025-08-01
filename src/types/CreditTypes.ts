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
    estimatedScoreImpact: number;
    bureausAffected: string[];
    highImpactItems: number;
    mediumImpactItems: number;
    lowImpactItems: number;
  };
  personalInfo: {
    name?: string;
    address?: string;
    ssn?: string;
    dateOfBirth?: string;
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
  type: 'validation' | 'verification' | 'goodwill' | 'cease_and_desist';
}