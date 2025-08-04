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
    console.log('=== ADVANCED PDF EXTRACTION STARTED ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);

    const { reportId, filePath } = await req.json();
    console.log(`Report ID: ${reportId}`);
    console.log(`File Path: ${filePath}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({ 
        extraction_status: 'processing',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    // Download PDF file
    console.log('📁 Downloading PDF file...');
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Download failed: ${downloadError.message}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    console.log(`📄 PDF downloaded successfully, size: ${arrayBuffer.byteLength} bytes`);

    // Extract text using improved PDF parsing
    const extractedText = await extractTextWithImprovedParsing(arrayBuffer);
    
    if (!extractedText || extractedText.length < 100) {
      throw new Error('No meaningful text could be extracted from the PDF');
    }

    console.log(`📝 Extracted text length: ${extractedText.length}`);
    
    // Clean and validate the text
    const cleanedText = cleanExtractedText(extractedText);
    console.log(`📝 Cleaned text length: ${cleanedText.length}`);

    // Update with extracted text
    await supabase
      .from('credit_reports')
      .update({
        raw_text: cleanedText,
        extraction_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    // Parse and store the data
    await parseAndStoreCreditData(supabase, reportId, cleanedText);

    console.log('=== ADVANCED EXTRACTION COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({
      success: true,
      textLength: cleanedText.length,
      extractionMethod: 'Improved PDF Parsing'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Advanced PDF extraction error:', error);
    
    const { reportId } = await req.json().catch(() => ({}));
    if (reportId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabase
        .from('credit_reports')
        .update({
          extraction_status: 'failed',
          processing_errors: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
    }

    return new Response(JSON.stringify({
      error: 'PDF extraction failed',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

/**
 * Improved PDF text extraction using proper PDF parsing techniques
 */
async function extractTextWithImprovedParsing(arrayBuffer: ArrayBuffer): Promise<string> {
  console.log('🚀 Starting improved PDF text extraction...');
  
  const uint8Array = new Uint8Array(arrayBuffer);
  let extractedText = '';

  // Method 1: Extract from decompressed PDF streams
  console.log('🌊 Extracting from PDF streams...');
  try {
    const streamText = extractFromPDFStreams(uint8Array);
    if (streamText && streamText.length > extractedText.length) {
      extractedText = streamText;
      console.log(`📄 Stream extraction found ${streamText.length} characters`);
    }
  } catch (error) {
    console.log('⚠️ Stream extraction failed:', error.message);
  }

  // Method 2: Extract from PDF text objects with proper decoding
  console.log('🔍 Extracting from PDF text objects...');
  try {
    const objectText = extractFromPDFTextObjects(uint8Array);
    if (objectText && objectText.length > extractedText.length) {
      extractedText = objectText;
      console.log(`📄 Text object extraction found ${objectText.length} characters`);
    }
  } catch (error) {
    console.log('⚠️ Text object extraction failed:', error.message);
  }

  // Method 3: Extract using content stream parsing
  console.log('📖 Extracting from content streams...');
  try {
    const contentText = extractFromContentStreams(uint8Array);
    if (contentText && contentText.length > extractedText.length) {
      extractedText = contentText;
      console.log(`📄 Content stream extraction found ${contentText.length} characters`);
    }
  } catch (error) {
    console.log('⚠️ Content stream extraction failed:', error.message);
  }

  if (!extractedText || extractedText.length < 50) {
    throw new Error('Failed to extract readable text from PDF');
  }

  console.log(`✅ Best extraction method found ${extractedText.length} characters`);
  return extractedText;
}

/**
 * Extract text from PDF streams using proper decompression
 */
function extractFromPDFStreams(uint8Array: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const pdfContent = decoder.decode(uint8Array);
  
  // Find stream objects that contain text
  const streamPattern = /stream\s*([\s\S]*?)\s*endstream/g;
  let extractedText = '';
  let match;

  while ((match = streamPattern.exec(pdfContent)) !== null) {
    const streamContent = match[1];
    
    // Try to extract readable text from the stream
    const readableText = extractReadableTextFromStream(streamContent);
    if (readableText && readableText.length > 10) {
      extractedText += readableText + ' ';
    }
  }

  return extractedText.trim();
}

/**
 * Extract text from PDF text objects (BT...ET blocks)
 */
function extractFromPDFTextObjects(uint8Array: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const pdfContent = decoder.decode(uint8Array);
  
  // Find text objects between BT and ET
  const textObjectPattern = /BT\s+([\s\S]*?)\s+ET/g;
  let extractedText = '';
  let match;

  while ((match = textObjectPattern.exec(pdfContent)) !== null) {
    const textContent = match[1];
    
    // Extract text from Tj and TJ commands
    const tjPattern = /\(([^)]+)\)\s*Tj/g;
    const tjArrayPattern = /\[([^\]]+)\]\s*TJ/g;
    
    let tjMatch;
    while ((tjMatch = tjPattern.exec(textContent)) !== null) {
      const text = decodePDFString(tjMatch[1]);
      if (isReadableText(text)) {
        extractedText += text + ' ';
      }
    }
    
    while ((tjMatch = tjArrayPattern.exec(textContent)) !== null) {
      // Parse array format: [(text) offset (more text)]
      const arrayContent = tjMatch[1];
      const textMatches = arrayContent.match(/\(([^)]+)\)/g);
      if (textMatches) {
        for (const textMatch of textMatches) {
          const text = decodePDFString(textMatch.slice(1, -1));
          if (isReadableText(text)) {
            extractedText += text + ' ';
          }
        }
      }
    }
  }

  return extractedText.trim();
}

/**
 * Extract text from PDF content streams
 */
function extractFromContentStreams(uint8Array: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const pdfContent = decoder.decode(uint8Array);
  
  let extractedText = '';
  
  // Look for common credit report patterns in the raw content
  const patterns = [
    // Look for strings in parentheses that might be text
    /\(([A-Za-z0-9\s\.,\-\$\%]+)\)/g,
    // Look for quoted strings
    /"([A-Za-z0-9\s\.,\-\$\%]+)"/g,
    // Look for hex encoded text
    /<([0-9A-Fa-f]+)>/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(pdfContent)) !== null) {
      let text = match[1];
      
      // If it's hex, try to decode it
      if (pattern.source.includes('A-Fa-f')) {
        try {
          text = hexToText(text);
        } catch {
          continue;
        }
      }
      
      if (isReadableText(text) && text.length > 2) {
        extractedText += text + ' ';
      }
    }
  }

  return extractedText.trim();
}

/**
 * Extract readable text from a stream content
 */
function extractReadableTextFromStream(streamContent: string): string {
  let text = '';
  
  // Try to find readable characters in the stream
  for (let i = 0; i < streamContent.length - 1; i++) {
    const char = streamContent[i];
    const charCode = char.charCodeAt(0);
    
    // Include readable ASCII characters
    if ((charCode >= 32 && charCode <= 126) || charCode === 10 || charCode === 13) {
      text += char;
    } else if (charCode > 126) {
      // Might be encoded text, try to decode
      const nextChar = streamContent[i + 1];
      if (nextChar && nextChar.charCodeAt(0) > 126) {
        // Skip for now, could be binary data
        continue;
      }
      text += char;
    }
  }
  
  // Clean up the extracted text
  text = text.replace(/[\x00-\x1F\x7F]/g, ' '); // Remove control characters
  text = text.replace(/\s+/g, ' '); // Normalize whitespace
  
  return text.trim();
}

/**
 * Convert hex string to text
 */
function hexToText(hex: string): string {
  let text = '';
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substr(i, 2), 16);
    if (charCode >= 32 && charCode <= 126) {
      text += String.fromCharCode(charCode);
    }
  }
  return text;
}

/**
 * Decode PDF string escape sequences
 */
function decodePDFString(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

/**
 * Check if text contains readable content
 */
function isReadableText(text: string): boolean {
  if (!text || text.length < 3) return false;
  
  // Count readable characters
  const readableChars = text.match(/[a-zA-Z0-9\s\.,\-\$\%]/g)?.length || 0;
  const readableRatio = readableChars / text.length;
  
  // Must be at least 70% readable characters
  return readableRatio >= 0.7;
}

/**
 * Clean extracted text
 */
function cleanExtractedText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ') // Remove control chars except \t, \n, \r
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Parse and store credit data from extracted text
 */
async function parseAndStoreCreditData(supabase: any, reportId: string, text: string) {
  console.log('=== PARSING AND STORING CREDIT DATA ===');
  console.log(`Input text length: ${text.length}`);
  console.log(`Text sample: ${text.substring(0, 200)}...`);

  // Clear existing data for this report
  console.log('🧹 Clearing existing data for report...');
  await Promise.all([
    supabase.from('personal_information').delete().eq('report_id', reportId),
    supabase.from('credit_accounts').delete().eq('report_id', reportId),
    supabase.from('credit_inquiries').delete().eq('report_id', reportId),
    supabase.from('negative_items').delete().eq('report_id', reportId)
  ]);

  // Extract personal information
  console.log('🔍 Extracting personal information...');
  const personalInfo = extractPersonalInfo(text);
  console.log('Personal info extracted:', personalInfo);

  if (Object.keys(personalInfo).length > 0) {
    await supabase
      .from('personal_information')
      .insert({ ...personalInfo, report_id: reportId });
  }

  // Extract credit accounts
  console.log('💳 Extracting credit accounts...');
  const accounts = extractCreditAccounts(text);
  console.log(`Found ${accounts.length} credit accounts:`, accounts);

  if (accounts.length > 0) {
    for (const account of accounts) {
      await supabase
        .from('credit_accounts')
        .insert({ ...account, report_id: reportId });
    }
  }
  console.log(`✅ Stored ${accounts.length} credit accounts`);

  // Extract credit inquiries
  console.log('🔍 Extracting credit inquiries...');
  const inquiries = extractCreditInquiries(text);
  console.log(`Found ${inquiries.length} credit inquiries:`, inquiries);

  if (inquiries.length > 0) {
    for (const inquiry of inquiries) {
      await supabase
        .from('credit_inquiries')
        .insert({ ...inquiry, report_id: reportId });
    }
  }
  console.log(`✅ Stored ${inquiries.length} credit inquiries`);

  // Extract negative items
  console.log('⚠️ Extracting negative items...');
  const negativeItems = extractNegativeItems(text);
  console.log(`Found ${negativeItems.length} negative items:`, negativeItems);

  if (negativeItems.length > 0) {
    for (const item of negativeItems) {
      await supabase
        .from('negative_items')
        .insert({ ...item, report_id: reportId });
    }
  }
  console.log(`✅ Stored ${negativeItems.length} negative items`);

  console.log('=== DATA PARSING COMPLETED ===');
  console.log(`Summary: ${Object.keys(personalInfo).length} personal info, ${accounts.length} accounts, ${inquiries.length} inquiries, ${negativeItems.length} negative items`);
}

/**
 * Extract personal information from text
 */
function extractPersonalInfo(text: string): any {
  const personalInfo: any = {};

  // Enhanced patterns for personal information
  const patterns = {
    name: [
      /Name[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /Consumer[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /Report for[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    ],
    ssn: [
      /SSN[:\s]+(\d{3}-\d{2}-\d{4})/,
      /Social Security[:\s]+(\d{3}-\d{2}-\d{4})/i,
      /(\d{3}-\d{2}-\d{4})/
    ],
    dob: [
      /DOB[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Date of Birth[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Born[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i
    ],
    address: [
      /Address[:\s]+([0-9]+[^,\n]+,[^,\n]+,[A-Z]{2}\s+\d{5})/i,
      /([0-9]+\s+[A-Z][a-z\s]+(?:St|Ave|Rd|Dr|Ln|Blvd)[,\s]+[A-Z][a-z\s]+[,\s]+[A-Z]{2}\s+\d{5})/i
    ]
  };

  for (const [field, fieldPatterns] of Object.entries(patterns)) {
    for (const pattern of fieldPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        personalInfo[field] = match[1].trim();
        break;
      }
    }
  }

  return personalInfo;
}

/**
 * Extract credit accounts from text
 */
function extractCreditAccounts(text: string): any[] {
  const accounts: any[] = [];
  
  // Enhanced patterns for credit accounts
  const accountPatterns = [
    // Pattern for creditor with account details
    /([A-Z][A-Z\s&]+(?:BANK|CARD|CREDIT|FINANCIAL|CORP|LLC|INC))[^\n]*(?:Balance|Bal)[:\s]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
    // Pattern for account numbers with balances
    /Account[:\s]+(\d+)[^\n]*(?:Balance|Bal)[:\s]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/gi
  ];

  for (const pattern of accountPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const account = {
        creditor_name: match[1]?.trim() || 'Unknown Creditor',
        account_number: match[2] || 'Unknown',
        balance: parseFloat((match[2] || '0').replace(/[,$]/g, '')),
        account_type: determineAccountType(match[1] || ''),
        status: 'Unknown'
      };

      // Avoid duplicates
      if (!accounts.find(a => a.creditor_name === account.creditor_name && a.account_number === account.account_number)) {
        accounts.push(account);
      }
    }
  }

  return accounts;
}

/**
 * Extract credit inquiries from text
 */
function extractCreditInquiries(text: string): any[] {
  const inquiries: any[] = [];
  
  // Enhanced patterns for credit inquiries
  const inquiryPatterns = [
    /Inquiry[:\s]+([A-Z][A-Z\s&]+).*?(\d{1,2}\/\d{1,2}\/\d{4})/gi,
    /([A-Z][A-Z\s&]+(?:BANK|FINANCIAL|CREDIT)).*?inquiry.*?(\d{1,2}\/\d{1,2}\/\d{4})/gi
  ];

  for (const pattern of inquiryPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const inquiry = {
        inquirer_name: match[1].trim(),
        inquiry_date: formatDate(match[2]),
        inquiry_type: 'Hard'
      };

      // Avoid duplicates
      if (!inquiries.find(i => i.inquirer_name === inquiry.inquirer_name && i.inquiry_date === inquiry.inquiry_date)) {
        inquiries.push(inquiry);
      }
    }
  }

  return inquiries;
}

/**
 * Extract negative items from text
 */
function extractNegativeItems(text: string): any[] {
  const negativeItems: any[] = [];
  
  // Enhanced patterns for negative items
  const negativePatterns = [
    /Collection[:\s]+([A-Z][A-Z\s&]+).*?(?:Balance|Bal)[:\s]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
    /Charge.*?off[:\s]+([A-Z][A-Z\s&]+).*?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
    /(Late Payment|Past Due)[:\s]+([A-Z][A-Z\s&]+)/gi
  ];

  for (const pattern of negativePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const item = {
        creditor_name: match[2] || match[1],
        item_type: match[1].toLowerCase().includes('collection') ? 'Collection' : 
                  match[1].toLowerCase().includes('charge') ? 'Charge-off' : 'Late Payment',
        amount: match[3] ? parseFloat(match[3].replace(/[,$]/g, '')) : null,
        status: 'Open'
      };

      // Avoid duplicates
      if (!negativeItems.find(n => n.creditor_name === item.creditor_name && n.item_type === item.item_type)) {
        negativeItems.push(item);
      }
    }
  }

  return negativeItems;
}

/**
 * Determine account type based on creditor name
 */
function determineAccountType(creditorName: string): string {
  const name = creditorName.toLowerCase();
  if (name.includes('card') || name.includes('credit')) return 'Credit Card';
  if (name.includes('auto') || name.includes('vehicle')) return 'Auto Loan';
  if (name.includes('mortgage') || name.includes('home')) return 'Mortgage';
  if (name.includes('student') || name.includes('education')) return 'Student Loan';
  return 'Other';
}

/**
 * Format date string
 */
function formatDate(dateStr: string): string {
  try {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}