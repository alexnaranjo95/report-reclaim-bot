import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  console.log("=== ENHANCED PDF EXTRACTION FUNCTION START ===");
  console.log("Function called at:", new Date().toISOString());
  console.log("Request method:", req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("CORS preflight request handled");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== PARSING REQUEST ===");
    const body = await req.json();
    console.log("Request body keys:", Object.keys(body));
    console.log("Report ID:", body.reportId);
    console.log("File Path:", body.filePath);

    // Initialize Supabase client
    console.log("=== CREATING SUPABASE CLIENT ===");
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    console.log("Supabase URL exists:", !!supabaseUrl);
    console.log("Supabase Service Key exists:", !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download PDF file
    console.log("=== DOWNLOADING PDF FILE ===");
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(body.filePath);

    if (downloadError) {
      throw new Error(`Failed to download PDF: ${downloadError.message}`);
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    console.log("PDF downloaded successfully, size:", bytes.length, "bytes");

    // Basic validation
    if (bytes.length === 0) {
      throw new Error("PDF file is empty");
    }

    if (bytes.length > 5000000) {
      throw new Error("PDF file too large (max 5MB)");
    }

    console.log("✅ PDF validation passed");

    // Enhanced text extraction using multiple methods
    console.log("=== ENHANCED TEXT EXTRACTION ===");
    const extractedText = await extractTextWithMultipleMethods(bytes);
    
    console.log("Text extraction completed, length:", extractedText.length);
    console.log("Text preview:", extractedText.substring(0, 300));

    if (extractedText.length < 100) {
      throw new Error("Insufficient text extracted from PDF");
    }

    // Validate extracted text quality
    console.log("=== VALIDATING EXTRACTED TEXT ===");
    const hasCreditKeywords = /credit|account|balance|payment|inquiry|collection|name|address|phone|date|birth|social|security|experian|equifax|transunion|fico|score/i.test(extractedText);
    
    if (!hasCreditKeywords) {
      console.warn("⚠️ Extracted text may not contain credit report content");
      console.log("Text sample:", extractedText.substring(0, 500));
    } else {
      console.log("✅ Extracted text contains credit report keywords");
    }

    // Store in database
    console.log("=== STORING IN DATABASE ===");
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedText,
        extraction_status: 'completed',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.reportId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to store text: ${updateError.message}`);
    }

    console.log("✅ Processing completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: 'PDF processed successfully with enhanced extraction',
        textLength: extractedText.length,
        method: 'enhanced',
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error("=== FUNCTION ERROR ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    // Update status to failed
    try {
      const body = await req.clone().json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseServiceKey && body.reportId) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'failed',
            processing_errors: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', body.reportId);
      }
    } catch (updateError) {
      console.error("Failed to update error status:", updateError);
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function extractTextWithMultipleMethods(bytes: Uint8Array): Promise<string> {
  console.log("Using multiple extraction methods...");
  
  let extractedText = '';
  
  // Method 1: PDF structure parsing
  console.log("Method 1: PDF structure parsing...");
  const structureText = extractUsingPDFStructure(bytes);
  if (structureText.length > 200) {
    extractedText = structureText;
    console.log("✅ Structure parsing successful, length:", structureText.length);
  } else {
    console.log("⚠️ Structure parsing insufficient, trying next method...");
  }
  
  // Method 2: Advanced regex patterns
  if (extractedText.length < 200) {
    console.log("Method 2: Advanced regex patterns...");
    const regexText = extractUsingAdvancedRegex(bytes);
    if (regexText.length > extractedText.length) {
      extractedText = regexText;
      console.log("✅ Regex parsing successful, length:", regexText.length);
    } else {
      console.log("⚠️ Regex parsing insufficient, trying next method...");
    }
  }
  
  // Method 3: Binary scanning
  if (extractedText.length < 200) {
    console.log("Method 3: Binary scanning...");
    const binaryText = extractUsingBinaryScanning(bytes);
    if (binaryText.length > extractedText.length) {
      extractedText = binaryText;
      console.log("✅ Binary scanning successful, length:", binaryText.length);
    } else {
      console.log("⚠️ Binary scanning insufficient...");
    }
  }
  
  // Method 4: ASCII sequence extraction
  if (extractedText.length < 200) {
    console.log("Method 4: ASCII sequence extraction...");
    const asciiText = extractUsingASCIISequences(bytes);
    if (asciiText.length > extractedText.length) {
      extractedText = asciiText;
      console.log("✅ ASCII extraction successful, length:", asciiText.length);
    }
  }
  
  return cleanExtractedText(extractedText);
}

function extractUsingPDFStructure(bytes: Uint8Array): string {
  const textDecoder = new TextDecoder('latin1');
  const pdfString = textDecoder.decode(bytes);
  
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

function extractUsingAdvancedRegex(bytes: Uint8Array): string {
  const textDecoder = new TextDecoder('latin1');
  const pdfString = textDecoder.decode(bytes);
  
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

function extractUsingBinaryScanning(bytes: Uint8Array): string {
  let extractedText = '';
  const textChunks = [];
  
  // Scan for readable ASCII sequences
  let currentChunk = '';
  
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    
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

function extractUsingASCIISequences(bytes: Uint8Array): string {
  const textDecoder = new TextDecoder('latin1');
  const pdfString = textDecoder.decode(bytes);
  
  let extractedText = '';
  
  // Extract text in parentheses (common in PDFs)
  const textMatches = pdfString.match(/\(([^)]+)\)/g);
  if (textMatches) {
    extractedText += textMatches
      .map(match => match.slice(1, -1))
      .filter(text => text.length > 2 && /[a-zA-Z]/.test(text))
      .join(' ');
  }
  
  // Extract readable ASCII sequences
  const asciiMatches = pdfString.match(/[A-Za-z][A-Za-z0-9\s]{5,}/g);
  if (asciiMatches) {
    extractedText += ' ' + asciiMatches
      .filter(text => text.length > 3)
      .join(' ');
  }
  
  return extractedText.trim();
}

// Helper functions
function decodePDFString(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\[(]/g, '(')
    .replace(/\\[)]/g, ')')
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