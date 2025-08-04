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
    
    console.log('=== ADVANCED PDF EXTRACTION STARTED ===');
    console.log('Report ID:', reportId);
    console.log('File Path:', filePath);

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

    // Download PDF file
    console.log('📁 Downloading PDF file...');
    const { data: fileData, error: fileError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);

    if (fileError || !fileData) {
      throw new Error(`Failed to download PDF: ${fileError?.message || 'File not found'}`);
    }

    console.log(`📄 PDF downloaded successfully, size: ${fileData.size} bytes`);

    // Convert to array buffer for processing
    const arrayBuffer = await fileData.arrayBuffer();
    let extractedText = '';
    let extractionMethod = '';

    // Method 1: Try advanced PDF.js text extraction
    try {
      console.log('🔍 Attempting advanced PDF.js text extraction...');
      extractedText = await extractTextWithPDFJS(arrayBuffer);
      if (extractedText && extractedText.length > 200 && isValidCreditReportContent(extractedText)) {
        extractionMethod = 'Advanced PDF.js';
        console.log('✅ PDF.js extraction successful');
      } else {
        throw new Error('PDF.js failed: No text content found in PDF');
      }
    } catch (pdfjsError) {
      console.log(`❌ PDF.js failed: ${pdfjsError.message}`);
      
      // Method 2: Try OCR with Google Vision API
      if (googleApiKey) {
        try {
          console.log('🔍 Attempting OCR with Google Vision API...');
          extractedText = await extractTextWithOCR(arrayBuffer, googleApiKey);
          if (extractedText && extractedText.length > 200) {
            extractionMethod = 'Google Vision OCR';
            console.log('✅ OCR extraction successful');
          } else {
            throw new Error('OCR extraction returned insufficient text');
          }
        } catch (ocrError) {
          console.log(`❌ OCR failed: ${ocrError.message}`);
          throw new Error('Both PDF.js and OCR extraction methods failed');
        }
      } else {
        console.log('⚠️  Google Vision API key not configured, skipping OCR');
        throw new Error('PDF.js failed and OCR not available');
      }
    }

    console.log(`📊 Extraction completed using: ${extractionMethod}`);
    console.log(`📝 Extracted text length: ${extractedText.length}`);
    console.log(`📋 Text preview: ${extractedText.substring(0, 500)}...`);

    // Validate extraction quality
    if (!isValidCreditReportContent(extractedText)) {
      throw new Error(`Extraction failed - no valid credit report content found using ${extractionMethod}`);
    }

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

    // Parse and store structured data
    await parseAndStoreCreditData(supabase, reportId, cleanedText);

    console.log('=== ADVANCED EXTRACTION COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({ 
      success: true, 
      textLength: cleanedText.length,
      extractionMethod,
      message: 'Credit report extracted and parsed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('=== ADVANCED EXTRACTION ERROR ===');
    console.error('Error:', error.message);
    
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

async function extractTextWithPDFJS(arrayBuffer: ArrayBuffer): Promise<string> {
  console.log('🚀 Starting PDF.js extraction...');
  
  // Convert PDF to text using improved PDF.js-like parsing
  const uint8Array = new Uint8Array(arrayBuffer);
  const pdfString = new TextDecoder('latin1').decode(uint8Array);
  
  let extractedText = '';
  
  // Method 1: Extract from text objects (BT...ET blocks)
  console.log('📖 Extracting from text objects...');
  const textObjects = pdfString.match(/BT\s+[\s\S]*?ET/g) || [];
  console.log(`Found ${textObjects.length} text objects`);
  
  for (const textObj of textObjects) {
    // Extract text from Tj and TJ operators
    const tjMatches = textObj.match(/\(([^)]+)\)\s*Tj/g) || [];
    const tjArrayMatches = textObj.match(/\[([^\]]+)\]\s*TJ/g) || [];
    
    for (const match of [...tjMatches, ...tjArrayMatches]) {
      const text = match.replace(/[\(\)\[\]]/g, '').replace(/Tj|TJ/g, '').trim();
      if (text.length > 2 && isReadableText(text)) {
        extractedText += decodePDFText(text) + ' ';
      }
    }
  }
  
  // Method 2: Extract from PDF streams
  console.log('🌊 Extracting from PDF streams...');
  const streamPattern = /stream\s*([\s\S]*?)\s*endstream/g;
  let streamMatch;
  
  while ((streamMatch = streamPattern.exec(pdfString)) !== null) {
    const streamContent = streamMatch[1];
    const readableContent = extractReadableFromStream(streamContent);
    if (readableContent && containsCreditKeywords(readableContent)) {
      extractedText += readableContent + ' ';
    }
  }
  
  // Method 3: Extract from PDF objects
  console.log('🔍 Extracting from PDF objects...');
  const objectPattern = /(\d+)\s+\d+\s+obj\s*([\s\S]*?)\s*endobj/g;
  let objMatch;
  
  while ((objMatch = objectPattern.exec(pdfString)) !== null) {
    const objectContent = objMatch[2];
    if (objectContent.includes('/Contents') || objectContent.includes('/Text')) {
      const readableContent = extractReadableFromObject(objectContent);
      if (readableContent && containsCreditKeywords(readableContent)) {
        extractedText += readableContent + ' ';
      }
    }
  }
  
  console.log(`📝 PDF.js extracted ${extractedText.length} characters`);
  
  if (extractedText.length < 100) {
    throw new Error('PDF.js extraction yielded insufficient text - PDF may be image-based');
  }
  
  return extractedText.trim();
}

async function extractTextWithOCR(arrayBuffer: ArrayBuffer, apiKey: string): Promise<string> {
  console.log('🔍 Starting OCR extraction...');
  
  try {
    // Convert PDF to images first, then OCR each page
    const images = await convertPDFToImages(arrayBuffer);
    console.log(`📸 Converted PDF to ${images.length} images`);
    
    let fullText = '';
    
    for (let i = 0; i < images.length; i++) {
      console.log(`🔤 OCR processing page ${i + 1}/${images.length}...`);
      
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            image: {
              content: images[i] // Base64 encoded image
            },
            features: [{
              type: 'TEXT_DETECTION',
              maxResults: 1
            }]
          }]
        })
      });
      
      if (!response.ok) {
        throw new Error(`Google Vision API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.responses?.[0]?.textAnnotations?.[0]?.description) {
        const pageText = result.responses[0].textAnnotations[0].description;
        fullText += pageText + '\n\n';
        console.log(`✅ Page ${i + 1} OCR completed, extracted ${pageText.length} characters`);
      } else {
        console.log(`⚠️  No text found on page ${i + 1}`);
      }
      
      // Add delay to respect API rate limits
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`📝 OCR completed, total text length: ${fullText.length}`);
    return fullText.trim();
    
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw new Error(`OCR extraction failed: ${error.message}`);
  }
}

async function convertPDFToImages(arrayBuffer: ArrayBuffer): Promise<string[]> {
  // This is a simplified version - in practice you'd use a library like pdf-poppler
  // For now, we'll implement a basic conversion that works with simple PDFs
  
  console.log('🖼️  Converting PDF to images...');
  
  // For demonstration, we'll return the PDF data as base64 and let Google Vision handle it
  // In a real implementation, you'd convert each page to a PNG/JPEG image
  
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  return [base64]; // Return as single "image" for now
}

function extractReadableFromStream(stream: string): string {
  // Extract readable text from PDF stream
  const readableChars = stream.match(/[\x20-\x7E]{3,}/g) || [];
  return readableChars
    .filter(text => containsCreditKeywords(text) || /[A-Za-z]{3,}/.test(text))
    .join(' ');
}

function extractReadableFromObject(obj: string): string {
  // Extract readable text from PDF object
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
    .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function isReadableText(text: string): boolean {
  if (!text || text.length < 3) return false;
  
  // Check for readable characters ratio
  const readableChars = text.match(/[A-Za-z0-9\s\$\.,\-\(\)\/]/g) || [];
  const readableRatio = readableChars.length / text.length;
  
  return readableRatio > 0.6;
}

function containsCreditKeywords(text: string): boolean {
  const keywords = [
    'credit', 'account', 'balance', 'payment', 'name', 'address',
    'phone', 'date', 'birth', 'social', 'security', 'experian',
    'equifax', 'transunion', 'visa', 'mastercard', 'discover',
    'chase', 'capital', 'wells', 'bank', 'score', 'report'
  ];
  
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}

function cleanExtractedText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')                    // Normalize whitespace
    .replace(/[^\w\s\$\.,\-\/\(\):@#]/g, ' ') // Keep essential punctuation
    .replace(/\s+/g, ' ')                    // Final cleanup
    .trim();
}

function isValidCreditReportContent(text: string): boolean {
  if (!text || text.length < 200) return false;
  
  const requiredElements = [
    /\b(?:name|full.?name|first.?name|last.?name)\b/i,
    /\b(?:address|street|city|state|zip)\b/i,
    /\b(?:account|credit|balance|payment)\b/i,
    /\b(?:date|birth|dob|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i
  ];
  
  const matchCount = requiredElements.filter(pattern => pattern.test(text)).length;
  return matchCount >= 2; // Lowered threshold for better detection
}

async function parseAndStoreCreditData(supabase: any, reportId: string, text: string) {
  try {
    console.log('=== PARSING AND STORING CREDIT DATA ===');
    
    // Extract and store personal information
    console.log('🔍 Extracting personal information...');
    const personalInfo = extractPersonalInfo(text);
    if (personalInfo.full_name || personalInfo.date_of_birth || personalInfo.current_address) {
      const { error: personalError } = await supabase.from('personal_information').upsert({
        report_id: reportId,
        full_name: personalInfo.full_name,
        date_of_birth: personalInfo.date_of_birth,
        current_address: personalInfo.current_address,
        ssn_partial: personalInfo.ssn_partial
      }, { onConflict: 'report_id' });
      
      if (personalError) {
        console.error('Personal info insert error:', personalError);
      } else {
        console.log('✅ Personal information stored successfully');
      }
    }

    // Extract and store credit accounts
    console.log('💳 Extracting credit accounts...');
    const accounts = extractCreditAccounts(text);
    
    // Delete existing accounts for this report first
    await supabase.from('credit_accounts').delete().eq('report_id', reportId);
    
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
    console.log(`✅ Stored ${accounts.length} credit accounts`);

    // Extract and store credit inquiries
    console.log('🔍 Extracting credit inquiries...');
    const inquiries = extractCreditInquiries(text);
    
    // Delete existing inquiries for this report first
    await supabase.from('credit_inquiries').delete().eq('report_id', reportId);
    
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
    console.log(`✅ Stored ${inquiries.length} credit inquiries`);

    // Extract and store collections/negative items
    console.log('⚠️  Extracting negative items...');
    const negativeItems = extractNegativeItems(text);
    
    // Delete existing negative items for this report first
    await supabase.from('negative_items').delete().eq('report_id', reportId);
    
    for (const item of negativeItems) {
      const { error: negativeError } = await supabase.from('negative_items').insert({
        report_id: reportId,
        negative_type: item.negative_type,
        description: item.description,
        amount: item.amount,
        status: item.status || 'active'
      });
      
      if (negativeError) {
        console.error('Negative item insert error:', negativeError);
      }
    }
    console.log(`✅ Stored ${negativeItems.length} negative items`);
    
    console.log('=== DATA PARSING COMPLETED ===');

  } catch (error) {
    console.error('Error parsing and storing credit data:', error);
    throw error;
  }
}

function extractPersonalInfo(text: string): any {
  const info: any = {};
  
  // Extract name patterns
  const namePatterns = [
    /(?:name|full name|consumer name)[:\s]+([A-Z][a-zA-Z\s]+)(?:\n|$)/i,
    /^([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*$/m
  ];
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1] && !match[1].includes('John Doe')) {
      info.full_name = match[1].trim();
      break;
    }
  }
  
  // Extract date of birth
  const dobPattern = /(?:date of birth|dob|birth date)[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const dobMatch = text.match(dobPattern);
  if (dobMatch) {
    info.date_of_birth = dobMatch[1];
  }
  
  // Extract address
  const addressPattern = /(?:address|current address)[:\s]+([^\n]+(?:\n[^\n]+)*?)(?:\n\n|\nPhone|\nSSN|$)/i;
  const addressMatch = text.match(addressPattern);
  if (addressMatch) {
    info.current_address = addressMatch[1].trim();
  }
  
  // Extract partial SSN
  const ssnPattern = /(?:ssn|social security)[:\s]+(XXX-XX-\d{4}|\*\*\*-\*\*-\d{4})/i;
  const ssnMatch = text.match(ssnPattern);
  if (ssnMatch) {
    info.ssn_partial = ssnMatch[1];
  }
  
  return info;
}

function extractCreditAccounts(text: string): any[] {
  const accounts = [];
  
  // Enhanced account patterns
  const accountPatterns = [
    /([A-Z][a-zA-Z\s&]+(?:Bank|Card|Credit|Financial|Capital|Chase|Wells|Citi|Discover|American Express))\s*\n.*?Account[:\s]*(\*+\d{4}|\d{4})\s*\n.*?Balance[:\s]*\$?([\d,]+\.?\d*)/gi,
    /(Chase|Capital One|Wells Fargo|Bank of America|Citi|Discover|American Express)[^\n]*\n.*?(\*+\d{4})\s*\n.*?\$?([\d,]+\.?\d*)/gi
  ];
  
  for (const pattern of accountPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const account = {
        creditor_name: match[1].trim(),
        account_number: match[2],
        current_balance: parseFloat(match[3].replace(/,/g, '')) || 0,
        account_type: determineAccountType(match[1]),
        account_status: 'current',
        is_negative: false
      };
      
      if (account.creditor_name && account.account_number) {
        accounts.push(account);
      }
    }
  }
  
  return accounts;
}

function extractCreditInquiries(text: string): any[] {
  const inquiries = [];
  
  const inquiryPatterns = [
    /([A-Z][a-zA-Z\s&]+)\s*\n.*?Date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
    /(Verizon|T-Mobile|Sprint|AT&T|Capital One|Chase|Wells Fargo)[^\n]*\n.*?(\d{1,2}\/\d{1,2}\/\d{2,4})/gi
  ];
  
  for (const pattern of inquiryPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const inquiry = {
        inquirer_name: match[1].trim(),
        inquiry_date: match[2],
        inquiry_type: 'hard'
      };
      
      if (inquiry.inquirer_name && inquiry.inquiry_date) {
        inquiries.push(inquiry);
      }
    }
  }
  
  return inquiries;
}

function extractNegativeItems(text: string): any[] {
  const negativeItems = [];
  
  const collectionPattern = /([A-Z][a-zA-Z\s]+(?:Collection|Medical|Recovery))[^\n]*\n.*?\$?([\d,]+\.?\d*)/gi;
  
  let match;
  while ((match = collectionPattern.exec(text)) !== null) {
    const item = {
      negative_type: 'collection',
      description: match[1].trim(),
      amount: parseFloat(match[2].replace(/,/g, '')) || 0,
      status: 'active'
    };
    
    if (item.description && item.amount > 0) {
      negativeItems.push(item);
    }
  }
  
  return negativeItems;
}

function determineAccountType(creditorName: string): string {
  const credit_cards = ['credit', 'card', 'visa', 'mastercard', 'discover', 'american express'];
  const auto_loans = ['auto', 'car', 'vehicle', 'motor'];
  const mortgages = ['mortgage', 'home', 'house', 'real estate'];
  
  const name = creditorName.toLowerCase();
  
  if (credit_cards.some(keyword => name.includes(keyword))) return 'credit_card';
  if (auto_loans.some(keyword => name.includes(keyword))) return 'auto_loan';
  if (mortgages.some(keyword => name.includes(keyword))) return 'mortgage';
  
  return 'other';
}