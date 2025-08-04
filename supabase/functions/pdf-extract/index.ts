import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ParsedCreditData {
  personalInfo?: {
    full_name?: string;
    date_of_birth?: string;
    ssn_partial?: string;
    current_address?: any;
    phone_numbers?: string[];
    employer_info?: any;
  };
  accounts: Array<{
    creditor_name: string;
    account_number?: string;
    account_type?: string;
    account_status?: string;
    payment_status?: string;
    date_opened?: string;
    date_closed?: string;
    credit_limit?: number;
    high_credit?: number;
    current_balance?: number;
    past_due_amount?: number;
    monthly_payment?: number;
    payment_history?: any;
    terms?: string;
    responsibility?: string;
    is_negative?: boolean;
    bureau_reporting?: string[];
  }>;
  inquiries: Array<{
    inquirer_name: string;
    inquiry_date?: string;
    inquiry_type?: string;
    purpose?: string;
  }>;
  negativeItems: Array<{
    negative_type: string;
    creditor_name?: string;
    original_creditor?: string;
    account_number?: string;
    amount?: number;
    date_occurred?: string;
    date_reported?: string;
    status?: string;
    description?: string;
    severity_score?: number;
  }>;
  scores: Array<{
    bureau: string;
    score?: number;
    score_date?: string;
    score_model?: string;
    factors?: string[];
  }>;
  publicRecords: Array<{
    record_type: string;
    filing_date?: string;
    court_name?: string;
    case_number?: string;
    amount?: number;
    status?: string;
    liability?: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { reportId } = await req.json();
    console.log('🚀 Processing PDF for report:', reportId);

    // Get the report details
    const { data: report, error: reportError } = await supabase
      .from('credit_reports')
      .select('file_path, file_name')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      throw new Error('Report not found');
    }

    if (!report.file_path) {
      throw new Error('No file uploaded for this report');
    }

    // Get the file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('credit-reports')
      .download(report.file_path);

    if (fileError || !fileData) {
      throw new Error('Failed to download file from storage');
    }

    // Convert file to base64 for PDF processing
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Simple text extraction using basic PDF parsing
    let rawText = '';
    try {
      // Convert to string and extract readable text
      const textDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false });
      const fullText = textDecoder.decode(uint8Array);
      
      // Extract text between stream objects and clean it
      const textMatches = fullText.match(/stream([\\s\\S]*?)endstream/g) || [];
      for (const match of textMatches) {
        const content = match.replace(/^stream/, '').replace(/endstream$/, '').trim();
        // Filter out binary data and keep only readable text
        const cleanText = content.replace(/[^\\x20-\\x7E\\n\\r\\t]/g, ' ').replace(/\\s+/g, ' ').trim();
        if (cleanText.length > 10) {
          rawText += cleanText + '\n';
        }
      }

      // If no readable text found, try alternative extraction
      if (rawText.length < 100) {
        const allText = textDecoder.decode(uint8Array);
        const readableText = allText.replace(/[^\\x20-\\x7E\\n\\r\\t]/g, ' ').replace(/\\s+/g, ' ').trim();
        rawText = readableText;
      }

    } catch (error) {
      console.error('Text extraction error:', error);
      throw new Error('Failed to extract text from PDF');
    }

    console.log('📄 Extracted text length:', rawText.length);

    // Store raw text in the database
    await supabase
      .from('credit_reports')
      .update({ raw_text: rawText })
      .eq('id', reportId);

    // Parse the extracted text into structured data
    const parsedData = parseTextToCreditData(rawText);

    console.log('📊 Parsed data summary:', {
      personalInfo: !!parsedData.personalInfo?.full_name,
      accounts: parsedData.accounts.length,
      inquiries: parsedData.inquiries.length,
      negativeItems: parsedData.negativeItems.length,
      scores: parsedData.scores.length,
      publicRecords: parsedData.publicRecords.length
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: parsedData,
        textLength: rawText.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ PDF processing error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

function parseTextToCreditData(text: string): ParsedCreditData {
  console.log('🔍 Parsing credit report text...');
  
  const result: ParsedCreditData = {
    personalInfo: {},
    accounts: [],
    inquiries: [],
    negativeItems: [],
    scores: [],
    publicRecords: []
  };

  // Parse personal information
  const personalInfo = parsePersonalInfo(text);
  if (personalInfo) {
    result.personalInfo = personalInfo;
  }

  // Parse credit accounts
  result.accounts = parseAccounts(text);

  // Parse inquiries
  result.inquiries = parseInquiries(text);

  // Parse negative items
  result.negativeItems = parseNegativeItems(text);

  // Parse credit scores
  result.scores = parseScores(text);

  // Parse public records
  result.publicRecords = parsePublicRecords(text);

  return result;
}

function parsePersonalInfo(text: string) {
  const info: any = {};

  // Name patterns
  const namePatterns = [
    /(?:Name|Consumer Name)[:\s]*([A-Z][A-Za-z\s]+)/i,
    /^([A-Z][A-Z\s]+)$/m
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length > 2) {
      info.full_name = match[1].trim();
      break;
    }
  }

  // Date of birth
  const dobMatch = text.match(/(?:Date of Birth|DOB)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (dobMatch) {
    info.date_of_birth = dobMatch[1];
  }

  // SSN (partial)
  const ssnMatch = text.match(/(?:SSN|Social Security)[:\s]*(XXX-XX-\d{4}|\*\*\*-\*\*-\d{4})/i);
  if (ssnMatch) {
    info.ssn_partial = ssnMatch[1];
  }

  // Address
  const addressMatch = text.match(/(?:Address|Current Address)[:\s]*([^\n]+)/i);
  if (addressMatch) {
    info.current_address = { street: addressMatch[1].trim() };
  }

  return Object.keys(info).length > 0 ? info : null;
}

function parseAccounts(text: string) {
  const accounts = [];
  
  // Look for account patterns
  const accountPatterns = [
    /([A-Z][A-Za-z\s]*(?:Bank|Card|Credit|Loan|Financial))[^\n]*(?:\n[^\n]*){0,10}(?:Balance|Limit|Payment)/gi
  ];

  for (const pattern of accountPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const accountText = match[0];
      const account = parseAccountBlock(accountText);
      if (account && account.creditor_name) {
        accounts.push(account);
      }
    }
  }

  return accounts;
}

function parseAccountBlock(block: string) {
  const account: any = {
    creditor_name: '',
    account_type: 'Credit Card',
    is_negative: false
  };

  // Extract creditor name
  const lines = block.split('\n').filter(line => line.trim());
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    const creditorMatch = firstLine.match(/([A-Z][A-Za-z\s]*(?:Bank|Card|Credit|Loan|Financial))/i);
    if (creditorMatch) {
      account.creditor_name = creditorMatch[1].trim();
    }
  }

  // Account number
  const accountNumMatch = block.match(/(?:Account|Acct)[:\s#]*([*\dX-]+)/i);
  if (accountNumMatch) {
    account.account_number = accountNumMatch[1];
  }

  // Balance
  const balanceMatch = block.match(/(?:Balance|Bal)[:\s]*\$?([0-9,]+)/i);
  if (balanceMatch) {
    account.current_balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
  }

  // Credit limit
  const limitMatch = block.match(/(?:Limit|Credit Limit)[:\s]*\$?([0-9,]+)/i);
  if (limitMatch) {
    account.credit_limit = parseFloat(limitMatch[1].replace(/,/g, ''));
  }

  // Payment status
  const statusMatch = block.match(/(?:Payment|Status)[:\s]*([A-Za-z\s]+)/i);
  if (statusMatch) {
    account.payment_status = statusMatch[1].trim();
  }

  return account.creditor_name ? account : null;
}

function parseInquiries(text: string) {
  const inquiries = [];
  
  const inquiryPattern = /([A-Z][A-Za-z\s]*(?:Bank|Financial|Wireless|Inc|LLC))[^\n]*(?:Date|Inquiry)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
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

function parseNegativeItems(text: string) {
  const negativeItems = [];
  
  const collectionPattern = /([A-Za-z\s]*Collection[s]?)[^\n]*(?:Amount|Original)[:\s]*\$?([0-9,]+)?/gi;
  const matches = text.matchAll(collectionPattern);

  for (const match of matches) {
    negativeItems.push({
      negative_type: 'Collection',
      creditor_name: match[1].trim(),
      amount: match[2] ? parseFloat(match[2].replace(/,/g, '')) : null,
      severity_score: 8
    });
  }

  return negativeItems;
}

function parseScores(text: string) {
  const scores = [];
  
  const scorePattern = /(?:FICO|Score)[:\s]*(\d{3})/gi;
  const matches = text.matchAll(scorePattern);

  for (const match of matches) {
    const score = parseInt(match[1]);
    if (score >= 300 && score <= 850) {
      scores.push({
        bureau: 'Unknown',
        score: score,
        score_model: 'FICO'
      });
    }
  }

  return scores;
}

function parsePublicRecords(text: string) {
  const publicRecords = [];
  
  const bankruptcyPattern = /(Bankruptcy|Chapter \d+)[^\n]*(?:Filed|Date)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})?/gi;
  const matches = text.matchAll(bankruptcyPattern);

  for (const match of matches) {
    publicRecords.push({
      record_type: 'Bankruptcy',
      filing_date: match[2] || null,
      status: 'Filed'
    });
  }

  return publicRecords;
}
