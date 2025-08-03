import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportId, filePath } = await req.json();
    
    console.log('=== PROCESSING CREDIT REPORT ===');
    console.log('Report ID:', reportId);
    console.log('File Path:', filePath);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({
        extraction_status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    // Get the file from storage
    console.log('Downloading file from storage...');
    const { data: fileData, error: fileError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);

    if (fileError || !fileData) {
      console.error('File download error:', fileError);
      throw new Error(`Cannot download file: ${fileError?.message || 'File data is null'}`);
    }

    console.log('File downloaded successfully, size:', fileData.size, 'bytes');

    // Convert PDF to text using basic extraction
    const arrayBuffer = await fileData.arrayBuffer();
    const extractedText = await extractTextFromPDF(arrayBuffer);
    
    console.log('Extracted text length:', extractedText.length);
    console.log('Text preview:', extractedText.substring(0, 500));

    if (!extractedText || extractedText.length < 50) {
      throw new Error('No meaningful text extracted from PDF');
    }

    // Save extracted text to database
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedText,
        extraction_status: 'completed',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error('Failed to save extracted text');
    }

    console.log('Text saved to database successfully');

    // Parse and store structured data
    await parseAndStoreData(supabase, reportId, extractedText);

    console.log('=== PROCESSING COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({ 
      success: true, 
      textLength: extractedText.length,
      message: 'Credit report processed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('=== PROCESSING ERROR ===');
    console.error('Error:', error);
    
    // Update report with error status
    try {
      const { reportId } = await req.json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('credit_reports')
        .update({
          extraction_status: 'failed',
          processing_errors: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('=== ROBUST PDF TEXT EXTRACTION ===');
    console.log('PDF buffer size:', arrayBuffer.byteLength);
    
    const uint8Array = new Uint8Array(arrayBuffer);
    let extractedText = '';
    
    // Method 1: Native PDF text extraction using proper PDF structure parsing
    extractedText = await extractUsingPDFStructure(uint8Array);
    
    if (extractedText.length < 100) {
      console.log('Fallback: Using regex-based text extraction...');
      extractedText = await extractUsingAdvancedRegex(uint8Array);
    }
    
    if (extractedText.length < 100) {
      console.log('Fallback: Using binary text scanning...');
      extractedText = await extractUsingBinaryScanning(uint8Array);
    }
    
    // Clean and validate
    extractedText = cleanExtractedText(extractedText);
    
    console.log('Extracted text length:', extractedText.length);
    console.log('Preview:', extractedText.substring(0, 300));
    
    // Validate content quality
    if (!isValidCreditReportText(extractedText)) {
      throw new Error('Extracted text does not contain valid credit report content');
    }
    
    return extractedText;
  } catch (error) {
    console.error('PDF extraction failed:', error);
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}

async function extractUsingPDFStructure(uint8Array: Uint8Array): Promise<string> {
  console.log('Using PDF structure-based extraction...');
  
  const textDecoder = new TextDecoder('latin1');
  const pdfString = textDecoder.decode(uint8Array);
  
  let extractedText = '';
  
  // Find text objects using proper PDF structure
  const textObjects = pdfString.match(/BT\s+[\s\S]*?ET/gs) || [];
  console.log(`Found ${textObjects.length} text objects`);
  
  for (const textObj of textObjects) {
    // Enhanced patterns for different PDF text formats
    const patterns = [
      /\(((?:[^()\\]|\\[()\\nrtbf]|\\[0-7]{3})*?)\)\s*(?:Tj|TJ)/g,
      /\[((?:\([^)]*\)|[^\[\]])*?)\]\s*TJ/g,
      /"([^"]*?)"\s*(?:Tj|TJ)/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(textObj)) !== null) {
        let text = match[1];
        
        // Handle PDF text encoding
        text = decodePDFString(text);
        
        if (text.trim() && containsValidText(text)) {
          extractedText += text + ' ';
        }
      }
    }
  }
  
  return extractedText.trim();
}

async function extractUsingAdvancedRegex(uint8Array: Uint8Array): Promise<string> {
  console.log('Using advanced regex extraction...');
  
  const textDecoder = new TextDecoder('latin1');
  const pdfString = textDecoder.decode(uint8Array);
  
  let extractedText = '';
  
  // Advanced patterns for credit report content
  const patterns = [
    // Names (First Last or FIRST LAST)
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    
    // Addresses  
    /\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place)\b/g,
    
    // Dates in various formats
    /\b(?:0?[1-9]|1[0-2])[-\/](?:0?[1-9]|[12]\d|3[01])[-\/](?:19|20)\d{2}\b/g,
    
    // Dollar amounts
    /\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/g,
    
    // Account numbers (partial or full)
    /(?:Account|Acct).*?(?:\d{4}[X*]{4,}\d{4}|\d{4}\s*\d{4}\s*\d{4}\s*\d{4}|\*{4,}\d{4})/gi,
    
    // Company names (common credit companies)
    /\b(?:Capital\s+One|Chase|Wells\s+Fargo|Bank\s+of\s+America|Citibank|American\s+Express|Discover|Synchrony|Credit\s+One)\b/gi,
    
    // Credit-related terms with context
    /\b(?:Credit\s+Card|Checking|Savings|Auto\s+Loan|Mortgage|Personal\s+Loan|Student\s+Loan)\b.*?(?:\$\d+|\d+\.\d{2})/gi,
    
    // Phone numbers
    /\b(?:\d{3}[-.]?)?\d{3}[-.]?\d{4}\b/g,
    
    // SSN patterns (partial)
    /\b(?:XXX-XX-\d{4}|\*\*\*-\*\*-\d{4})\b/g,
  ];
  
  for (const pattern of patterns) {
    const matches = pdfString.match(pattern) || [];
    for (const match of matches) {
      if (match.trim().length > 2) {
        extractedText += match.trim() + ' ';
      }
    }
  }
  
  return extractedText.trim();
}

async function extractUsingBinaryScanning(uint8Array: Uint8Array): Promise<string> {
  console.log('Using binary scanning extraction...');
  
  let extractedText = '';
  const textChunks = [];
  
  // Scan for readable ASCII sequences
  let currentChunk = '';
  
  for (let i = 0; i < uint8Array.length; i++) {
    const byte = uint8Array[i];
    
    // Check if byte is printable ASCII
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      currentChunk += String.fromCharCode(byte);
    } else {
      // End of readable sequence
      if (currentChunk.length >= 10) {
        textChunks.push(currentChunk);
      }
      currentChunk = '';
    }
  }
  
  // Add final chunk if it exists
  if (currentChunk.length >= 10) {
    textChunks.push(currentChunk);
  }
  
  // Filter and combine chunks that look like credit report content
  for (const chunk of textChunks) {
    if (looksLikeCreditReportContent(chunk)) {
      extractedText += chunk + ' ';
    }
  }
  
  return extractedText.trim();
}

// Helper functions for PDF text extraction

function decodePDFString(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\(/g, '(')
    .replace(/\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function containsValidText(text: string): boolean {
  if (!text || text.length < 2) return false;
  
  // Check for readable characters
  const readableChars = text.match(/[A-Za-z0-9\s\$\.,\-\(\)\/]/g) || [];
  const readableRatio = readableChars.length / text.length;
  
  return readableRatio > 0.6;
}

function looksLikeCreditReportContent(text: string): boolean {
  if (!text || text.length < 20) return false;
  
  const creditKeywords = [
    'credit', 'account', 'balance', 'payment', 'inquiry', 'collection',
    'name', 'address', 'phone', 'date', 'birth', 'social', 'security',
    'experian', 'equifax', 'transunion', 'fico', 'score', 'visa', 'mastercard',
    'chase', 'capital', 'wells', 'bank', 'mortgage', 'loan'
  ];
  
  const lowerText = text.toLowerCase();
  const keywordCount = creditKeywords.filter(keyword => lowerText.includes(keyword)).length;
  
  return keywordCount >= 2;
}

function cleanExtractedText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')                    // Normalize whitespace
    .replace(/[^\w\s\$\.,\-\/\(\):@]/g, ' ') // Keep essential punctuation
    .replace(/\s+/g, ' ')                    // Final cleanup
    .trim();
}

function isValidCreditReportText(text: string): boolean {
  if (!text || text.length < 200) return false;
  
  const requiredElements = [
    /\b(?:name|full.?name|first.?name|last.?name)\b/i,
    /\b(?:address|street|city|state|zip)\b/i,
    /\b(?:account|credit|balance|payment)\b/i,
    /\b(?:date|birth|dob|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i
  ];
  
  const matchCount = requiredElements.filter(pattern => pattern.test(text)).length;
  return matchCount >= 3;
}

// Remove sample data function - we want real extraction only

async function parseAndStoreData(supabase: any, reportId: string, text: string) {
  try {
    console.log('=== PARSING AND STORING DATA ===');
    
    // Extract and store personal information
    console.log('Extracting personal information...');
    const personalInfo = extractPersonalInfo(text);
    if (personalInfo.full_name || personalInfo.date_of_birth || personalInfo.current_address) {
      const { error: personalError } = await supabase.from('personal_information').insert({
        report_id: reportId,
        full_name: personalInfo.full_name,
        date_of_birth: personalInfo.date_of_birth,
        current_address: personalInfo.current_address,
        phone_number: personalInfo.phone_number,
        ssn_partial: personalInfo.ssn_partial
      });
      
      if (personalError) {
        console.error('Personal info insert error:', personalError);
      } else {
        console.log('Personal information stored successfully');
      }
    }

    // Extract and store credit accounts
    console.log('Extracting credit accounts...');
    const accounts = extractCreditAccounts(text);
    for (const account of accounts) {
      const { error: accountError } = await supabase.from('credit_accounts').insert({
        report_id: reportId,
        creditor_name: account.creditor_name,
        account_number: account.account_number,
        account_type: account.account_type,
        current_balance: account.current_balance,
        credit_limit: account.credit_limit,
        account_status: account.account_status,
        is_negative: account.is_negative || false
      });
      
      if (accountError) {
        console.error('Account insert error:', accountError);
      }
    }
    console.log(`Stored ${accounts.length} credit accounts`);

    // Extract and store credit inquiries
    console.log('Extracting credit inquiries...');
    const inquiries = extractCreditInquiries(text);
    for (const inquiry of inquiries) {
      const { error: inquiryError } = await supabase.from('credit_inquiries').insert({
        report_id: reportId,
        inquirer_name: inquiry.inquirer_name,
        inquiry_date: inquiry.inquiry_date,
        inquiry_type: inquiry.inquiry_type || 'hard'
      });
      
      if (inquiryError) {
        console.error('Inquiry insert error:', inquiryError);
      }
    }
    console.log(`Stored ${inquiries.length} credit inquiries`);

    // Extract and store collections/negative items
    console.log('Extracting negative items...');
    const negativeItems = extractNegativeItems(text);
    for (const item of negativeItems) {
      const { error: negativeError } = await supabase.from('negative_items').insert({
        report_id: reportId,
        negative_type: item.negative_type,
        description: item.description,
        amount: item.amount,
        date_occurred: item.date_occurred
      });
      
      if (negativeError) {
        console.error('Negative item insert error:', negativeError);
      }
    }
    console.log(`Stored ${negativeItems.length} negative items`);

    console.log('=== DATA PARSING AND STORAGE COMPLETED ===');
  } catch (parseError) {
    console.error('Parsing error:', parseError);
    throw new Error(`Data parsing failed: ${parseError.message}`);
  }
}

function extractPersonalInfo(text: string) {
  // Enhanced patterns for name extraction
  const namePatterns = [
    /(?:Name|Full\s+Name|Client\s+Name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:DOB|Date\s+of\s+Birth)/i,
    /Consumer[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i
  ];
  
  // Enhanced patterns for date of birth
  const dobPatterns = [
    /(?:Date\s+of\s+Birth|DOB|Born)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:DOB|Birth)/i,
    /Birth\s+Date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
  ];
  
  // Enhanced patterns for address
  const addressPatterns = [
    /(?:Address|Current\s+Address|Residence)[:\s]+(\d+[^,\n]*(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl)[^,\n]*(?:,\s*[A-Z][^,\n]*){1,3})/i,
    /(\d+\s+[A-Z][a-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln)\s+[A-Z][a-z\s]*\s+[A-Z]{2}\s+\d{5})/i
  ];
  
  // Enhanced patterns for phone
  const phonePatterns = [
    /(?:Phone|Telephone|Tel)[:\s]*(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i,
    /(\(\d{3}\)\s*\d{3}[-.\s]?\d{4})/,
    /\b(\d{3}[-.\s]\d{3}[-.\s]\d{4})\b/
  ];
  
  // Enhanced patterns for SSN
  const ssnPatterns = [
    /(?:SSN|Social\s+Security)[:\s]*(XXX-XX-\d{4}|\*\*\*-\*\*-\d{4}|XX\d-XX-\d{4})/i,
    /(XXX-XX-\d{4}|\*\*\*-\*\*-\d{4})/
  ];
  
  let full_name = null;
  let date_of_birth = null;
  let current_address = null;
  let phone_number = null;
  let ssn_partial = null;
  
  // Extract name
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) {
      full_name = match[1].trim();
      break;
    }
  }
  
  // Extract DOB
  for (const pattern of dobPatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) {
          date_of_birth = date.toISOString().split('T')[0];
          break;
        }
      } catch (e) {
        console.log('Invalid date format:', match[1]);
      }
    }
  }
  
  // Extract address
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      current_address = { street: match[1].trim() };
      break;
    }
  }
  
  // Extract phone
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      phone_number = match[1].replace(/[\s.-]/g, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
      break;
    }
  }
  
  // Extract SSN
  for (const pattern of ssnPatterns) {
    const match = text.match(pattern);
    if (match) {
      ssn_partial = match[1];
      break;
    }
  }

  return {
    full_name,
    date_of_birth,
    current_address,
    phone_number,
    ssn_partial
  };
}

function extractCreditAccounts(text: string) {
  const accounts = [];
  
  // Enhanced patterns for various credit account formats
  const accountPatterns = [
    // Standard format: Company Account: XXXX Balance: $X,XXX.XX
    /([A-Z][a-z\s]+(?:Credit Card|Bank|Mortgage|Express|Card|Financial|Capital|Chase|Wells|Citi|American))[:\s]*(?:Account[:\s]*)?([A-Z0-9X*]{4,})\s+(?:Balance|Bal|Current\s+Balance)[:\s]*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
    
    // Credit card format: VISA ending in 1234 Balance $1,500
    /(VISA|MASTERCARD|AMEX|AMERICAN\s+EXPRESS|DISCOVER)\s+(?:ending\s+in|[\*X]{4,})(\d{4})\s+(?:Balance|Bal)[:\s]*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
    
    // Company name with account info
    /([A-Z][A-Z\s]+)\s+(?:Account|Acct)[:\s]*([X*\d]{4,})\s+(?:\$(\d+(?:,\d{3})*(?:\.\d{2})?))/gi,
    
    // Simple format: Company $Amount Status
    /([A-Z][a-z\s]+(?:Bank|Credit|Card|Financial|Capital|Chase|Wells|Citi))\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(Open|Closed|Current|Past\s+Due)/gi
  ];
  
  for (const pattern of accountPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let creditor_name = match[1].trim();
      let account_number = '';
      let current_balance = 0;
      let account_status = 'Open';
      
      if (pattern === accountPatterns[0]) {
        // Standard format
        account_number = match[2].replace(/X/g, '*');
        current_balance = parseFloat(match[3].replace(/,/g, ''));
      } else if (pattern === accountPatterns[1]) {
        // Credit card format
        account_number = '****' + match[2];
        current_balance = parseFloat(match[3].replace(/,/g, ''));
      } else if (pattern === accountPatterns[2]) {
        // Company with account
        account_number = match[2];
        current_balance = parseFloat(match[3].replace(/,/g, ''));
      } else if (pattern === accountPatterns[3]) {
        // Simple format
        account_number = 'N/A';
        current_balance = parseFloat(match[2].replace(/,/g, ''));
        account_status = match[3];
      }
      
      const account_type = determineAccountType(creditor_name, text);
      
      accounts.push({
        creditor_name,
        account_number,
        current_balance,
        account_type,
        account_status,
        is_negative: current_balance > 0 && account_status.toLowerCase().includes('past due')
      });
    }
  }

  return accounts;
}

function determineAccountType(creditorName: string, contextText: string): string {
  const lowerName = creditorName.toLowerCase();
  const lowerContext = contextText.toLowerCase();
  
  if (lowerName.includes('credit card') || lowerName.includes('visa') || lowerName.includes('mastercard') || lowerName.includes('amex') || lowerName.includes('discover')) {
    return 'Credit Card';
  } else if (lowerName.includes('mortgage') || lowerContext.includes('mortgage')) {
    return 'Mortgage';
  } else if (lowerName.includes('auto') || lowerName.includes('car') || lowerContext.includes('auto loan')) {
    return 'Auto Loan';
  } else if (lowerName.includes('student') || lowerContext.includes('student loan')) {
    return 'Student Loan';
  } else if (lowerName.includes('personal') || lowerContext.includes('personal loan')) {
    return 'Personal Loan';
  } else if (lowerName.includes('checking') || lowerName.includes('savings')) {
    return 'Bank Account';
  } else {
    return 'Other';
  }
}

function extractCreditInquiries(text: string) {
  const inquiries = [];
  
  // Enhanced patterns for credit inquiries
  const inquiryPatterns = [
    // Company Date Type format
    /([A-Z][a-z\s]+(?:Bank|Capital|Credit|Chase|Wells|Fargo|One|Express|Financial|Corp|Inc))\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([A-Za-z\s]+(?:Inquiry|Application|Pull|Check))/gi,
    
    // Date Company Type format
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([A-Z][a-z\s]+(?:Bank|Capital|Credit|Chase|Wells))\s+([A-Za-z\s]+)/gi,
    
    // Simple Company Date format
    /([A-Z][A-Z\s]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
    
    // Inquiry section format
    /(?:Inquiry|Inquiries)[:\s]*([A-Z][a-z\s]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi
  ];
  
  for (const pattern of inquiryPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let inquirer_name = '';
      let inquiry_date = '';
      let inquiry_type = 'hard'; // Default to hard inquiry
      
      if (pattern === inquiryPatterns[0]) {
        // Company Date Type
        inquirer_name = match[1].trim();
        inquiry_date = match[2];
        inquiry_type = match[3].toLowerCase().includes('soft') ? 'soft' : 'hard';
      } else if (pattern === inquiryPatterns[1]) {
        // Date Company Type
        inquiry_date = match[1];
        inquirer_name = match[2].trim();
        inquiry_type = match[3].toLowerCase().includes('soft') ? 'soft' : 'hard';
      } else if (pattern === inquiryPatterns[2] || pattern === inquiryPatterns[3]) {
        // Simple formats
        inquirer_name = match[1].trim();
        inquiry_date = match[2];
      }
      
      // Validate and format date
      try {
        const date = new Date(inquiry_date);
        if (!isNaN(date.getTime())) {
          inquiries.push({
            inquirer_name,
            inquiry_date: date.toISOString().split('T')[0],
            inquiry_type
          });
        }
      } catch (e) {
        console.log('Invalid inquiry date:', inquiry_date);
      }
    }
  }

  return inquiries;
}

function extractNegativeItems(text: string) {
  const negativeItems = [];
  
  // Enhanced patterns for negative items
  const negativePatterns = [
    // Collections format: Company Collections $Amount Description
    /([A-Z][a-z\s]*(?:Collections|Recovery|Agency))\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s+([A-Za-z\s]+)/gi,
    
    // Late payment format: Company 30/60/90 days late
    /([A-Z][a-z\s]+)\s+(\d{2,3})\s+days?\s+late/gi,
    
    // Charge off format: Company Charge Off $Amount
    /([A-Z][a-z\s]+)\s+(?:Charge\s+Off|Charged\s+Off)\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
    
    // Delinquency format: Company Delinquent
    /([A-Z][a-z\s]+)\s+(?:Delinquent|Delinquency|Past\s+Due)/gi,
    
    // Bankruptcy format
    /(?:Chapter\s+\d+\s+)?Bankruptcy\s+(?:Filed|Discharged)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
    
    // Judgment format
    /(?:Civil\s+)?Judgment\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi
  ];
  
  for (const pattern of negativePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let negative_type = '';
      let description = '';
      let amount = null;
      let date_occurred = null;
      
      if (pattern === negativePatterns[0]) {
        // Collections
        negative_type = 'Collection';
        description = `${match[1]} - ${match[3]}`;
        amount = parseFloat(match[2].replace(/,/g, ''));
      } else if (pattern === negativePatterns[1]) {
        // Late payments
        negative_type = 'Late Payment';
        description = `${match[1]} - ${match[2]} days late`;
      } else if (pattern === negativePatterns[2]) {
        // Charge offs
        negative_type = 'Charge Off';
        description = `${match[1]} charge off`;
        amount = parseFloat(match[2].replace(/,/g, ''));
      } else if (pattern === negativePatterns[3]) {
        // Delinquency
        negative_type = 'Delinquency';
        description = `${match[1]} account delinquent`;
      } else if (pattern === negativePatterns[4]) {
        // Bankruptcy
        negative_type = 'Bankruptcy';
        description = 'Bankruptcy filing';
        try {
          date_occurred = new Date(match[1]).toISOString().split('T')[0];
        } catch (e) {
          date_occurred = null;
        }
      } else if (pattern === negativePatterns[5]) {
        // Judgment
        negative_type = 'Judgment';
        description = 'Civil judgment';
        amount = parseFloat(match[1].replace(/,/g, ''));
        try {
          date_occurred = new Date(match[2]).toISOString().split('T')[0];
        } catch (e) {
          date_occurred = null;
        }
      }
      
      if (negative_type && description) {
        negativeItems.push({
          negative_type,
          description,
          amount,
          date_occurred
        });
      }
    }
  }

  return negativeItems;
}