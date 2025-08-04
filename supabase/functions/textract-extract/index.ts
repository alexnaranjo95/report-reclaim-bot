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

function validateExtractedText(text: string): boolean {
  if (!text || text.length < 50) {
    console.log("❌ Text validation failed: too short");
    return false;
  }
  
  // Check for reasonable text content
  const alphaNumericRatio = (text.match(/[a-zA-Z0-9]/g) || []).length / text.length;
  if (alphaNumericRatio < 0.3) {
    console.log("❌ Text validation failed: low alphanumeric ratio", alphaNumericRatio);
    return false;
  }
  
  console.log("✅ Text validation passed");
  return true;
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

    let extractedText = '';
    let extractionMethod = 'none';
    let extractionError = null;

    // PRIMARY: Try AWS Textract if credentials are available
    if (awsAccessKeyId && awsSecretAccessKey) {
      try {
        console.log("=== ATTEMPTING AWS TEXTRACT EXTRACTION ===");
        const textractClient = new TextractClient(awsAccessKeyId, awsSecretAccessKey, awsRegion);
        extractedText = await textractClient.detectDocumentText(bytes);
        extractionMethod = 'aws_textract';
        
        console.log("✅ AWS Textract extraction successful");
        console.log("Extracted text length:", extractedText.length);
        
        // Log AWS usage for monitoring
        console.log("=== AWS USAGE TRACKING ===");
        console.log("Service: AWS Textract");
        console.log("Operation: DetectDocumentText");
        console.log("Document size:", bytes.length);
        console.log("Success: true");
        console.log("Timestamp:", new Date().toISOString());
        
      } catch (textractError) {
        console.error("❌ AWS Textract extraction failed:", textractError);
        extractionError = textractError.message;
        extractedText = ''; // Reset for fallback
      }
    } else {
      console.log("⚠️ AWS credentials not available, skipping Textract");
      extractionError = 'AWS credentials not configured';
    }

    // SECONDARY: Enhanced PDF.js extraction fallback
    if (!extractedText || extractedText.length < 100) {
      try {
        console.log("=== ATTEMPTING ENHANCED PDF EXTRACTION ===");
        const pdfString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
        
        // Method 1: Extract text in parentheses (cleaned)
        const textMatches = pdfString.match(/\(([^)]+)\)/g);
        if (textMatches) {
          const cleanedMatches = textMatches
            .map(match => match.slice(1, -1))
            .filter(text => text.length > 2 && /[a-zA-Z]/.test(text))
            .map(text => text.replace(/[^\x20-\x7E]/g, ' ')) // Remove non-printable chars
            .join(' ');
          extractedText += cleanedMatches;
        }
        
        // Method 2: Extract readable ASCII sequences (improved)
        const asciiMatches = pdfString.match(/[A-Za-z][A-Za-z0-9\s,.:-]{5,}/g);
        if (asciiMatches) {
          const cleanedAscii = asciiMatches
            .filter(text => text.length > 3)
            .map(text => text.replace(/[^\x20-\x7E]/g, ' ')) // Remove non-printable chars
            .join(' ');
          extractedText += ' ' + cleanedAscii;
        }

        extractionMethod = extractionMethod === 'none' ? 'enhanced_pdf_parsing' : 'aws_textract_with_pdf_fallback';
        console.log("✅ Enhanced PDF extraction completed");
        
      } catch (pdfError) {
        console.error("❌ Enhanced PDF extraction failed:", pdfError);
        if (!extractionError) {
          extractionError = pdfError.message;
        }
      }
    }

    // TERTIARY: Last resort manual parsing
    if (!extractedText || extractedText.length < 50) {
      console.log("=== ATTEMPTING MANUAL PARSING (LAST RESORT) ===");
      try {
        const pdfString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
        const basicMatches = pdfString.match(/[A-Za-z]{3,}/g);
        if (basicMatches) {
          extractedText = basicMatches
            .filter(text => text.length > 2)
            .join(' ');
        }
        extractionMethod = extractionMethod.includes('aws') ? 'aws_textract_with_manual_fallback' : 'manual_parsing_only';
        console.log("Manual parsing completed, length:", extractedText.length);
      } catch (manualError) {
        console.error("❌ Manual parsing failed:", manualError);
        throw new Error("All extraction methods failed: " + (extractionError || manualError.message));
      }
    }

    // Sanitize extracted text
    console.log("=== SANITIZING EXTRACTED TEXT ===");
    const originalLength = extractedText.length;
    extractedText = sanitizeText(extractedText);
    
    console.log("Original length:", originalLength);
    console.log("Sanitized length:", extractedText.length);
    console.log("Extraction method:", extractionMethod);

    // Validate final text
    if (!validateExtractedText(extractedText)) {
      throw new Error("Extracted text failed validation checks");
    }

    // Store in database with enhanced metadata
    console.log("=== STORING EXTRACTED TEXT IN DATABASE ===");
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedText,
        extraction_status: 'completed',
        processing_errors: extractionError,
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