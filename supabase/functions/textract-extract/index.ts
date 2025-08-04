import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Textract client interface with enhanced error handling
class TextractClient {
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;
  private maxRetries: number = 3;
  private timeout: number = 30000; // 30 seconds

  constructor(accessKeyId: string, secretAccessKey: string, region: string) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
  }

  async detectDocumentText(document: Uint8Array): Promise<string> {
    // Validate document size (AWS Textract limit is 10MB)
    if (document.byteLength > 10 * 1024 * 1024) {
      throw new Error('Document size exceeds AWS Textract limit of 10MB');
    }

    console.log(`📄 Processing document of size: ${(document.byteLength / 1024 / 1024).toFixed(2)}MB`);

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 AWS Textract attempt ${attempt}/${this.maxRetries}`);
        
        const result = await this.makeTextractRequest(document);
        
        // Extract text from the response
        let extractedText = '';
        if (result.Blocks) {
          const lineBlocks = result.Blocks.filter(block => block.BlockType === 'LINE');
          console.log(`📝 Found ${lineBlocks.length} text lines in Textract response`);
          
          for (const block of lineBlocks) {
            if (block.Text) {
              extractedText += block.Text + '\n';
            }
          }
        }

        if (extractedText.length < 100) {
          throw new Error('Insufficient text extracted from document - may be an image or corrupted file');
        }

        console.log(`✅ AWS Textract extracted ${extractedText.length} characters`);
        return extractedText;

      } catch (error) {
        console.error(`❌ AWS Textract attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('AWS Textract failed after all retry attempts');
  }

  private async makeTextractRequest(document: Uint8Array): Promise<any> {
    const host = `textract.${this.region}.amazonaws.com`;
    const endpoint = `https://${host}/`;
    
    const payload = {
      Document: {
        Bytes: this.encodeBase64Chunked(document)
      },
      FeatureTypes: []
    };

    const body = JSON.stringify(payload);
    const headers = await this.createAWSHeaders('DetectDocumentText', body);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new Error(`Rate limited: ${errorText}`);
        }
        throw new Error(`Textract API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private encodeBase64Chunked(data: Uint8Array): string {
    try {
      // Process in chunks to avoid memory issues with large files
      const chunkSize = 8192;
      let binary = '';
      
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.subarray(i, i + chunkSize);
        const chunkBinary = Array.from(chunk).map(byte => String.fromCharCode(byte)).join('');
        binary += chunkBinary;
      }
      
      return btoa(binary);
    } catch (error) {
      console.error('Base64 encoding failed:', error);
      throw new Error('Failed to encode document for AWS Textract');
    }
  }

  private async createAWSHeaders(action: string, payload: string): Promise<Record<string, string>> {
    const host = `textract.${this.region}.amazonaws.com`;
    const now = new Date();
    const isoDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const date = isoDate.substring(0, 8);

    // Create canonical request
    const canonicalHeaders = [
      `content-type:application/x-amz-json-1.1`,
      `host:${host}`,
      `x-amz-date:${isoDate}`,
      `x-amz-target:Textract.${action}`
    ].join('\n') + '\n';
    
    const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
    const payloadHash = await this.sha256(payload);
    
    const canonicalRequest = [
      'POST',
      '/',
      '', // query string
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${date}/${this.region}/textract/aws4_request`;
    const stringToSign = [
      algorithm,
      isoDate,
      credentialScope,
      await this.sha256(canonicalRequest)
    ].join('\n');

    // Calculate signature
    const signingKey = await this.getSigningKey(this.secretAccessKey, date, this.region, 'textract');
    const signature = await this.hmacSha256(signingKey, stringToSign);

    const authorizationHeader = `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `Textract.${action}`,
      'X-Amz-Date': isoDate,
      'Host': host,
      'Authorization': authorizationHeader
    };
  }

  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async hmacSha256(key: Uint8Array, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyObject = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', keyObject, encoder.encode(message));
    const signatureArray = Array.from(new Uint8Array(signature));
    return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async getSigningKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const kDate = await this.hmacSha256Raw(encoder.encode('AWS4' + key), dateStamp);
    const kRegion = await this.hmacSha256Raw(kDate, regionName);
    const kService = await this.hmacSha256Raw(kRegion, serviceName);
    const kSigning = await this.hmacSha256Raw(kService, 'aws4_request');
    return kSigning;
  }

  private async hmacSha256Raw(key: Uint8Array, message: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const keyObject = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', keyObject, encoder.encode(message));
    return new Uint8Array(signature);
  }
}

// Text sanitization utilities
function sanitizeText(text: string): string {
  console.log("=== TEXT SANITIZATION ===");
  console.log("Original text length:", text.length);
  
  // Remove null characters and other problematic Unicode sequences
  let sanitized = text
    .replace(/\x00/g, '') // Remove null characters
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\uFFFD/g, '') // Remove replacement characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove additional control chars
    .trim();

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  console.log("Sanitized text length:", sanitized.length);
  console.log("Characters removed:", text.length - sanitized.length);
  
  return sanitized;
}

// Enhanced PDF content validation
function validatePDFContent(text: string): {
  isValid: boolean;
  reason?: string;
  detectedType: 'credit_report' | 'image_based' | 'metadata_only' | 'encrypted' | 'empty';
  creditKeywords: number;
  contentRatio: number;
} {
  console.log("=== ENHANCED PDF CONTENT VALIDATION ===");
  console.log("Text length:", text.length);
  
  if (!text || text.length < 50) {
    console.log("❌ Text too short - likely empty or corrupted PDF");
    return { 
      isValid: false, 
      reason: "PDF contains no readable text. Please upload a text-based credit report PDF from Experian, Equifax, or TransUnion.",
      detectedType: 'empty',
      creditKeywords: 0,
      contentRatio: 0
    };
  }
  
  // Check for PDF metadata indicators (signs of failed extraction)
  const hasMetadata = text.includes('endstream') && text.includes('endobj') && text.includes('stream');
  const hasMozilla = text.includes('Mozilla') || text.includes('mozilla');
  
  // Calculate content quality metrics
  const alphaNumericRatio = (text.match(/[a-zA-Z0-9]/g) || []).length / text.length;
  const alphabeticRatio = (text.match(/[a-zA-Z ]/g) || []).length / text.length;
  
  // Count credit report keywords
  const creditKeywords = [
    /credit report/gi,
    /experian|equifax|transunion/gi,
    /account number|acct/gi,
    /balance.*payment/gi,
    /creditor|lender/gi,
    /inquiry|inquiries/gi,
    /date opened|date of birth/gi,
    /social security|ssn/gi,
    /fico|credit score/gi,
    /tradeline|trade line/gi
  ].reduce((count, regex) => count + (text.match(regex) || []).length, 0);
  
  console.log("Content metrics:");
  console.log("- Alphanumeric ratio:", alphaNumericRatio.toFixed(3));
  console.log("- Alphabetic ratio:", alphabeticRatio.toFixed(3));
  console.log("- Credit keywords found:", creditKeywords);
  console.log("- Has PDF metadata:", hasMetadata);
  console.log("- Has Mozilla markers:", hasMozilla);
  
  // Determine PDF type and validation result
  if (hasMetadata && alphaNumericRatio < 0.4) {
    return {
      isValid: false,
      reason: "PDF contains mostly metadata. Please upload a text-based credit report PDF, not a browser-generated or image-based file.",
      detectedType: 'metadata_only',
      creditKeywords,
      contentRatio: alphaNumericRatio
    };
  }
  
  if (hasMozilla && alphabeticRatio < 0.5) {
    return {
      isValid: false,
      reason: "PDF appears to be browser-generated or corrupted. Please download a direct PDF from your credit bureau.",
      detectedType: 'image_based',
      creditKeywords,
      contentRatio: alphabeticRatio
    };
  }
  
  if (creditKeywords === 0) {
    return {
      isValid: false,
      reason: "PDF contains no credit report data. Please ensure you're uploading a genuine credit report from Experian, Equifax, or TransUnion.",
      detectedType: 'image_based',
      creditKeywords,
      contentRatio: alphaNumericRatio
    };
  }
  
  if (creditKeywords < 3 && alphaNumericRatio < 0.5) {
    return {
      isValid: false,
      reason: "PDF quality is too low for processing. Please upload a high-quality, text-based credit report PDF.",
      detectedType: 'image_based',
      creditKeywords,
      contentRatio: alphaNumericRatio
    };
  }
  
  console.log("✅ PDF content validation passed");
  return {
    isValid: true,
    detectedType: 'credit_report',
    creditKeywords,
    contentRatio: alphaNumericRatio
  };
}

function validateExtractedText(text: string): boolean {
  const validation = validatePDFContent(text);
  return validation.isValid;
}

/**
 * Determine file type based on file path and content
 */
function determineFileType(filePath: string, bytes: Uint8Array): string {
  const fileName = filePath.toLowerCase();
  
  // Check by file extension
  if (fileName.endsWith('.pdf')) return 'pdf';
  if (fileName.match(/\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/)) return 'image';
  if (fileName.match(/\.(doc|docx)$/)) return 'word';
  if (fileName.match(/\.(html|htm)$/)) return 'html';
  
  // Check by content signature
  const header = Array.from(bytes.slice(0, 10)).map(b => String.fromCharCode(b)).join('');
  if (header.startsWith('%PDF-')) return 'pdf';
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image'; // JPEG
  if (header.startsWith('\x89PNG')) return 'image';
  if (header.startsWith('GIF8')) return 'image';
  if (header.includes('<!DOCTYPE') || header.includes('<html')) return 'html';
  
  return 'unknown';
}

/**
 * Process PDF files (existing logic)
 */
async function processPDFFile(bytes: Uint8Array): Promise<string> {
  let extractedText = '';
  let extractionMethod = 'none';
  let extractionError = null;

  // Try AWS Textract first if available
  const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';

  if (awsAccessKeyId && awsSecretAccessKey) {
    try {
      console.log("=== ATTEMPTING AWS TEXTRACT EXTRACTION ===");
      const textractClient = new TextractClient(awsAccessKeyId, awsSecretAccessKey, awsRegion);
      extractedText = await textractClient.detectDocumentText(bytes);
      extractionMethod = 'aws_textract';
      console.log("✅ AWS Textract extraction successful");
    } catch (textractError) {
      console.error("❌ AWS Textract extraction failed:", textractError);
      extractionError = textractError.message;
    }
  }

  // Fallback to enhanced PDF parsing if Textract fails
  if (!extractedText || extractedText.length < 100) {
    console.log("=== ATTEMPTING ENHANCED PDF EXTRACTION ===");
    const pdfString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    
    // Extract text from PDF structure
    const textMatches = pdfString.match(/\(([^)]+)\)/g);
    if (textMatches) {
      const cleanedMatches = textMatches
        .map(match => match.slice(1, -1))
        .filter(text => text.length > 2 && /[a-zA-Z]/.test(text))
        .map(text => text.replace(/[^\x20-\x7E]/g, ' '))
        .join(' ');
      extractedText += cleanedMatches;
    }
    
    extractionMethod = 'enhanced_pdf_parsing';
    console.log("✅ Enhanced PDF extraction completed");
  }

  return extractedText;
}

/**
 * Process image files using OCR
 */
async function processImageFile(bytes: Uint8Array): Promise<string> {
  // For image files, we'll use AWS Textract's OCR capabilities
  const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';

  if (!awsAccessKeyId || !awsSecretAccessKey) {
    throw new Error('AWS credentials required for image OCR processing');
  }

  try {
    console.log("=== PROCESSING IMAGE WITH OCR ===");
    const textractClient = new TextractClient(awsAccessKeyId, awsSecretAccessKey, awsRegion);
    const extractedText = await textractClient.detectDocumentText(bytes);
    console.log("✅ Image OCR processing completed");
    return extractedText;
  } catch (error) {
    console.error("❌ Image OCR processing failed:", error);
    throw new Error(`Image OCR failed: ${error.message}`);
  }
}

/**
 * Process Word documents by converting to text
 */
async function processWordDocument(bytes: Uint8Array): Promise<string> {
  // For Word documents, we'll extract what text we can from the binary format
  // This is a basic implementation - in production you'd want a proper Word parser
  console.log("=== CONVERTING WORD DOCUMENT ===");
  
  try {
    const docString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    
    // Extract readable ASCII text from Word document
    const textMatches = docString.match(/[A-Za-z][A-Za-z0-9\s,.:\-()]{10,}/g);
    if (textMatches) {
      const extractedText = textMatches
        .filter(text => text.length > 5)
        .filter(text => /[a-zA-Z].*[a-zA-Z]/.test(text)) // Must contain letters
        .join(' ')
        .replace(/[^\x20-\x7E]/g, ' ') // Remove non-printable chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      console.log("✅ Word document conversion completed");
      return extractedText;
    }
    
    throw new Error('No readable text found in Word document');
  } catch (error) {
    console.error("❌ Word document processing failed:", error);
    throw new Error(`Word document processing failed: ${error.message}`);
  }
}

/**
 * Process HTML files by extracting text content
 */
async function processHTMLFile(bytes: Uint8Array): Promise<string> {
  console.log("=== PROCESSING HTML FILE ===");
  
  try {
    const htmlContent = new TextDecoder().decode(bytes);
    
    // Basic HTML text extraction (remove tags)
    let extractedText = htmlContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (extractedText.length < 50) {
      throw new Error('Insufficient text content in HTML file');
    }
    
    console.log("✅ HTML processing completed");
    return extractedText;
  } catch (error) {
    console.error("❌ HTML processing failed:", error);
    throw new Error(`HTML processing failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  console.log("=== TEXTRACT FUNCTION START ===");
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

    // Check AWS credentials
    console.log("=== CHECKING AWS CREDENTIALS ===");
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';
    
    console.log("AWS Access Key ID exists:", !!awsAccessKeyId);
    console.log("AWS Secret Access Key exists:", !!awsSecretAccessKey);
    console.log("AWS Region:", awsRegion);

    // Download file
    console.log("=== DOWNLOADING FILE ===");
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(body.filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    console.log("File downloaded successfully, size:", bytes.length, "bytes");

    // Basic validation
    if (bytes.length === 0) {
      throw new Error("File is empty");
    }

    if (bytes.length > 50000000) { // 50MB limit for all file types
      throw new Error("File too large (max 50MB)");
    }

    // Determine file type and process accordingly
    const fileType = determineFileType(body.filePath, bytes);
    console.log("Detected file type:", fileType);

    let extractedText = '';
    let extractionMethod = '';

    switch (fileType) {
      case 'pdf':
        console.log("=== PROCESSING PDF FILE ===");
        extractedText = await processPDFFile(bytes);
        extractionMethod = 'pdf_processing';
        break;
        
      case 'image':
        console.log("=== PROCESSING IMAGE FILE ===");
        extractedText = await processImageFile(bytes);
        extractionMethod = 'image_ocr';
        break;
        
      case 'word':
        console.log("=== PROCESSING WORD DOCUMENT ===");
        extractedText = await processWordDocument(bytes);
        extractionMethod = 'document_conversion';
        break;
        
      case 'html':
        console.log("=== PROCESSING HTML FILE ===");
        extractedText = await processHTMLFile(bytes);
        extractionMethod = 'html_conversion';
        break;
        
      default:
        throw new Error(`Unsupported file type: ${fileType}. Please upload PDF, image, Word document, or HTML file.`);
    }

    // Sanitize extracted text
    console.log("=== SANITIZING EXTRACTED TEXT ===");
    const originalLength = extractedText.length;
    extractedText = sanitizeText(extractedText);
    
    console.log("Original length:", originalLength);
    console.log("Sanitized length:", extractedText.length);
    console.log("Extraction method:", extractionMethod);

    // Enhanced content validation with detailed feedback
    console.log("=== FINAL CONTENT VALIDATION ===");
    const validation = validatePDFContent(extractedText);
    
    if (!validation.isValid) {
      console.error("❌ Content validation failed:", validation.reason);
      console.error("Detected type:", validation.detectedType);
      console.error("Credit keywords found:", validation.creditKeywords);
      console.error("Content ratio:", validation.contentRatio);
      
      throw new Error(validation.reason || "PDF content validation failed");
    }
    
    console.log("✅ Content validation passed:");
    console.log("- Credit keywords found:", validation.creditKeywords);
    console.log("- Content quality ratio:", validation.contentRatio);
    console.log("- Detected type:", validation.detectedType);

    // Store in database with enhanced metadata
    console.log("=== STORING EXTRACTED TEXT IN DATABASE ===");
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
    console.log("Final extraction method:", extractionMethod);
    console.log("Final text length:", extractedText.length);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'PDF processed successfully',
        textLength: extractedText.length,
        extractionMethod: extractionMethod,
        hadErrors: !!extractionError,
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