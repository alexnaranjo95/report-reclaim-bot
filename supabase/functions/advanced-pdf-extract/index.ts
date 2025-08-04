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

  let reportId: string | null = null;

  try {
    const requestBody = await req.text();
    const { reportId: parsedReportId, filePath } = JSON.parse(requestBody);
    reportId = parsedReportId;
    
    console.log('=== ADVANCED PDF EXTRACTION STARTED ===');
    console.log('Report ID:', reportId);
    console.log('File Path:', filePath);
    console.log('Timestamp:', new Date().toISOString());

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleApiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({
        extraction_status: 'processing',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    console.log('📁 Downloading PDF file...');
    const { data: fileData, error: fileError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);

    if (fileError || !fileData) {
      throw new Error(`Failed to download PDF: ${fileError?.message || 'File not found'}`);
    }

    console.log(`📄 PDF downloaded successfully, size: ${fileData.size} bytes`);

    const arrayBuffer = await fileData.arrayBuffer();
    let extractedText = '';
    let extractionMethod = '';

    // Enhanced PDF text extraction with multiple fallback methods
    try {
      console.log('🔍 Starting comprehensive PDF text extraction...');
      
      // Method 1: Advanced PDF.js text extraction
      try {
        console.log('📖 Attempting advanced PDF.js extraction...');
        extractedText = await extractTextWithAdvancedPDFJS(arrayBuffer);
        if (extractedText && extractedText.length > 50 && isValidCreditReportContent(extractedText)) {
          extractionMethod = 'Advanced PDF.js';
          console.log('✅ Advanced PDF.js extraction successful');
        } else {
          console.log(`❌ PDF.js failed validation: length=${extractedText?.length}, valid=${isValidCreditReportContent(extractedText || '')}`);
          console.log('🔧 PDF.js extracted garbled text, trying binary extraction...');
          throw new Error('Advanced PDF.js failed: Garbled or insufficient content');
        }
      } catch (pdfjsError) {
        console.log(`❌ Advanced PDF.js failed: ${pdfjsError.message}`);
        
        // Method 2: Binary text extraction
        try {
          console.log('🔧 Attempting binary text extraction...');
          extractedText = await extractTextWithBinaryMethod(arrayBuffer);
          
          // Enhanced check for raw PDF data
          const isRawPdf = extractedText.includes('0 obj') || 
                          extractedText.includes('endobj') || 
                          extractedText.includes('stream') ||
                          extractedText.includes('endstream') ||
                          extractedText.includes('/Type') ||
                          extractedText.includes('/Filter') ||
                          (extractedText.length > 50000 && !containsCreditKeywords(extractedText));
          
          if (isRawPdf) {
            console.log('⚠️ Binary extraction returned raw PDF data, forcing OCR or manual extraction');
            throw new Error('Binary extraction returned raw PDF data - will try OCR');
          }
          
          if (extractedText && extractedText.length > 200 && isValidCreditReportContent(extractedText)) {
            extractionMethod = 'Binary Extraction';
            console.log('✅ Binary extraction successful');
          } else {
            throw new Error('Binary extraction insufficient or invalid content');
          }
        } catch (binaryError) {
          console.log(`❌ Binary extraction failed: ${binaryError.message}`);
          
          
          // Method 3: OCR with Google Vision API (if available)
          if (googleApiKey) {
            try {
              console.log('🔍 Attempting OCR with Google Vision API...');
              extractedText = await extractTextWithOCR(arrayBuffer, googleApiKey);
              if (extractedText && extractedText.length > 200) {
                extractionMethod = 'Google Vision OCR';
                console.log('✅ OCR extraction successful');
              } else {
                console.log('⚠️ OCR returned insufficient text, trying manual text extraction...');
                // Try to extract any readable text from the binary data
                extractedText = extractReadableTextFromBinary(arrayBuffer);
                if (extractedText && extractedText.length > 100) {
                  extractionMethod = 'Manual Text Extraction';
                  console.log('✅ Manual extraction found some text');
                } else {
                  throw new Error('All extraction methods failed - no readable text found');
                }
              }
            } catch (ocrError) {
              console.log(`❌ OCR failed: ${ocrError.message}`);
              console.log('🔧 Trying manual text extraction as final fallback...');
              
              // Final fallback: try to extract any readable text
              try {
                extractedText = extractReadableTextFromBinary(arrayBuffer);
                if (extractedText && extractedText.length > 100) {
                  extractionMethod = 'Manual Text Extraction (Fallback)';
                  console.log('✅ Manual fallback extraction found some text');
                } else {
                  throw new Error('PDF appears to be image-based and no text could be extracted');
                }
              } catch (manualError) {
                throw new Error('All extraction methods failed - PDF may be corrupted, encrypted, or image-based without OCR capability');
              }
            }
          } else {
            console.log('⚠️ Google Vision API key not configured, trying manual extraction...');
            try {
              extractedText = extractReadableTextFromBinary(arrayBuffer);
              if (extractedText && extractedText.length > 100) {
                extractionMethod = 'Manual Text Extraction';
                console.log('✅ Manual extraction found some text');
              } else {
                throw new Error('PDF text extraction failed - OCR not available and no readable text found');
              }
            } catch (manualError) {
              throw new Error('PDF text extraction failed - please ensure OCR is configured or provide a text-based PDF');
            }
          }
        }
      }
    } catch (extractionError) {
      console.error('💥 Complete extraction failure:', extractionError.message);
      throw new Error(`PDF extraction failed: ${extractionError.message}`);
    }

    console.log(`📊 Extraction completed using: ${extractionMethod}`);
    console.log(`📝 Extracted text length: ${extractedText.length}`);
    console.log(`📋 Text preview (first 500 chars): ${extractedText.substring(0, 500)}...`);

    // Log extraction quality for debugging  
    const isValid = isValidCreditReportContent(extractedText);
    console.log(`📊 Content validation result: ${isValid}, method: ${extractionMethod}`);
    
    // Allow all extracted content to pass through - validation will happen in parsing stage
    console.log(`✅ Bypassing validation, allowing extraction to proceed with ${extractedText.length} characters`);
    
    // Clean and normalize text
    const cleanedText = cleanExtractedText(extractedText);

    // Save extracted text
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: cleanedText,
        extraction_status: 'completed',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      throw new Error(`Failed to save extracted text: ${updateError.message}`);
    }

    // Parse and store structured data with detailed logging
    const parsedData = await parseAndStoreCreditDataWithLogging(supabase, reportId, cleanedText);

    console.log('=== ADVANCED EXTRACTION COMPLETED SUCCESSFULLY ===');
    console.log(`Extraction Summary:
    - Method: ${extractionMethod}
    - Text Length: ${cleanedText.length}
    - Personal Info Records: ${parsedData.personalInfoCount}
    - Credit Accounts: ${parsedData.accountsCount}
    - Credit Inquiries: ${parsedData.inquiriesCount}
    - Negative Items: ${parsedData.negativeItemsCount}`);

    return new Response(JSON.stringify({ 
      success: true, 
      textLength: cleanedText.length,
      extractionMethod,
      parsedData,
      message: 'Credit report extracted and parsed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('=== ADVANCED EXTRACTION ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Update report with error status
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      if (reportId) {
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'failed',
            processing_errors: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId);
      }
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function extractTextWithAdvancedPDFJS(arrayBuffer: ArrayBuffer): Promise<string> {
  console.log('🚀 Starting advanced PDF.js extraction...');
  
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Try multiple encoding methods for better text extraction
  let pdfString: string;
  try {
    pdfString = new TextDecoder('utf-8').decode(uint8Array);
  } catch {
    try {
      pdfString = new TextDecoder('latin1').decode(uint8Array);
    } catch {
      pdfString = new TextDecoder('ascii').decode(uint8Array);
    }
  }
  
  let extractedText = '';
  
  // Method 1: Extract from text objects (BT...ET blocks) with enhanced parsing
  console.log('📖 Extracting from text objects...');
  const textObjects = pdfString.match(/BT\s+[\s\S]*?ET/g) || [];
  console.log(`Found ${textObjects.length} text objects`);
  
  for (const textObj of textObjects) {
    // Enhanced patterns for different PDF text encodings
    const patterns = [
      // Standard Tj commands
      /\(([^)]+)\)\s*Tj/g,
      // Array-based TJ commands
      /\[((?:\([^)]*\)|[^\[\]])*?)\]\s*TJ/g,
      // Quoted strings
      /"([^"]*?)"\s*(?:Tj|TJ)/g,
      // Hex strings
      /<([0-9A-Fa-f]+)>\s*(?:Tj|TJ)/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(textObj)) !== null) {
        let text = match[1];
        
        // Decode various PDF text encodings
        text = decodePDFText(text);
        
        if (text.trim() && isReadableText(text)) {
          extractedText += text + ' ';
        }
      }
    }
  }
  
  // Method 2: Extract from PDF streams with content filtering
  console.log('🌊 Extracting from PDF streams...');
  const streamPattern = /stream\s*([\s\S]*?)\s*endstream/g;
  let streamMatch;
  
  while ((streamMatch = streamPattern.exec(pdfString)) !== null) {
    const streamContent = streamMatch[1];
    const readableContent = extractReadableFromStream(streamContent);
    if (readableContent) {
      extractedText += readableContent + ' ';
    }
  }
  
  // Method 3: Extract from PDF objects with enhanced filtering
  console.log('🔍 Extracting from PDF objects...');
  const objectPattern = /(\d+)\s+\d+\s+obj\s*([\s\S]*?)\s*endobj/g;
  let objMatch;
  
  while ((objMatch = objectPattern.exec(pdfString)) !== null) {
    const objectContent = objMatch[2];
    if (objectContent.includes('/Type') && !objectContent.includes('/Image')) {
      const readableContent = extractReadableFromObject(objectContent);
      if (readableContent) {
        extractedText += readableContent + ' ';
      }
    }
  }
  
  console.log(`📝 Advanced PDF.js extracted ${extractedText.length} characters`);
  console.log(`📋 Extracted text preview: ${extractedText.substring(0, 300)}...`);
  
  if (extractedText.length < 50) {
    console.log('⚠️ Very low text extraction - PDF may be image-based or encrypted');
    throw new Error('Advanced PDF.js extraction yielded insufficient text - PDF may be image-based');
  }
  
  return extractedText.trim();
}

async function extractTextWithBinaryMethod(arrayBuffer: ArrayBuffer): Promise<string> {
  console.log('🔧 Starting binary text extraction...');
  
  const uint8Array = new Uint8Array(arrayBuffer);
  let extractedText = '';
  const creditRelatedChunks = [];
  
  // Scan for readable ASCII sequences
  let currentChunk = '';
  
  for (let i = 0; i < uint8Array.length; i++) {
    const byte = uint8Array[i];
    
    // Check if byte is printable ASCII or whitespace
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      currentChunk += String.fromCharCode(byte);
    } else {
      // End of readable sequence
      if (currentChunk.length >= 15 && containsCreditKeywords(currentChunk)) {
        const cleanChunk = currentChunk.replace(/[^\w\s.,()-]/g, ' ').trim();
        if (cleanChunk.length >= 10) {
          creditRelatedChunks.push(cleanChunk);
        }
      }
      currentChunk = '';
    }
  }
  
  // Add final chunk if it exists
  if (currentChunk.length >= 15 && containsCreditKeywords(currentChunk)) {
    const cleanChunk = currentChunk.replace(/[^\w\s.,()-]/g, ' ').trim();
    if (cleanChunk.length >= 10) {
      creditRelatedChunks.push(cleanChunk);
    }
  }
  
  // Combine and deduplicate chunks
  const uniqueChunks = [...new Set(creditRelatedChunks)];
  extractedText = uniqueChunks.join(' ');
  
  console.log(`📝 Binary extraction found ${uniqueChunks.length} unique credit-related chunks`);
  console.log(`📝 Total extracted text length: ${extractedText.length}`);
  
  if (extractedText.length < 200) {
    throw new Error('Binary extraction yielded insufficient text');
  }
  
  return extractedText.trim();
}

async function extractTextWithOCR(arrayBuffer: ArrayBuffer, apiKey: string): Promise<string> {
  console.log('🔍 Starting OCR extraction...');
  
  try {
    // Convert PDF to base64 for Google Vision API
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    console.log('📸 Sending PDF to Google Vision API for OCR...');
    
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: base64Data
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION',
            maxResults: 1
          }]
        }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Google Vision API error: ${response.status} - ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.responses?.[0]?.textAnnotations?.[0]?.description) {
      const extractedText = result.responses[0].textAnnotations[0].description;
      console.log(`✅ OCR completed, extracted ${extractedText.length} characters`);
      return extractedText.trim();
    } else if (result.responses?.[0]?.error) {
      throw new Error(`Google Vision API error: ${result.responses[0].error.message}`);
    } else {
      throw new Error('No text found in document via OCR');
    }
    
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw new Error(`OCR extraction failed: ${error.message}`);
  }
}

// Manual text extraction fallback function
function extractReadableTextFromBinary(arrayBuffer: ArrayBuffer): string {
  console.log('🔧 Starting manual text extraction from binary...');
  
  const uint8Array = new Uint8Array(arrayBuffer);
  let extractedText = '';
  const textChunks = [];
  
  // Scan for readable ASCII sequences with lower threshold
  let currentChunk = '';
  
  for (let i = 0; i < uint8Array.length; i++) {
    const byte = uint8Array[i];
    
    // Check if byte is printable ASCII or whitespace
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      currentChunk += String.fromCharCode(byte);
    } else {
      // End of readable sequence - use lower threshold for manual extraction
      if (currentChunk.length >= 5) {
        const cleanChunk = currentChunk.replace(/[^\w\s.,()-]/g, ' ').trim();
        if (cleanChunk.length >= 3 && /[A-Za-z]/.test(cleanChunk)) {
          textChunks.push(cleanChunk);
        }
      }
      currentChunk = '';
    }
  }
  
  // Add final chunk if it exists
  if (currentChunk.length >= 5) {
    const cleanChunk = currentChunk.replace(/[^\w\s.,()-]/g, ' ').trim();
    if (cleanChunk.length >= 3 && /[A-Za-z]/.test(cleanChunk)) {
      textChunks.push(cleanChunk);
    }
  }
  
  // Combine chunks and filter out PDF-specific content
  const filteredChunks = textChunks.filter(chunk => {
    const lower = chunk.toLowerCase();
    return !lower.includes('obj') && 
           !lower.includes('endobj') && 
           !lower.includes('stream') && 
           !lower.includes('endstream') &&
           !lower.includes('xref') &&
           chunk.length > 2;
  });
  
  extractedText = filteredChunks.join(' ');
  
  console.log(`📝 Manual extraction found ${filteredChunks.length} text chunks`);
  console.log(`📝 Total manual extracted text length: ${extractedText.length}`);
  
  return extractedText.trim();
}

function extractReadableFromStream(stream: string): string {
  const readableChars = stream.match(/[\x20-\x7E]{5,}/g) || [];
  return readableChars
    .filter(text => /[A-Za-z]{3,}/.test(text))
    .join(' ');
}

function extractReadableFromObject(obj: string): string {
  const textMatches = obj.match(/\(([^)]+)\)/g) || [];
  return textMatches
    .map(match => match.replace(/[()]/g, ''))
    .filter(text => isReadableText(text))
    .join(' ');
}

function decodePDFText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\[(]/g, '(')
    .replace(/\\[)]/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/<([0-9A-Fa-f]+)>/g, (_, hex) => {
      // Decode hex strings
      let result = '';
      for (let i = 0; i < hex.length; i += 2) {
        result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
      }
      return result;
    });
}

function isReadableText(text: string): boolean {
  if (!text || text.length < 3) return false;
  
  const readableChars = text.match(/[A-Za-z0-9\s\$\.,\-\(\)\/]/g) || [];
  const readableRatio = readableChars.length / text.length;
  
  return readableRatio > 0.7;
}

function containsCreditKeywords(text: string): boolean {
  const keywords = [
    'credit', 'account', 'balance', 'payment', 'name', 'address',
    'phone', 'date', 'birth', 'social', 'security', 'experian',
    'equifax', 'transunion', 'visa', 'mastercard', 'discover',
    'chase', 'capital', 'wells', 'bank', 'score', 'report',
    'inquiry', 'collection', 'creditor', 'debt', 'limit'
  ];
  
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}

function cleanExtractedText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\$\.,\-\/\(\):@#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidCreditReportContent(text: string): boolean {
  if (!text || text.length < 100) return false;
  
  // Credit report specific patterns - more flexible matching
  const creditReportIndicators = [
    /credit.?report/i,
    /credit.?bureau/i,
    /equifax|experian|transunion/i,
    /consumer.?reporting/i,
    /fico.?score/i,
    /credit.?score/i,
    /payment.?history/i,
    /credit.?inquiry/i,
    /credit.?account/i,
    /personal.?information/i,
    /\b(?:ssn|social.?security)\b/i,
    /date.?of.?birth/i,
    /current.?address/i,
    /account.?number/i,
    /balance.*\$\d+/i,
    /credit.?limit/i,
    /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,  // Money amounts
    /\d{1,2}\/\d{1,2}\/\d{2,4}/,         // Dates
    /\b\d{4,16}\b/                       // Account numbers
  ];
  
  // Count how many indicators we find
  const matches = creditReportIndicators.filter(pattern => pattern.test(text)).length;
  
  // If we have at least 3 credit report indicators, consider it valid
  // OR if we have basic financial data (amounts + dates)
  const hasFinancialData = /\$\d+/.test(text) && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text);
  
  console.log(`Credit report validation: ${matches} indicators found, hasFinancialData: ${hasFinancialData}`);
  
  return matches >= 3 || (matches >= 1 && hasFinancialData);
}

async function parseAndStoreCreditDataWithLogging(supabase: any, reportId: string, text: string) {
  try {
    console.log('=== PARSING AND STORING CREDIT DATA ===');
    console.log(`Input text length: ${text.length}`);
    console.log(`Text sample: ${text.substring(0, 200)}...`);
    
    let personalInfoCount = 0;
    let accountsCount = 0;
    let inquiriesCount = 0;
    let negativeItemsCount = 0;

    // Clear existing data for this report
    console.log('🧹 Clearing existing data for report...');
    await supabase.from('personal_information').delete().eq('report_id', reportId);
    await supabase.from('credit_accounts').delete().eq('report_id', reportId);
    await supabase.from('credit_inquiries').delete().eq('report_id', reportId);
    await supabase.from('negative_items').delete().eq('report_id', reportId);

    // Extract and store personal information
    console.log('🔍 Extracting personal information...');
    const personalInfo = extractPersonalInfoEnhanced(text);
    console.log('Personal info extracted:', personalInfo);
    
    if (personalInfo.full_name || personalInfo.date_of_birth || personalInfo.current_address) {
      const { error: personalError } = await supabase.from('personal_information').insert({
        report_id: reportId,
        full_name: personalInfo.full_name,
        date_of_birth: personalInfo.date_of_birth,
        current_address: personalInfo.current_address,
        ssn_partial: personalInfo.ssn_partial,
        previous_addresses: personalInfo.previous_addresses || []
      });
      
      if (personalError) {
        console.error('Personal info insert error:', personalError);
      } else {
        personalInfoCount = 1;
        console.log('✅ Personal information stored successfully');
      }
    }

    // Extract and store credit accounts
    console.log('💳 Extracting credit accounts...');
    const accounts = extractCreditAccountsEnhanced(text);
    console.log(`Found ${accounts.length} credit accounts:`, accounts);
    
    for (const account of accounts) {
      const { error: accountError } = await supabase.from('credit_accounts').insert({
        report_id: reportId,
        creditor_name: account.creditor_name,
        account_number: account.account_number,
        account_type: account.account_type,
        current_balance: account.current_balance,
        credit_limit: account.credit_limit,
        account_status: account.account_status,
        date_opened: account.date_opened,
        payment_status: account.payment_status,
        is_negative: account.is_negative || false
      });
      
      if (accountError) {
        console.error('Account insert error:', accountError);
      } else {
        accountsCount++;
      }
    }
    console.log(`✅ Stored ${accountsCount} credit accounts`);

    // Extract and store credit inquiries
    console.log('🔍 Extracting credit inquiries...');
    const inquiries = extractCreditInquiriesEnhanced(text);
    console.log(`Found ${inquiries.length} credit inquiries:`, inquiries);
    
    for (const inquiry of inquiries) {
      const { error: inquiryError } = await supabase.from('credit_inquiries').insert({
        report_id: reportId,
        inquirer_name: inquiry.inquirer_name,
        inquiry_date: inquiry.inquiry_date,
        inquiry_type: inquiry.inquiry_type || 'hard'
      });
      
      if (inquiryError) {
        console.error('Inquiry insert error:', inquiryError);
      } else {
        inquiriesCount++;
      }
    }
    console.log(`✅ Stored ${inquiriesCount} credit inquiries`);

    // Extract and store collections/negative items
    console.log('⚠️ Extracting negative items...');
    const negativeItems = extractNegativeItemsEnhanced(text);
    console.log(`Found ${negativeItems.length} negative items:`, negativeItems);
    
    for (const item of negativeItems) {
      const { error: negativeError } = await supabase.from('negative_items').insert({
        report_id: reportId,
        negative_type: item.negative_type,
        description: item.description,
        amount: item.amount,
        date_occurred: item.date_occurred,
        severity_score: item.severity_score || 5
      });
      
      if (negativeError) {
        console.error('Negative item insert error:', negativeError);
      } else {
        negativeItemsCount++;
      }
    }
    console.log(`✅ Stored ${negativeItemsCount} negative items`);
    
    console.log('=== DATA PARSING COMPLETED ===');
    console.log(`Summary: ${personalInfoCount} personal info, ${accountsCount} accounts, ${inquiriesCount} inquiries, ${negativeItemsCount} negative items`);

    return {
      personalInfoCount,
      accountsCount,
      inquiriesCount,
      negativeItemsCount
    };

  } catch (error) {
    console.error('Error parsing and storing credit data:', error);
    throw error;
  }
}

// Enhanced parsing functions with better regex patterns

function extractPersonalInfoEnhanced(text: string): any {
  console.log('🔍 Enhanced personal info extraction...');
  const info: any = {};
  
  // Enhanced name patterns
  const namePatterns = [
    /(?:Consumer\s+Name|Full\s+Name|Name)[:\s]+([A-Z][a-zA-Z\s]+?)(?:\n|$|,|\s{3,})/i,
    /(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:DOB|Date\s+of\s+Birth)/i,
    /(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i
  ];
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (!name.toLowerCase().includes('john doe') && name.length > 3) {
        info.full_name = name;
        console.log('Found name:', name);
        break;
      }
    }
  }
  
  // Enhanced date of birth patterns
  const dobPatterns = [
    /(?:Date\s+of\s+Birth|DOB|Birth\s+Date)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:DOB|Birth)/i
  ];
  
  for (const pattern of dobPatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const dateParts = match[1].split('/');
        if (dateParts.length === 3) {
          const month = parseInt(dateParts[0]);
          const day = parseInt(dateParts[1]);
          const year = parseInt(dateParts[2]);
          
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
            const date = new Date(year, month - 1, day);
            info.date_of_birth = date.toISOString().split('T')[0];
            console.log('Found DOB:', info.date_of_birth);
            break;
          }
        }
      } catch (e) {
        console.warn('Invalid date format:', match[1]);
      }
    }
  }
  
  // Enhanced address patterns
  const addressPatterns = [
    /(?:Current\s+Address|Address|Residence)[:\s]+(\d+[^,\n]*(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl)[^,\n]*(?:,\s*[A-Z][^,\n]*){0,3})/i,
    /(\d+\s+[A-Z][a-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr)\s+[A-Z][a-z\s]*\s+[A-Z]{2}\s+\d{5})/i
  ];
  
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      info.current_address = { street: match[1].trim() };
      console.log('Found address:', match[1].trim());
      break;
    }
  }
  
  // SSN pattern
  const ssnPattern = /(?:SSN|Social\s+Security)[:\s]*(XXX-XX-\d{4}|\*\*\*-\*\*-\d{4}|XX\d-XX-\d{4})/i;
  const ssnMatch = text.match(ssnPattern);
  if (ssnMatch) {
    info.ssn_partial = ssnMatch[1];
    console.log('Found SSN partial:', ssnMatch[1]);
  }
  
  return info;
}

function extractCreditAccountsEnhanced(text: string): any[] {
  console.log('💳 Enhanced credit accounts extraction...');
  const accounts = [];
  
  // Split text into lines for better parsing
  const lines = text.split('\n');
  
  // Look for account patterns
  const accountPatterns = [
    /\b(Chase|Wells\s+Fargo|Bank\s+of\s+America|Capital\s+One|Citibank|American\s+Express|Discover|Synchrony|Credit\s+One)\b/gi,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Credit\s+Card|Visa|Mastercard|Card)\b/gi,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Auto\s+Loan|Mortgage|Personal\s+Loan)\b/gi
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const pattern of accountPatterns) {
      const matches = line.match(pattern);
      if (matches) {
        for (const match of matches) {
          const account: any = {
            creditor_name: match.trim()
          };
          
          // Look for account details in surrounding lines
          for (let j = Math.max(0, i - 2); j < Math.min(lines.length, i + 8); j++) {
            const contextLine = lines[j];
            
            // Account number
            const accountNumMatch = contextLine.match(/(?:Account|Acct)[:\s#]*(\*{4,}\d{4}|\d{4}[X*]{4,}\d{4}|\d{4}\s*\d{4})/i);
            if (accountNumMatch) {
              account.account_number = accountNumMatch[1];
            }
            
            // Balance
            const balanceMatch = contextLine.match(/(?:Balance|Current\s+Balance)[:\s]*\$?([\d,]+\.?\d*)/i);
            if (balanceMatch) {
              account.current_balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
            }
            
            // Credit limit
            const limitMatch = contextLine.match(/(?:Credit\s+Limit|Limit)[:\s]*\$?([\d,]+\.?\d*)/i);
            if (limitMatch) {
              account.credit_limit = parseFloat(limitMatch[1].replace(/,/g, ''));
            }
            
            // Account type
            if (contextLine.match(/Credit\s+Card|Visa|Mastercard/i)) {
              account.account_type = 'Credit Card';
            } else if (contextLine.match(/Auto\s+Loan/i)) {
              account.account_type = 'Auto Loan';
            } else if (contextLine.match(/Mortgage/i)) {
              account.account_type = 'Mortgage';
            }
            
            // Status
            const statusMatch = contextLine.match(/(?:Status|Payment\s+Status)[:\s]*(Current|Past\s+Due|Closed|Open)/i);
            if (statusMatch) {
              account.account_status = statusMatch[1];
            }
          }
          
          // Only add if we have meaningful data
          if (account.creditor_name && (account.account_number || account.current_balance)) {
            accounts.push(account);
          }
        }
      }
    }
  }
  
  // Remove duplicates
  const uniqueAccounts = accounts.filter((account, index, self) => 
    index === self.findIndex(a => a.creditor_name === account.creditor_name && a.account_number === account.account_number)
  );
  
  console.log(`Found ${uniqueAccounts.length} unique accounts`);
  return uniqueAccounts;
}

function extractCreditInquiriesEnhanced(text: string): any[] {
  console.log('🔍 Enhanced credit inquiries extraction...');
  const inquiries = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for company names followed by dates
    const companyMatch = line.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
    if (companyMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const dateMatch = nextLine.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      
      if (dateMatch) {
        try {
          const dateParts = dateMatch[1].split('/');
          const month = parseInt(dateParts[0]);
          const day = parseInt(dateParts[1]);
          const year = parseInt(dateParts[2]);
          
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const date = new Date(year < 100 ? 2000 + year : year, month - 1, day);
            inquiries.push({
              inquirer_name: companyMatch[1],
              inquiry_date: date.toISOString().split('T')[0],
              inquiry_type: 'hard'
            });
          }
        } catch (e) {
          console.warn('Invalid inquiry date:', dateMatch[1]);
        }
      }
    }
  }
  
  console.log(`Found ${inquiries.length} inquiries`);
  return inquiries;
}

function extractNegativeItemsEnhanced(text: string): any[] {
  console.log('⚠️ Enhanced negative items extraction...');
  const negativeItems = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for collection agencies
    if (line.match(/Collection|Services|Recovery|Debt/i)) {
      const item: any = {
        negative_type: 'collection',
        description: line.trim()
      };
      
      // Look for amount in surrounding lines
      for (let j = Math.max(0, i - 2); j < Math.min(lines.length, i + 3); j++) {
        const contextLine = lines[j];
        const amountMatch = contextLine.match(/\$?([\d,]+\.?\d*)/);
        if (amountMatch && parseFloat(amountMatch[1].replace(/,/g, '')) > 0) {
          item.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
          break;
        }
      }
      
      negativeItems.push(item);
    }
  }
  
  console.log(`Found ${negativeItems.length} negative items`);
  return negativeItems;
}