import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Textract client interface
class TextractClient {
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;

  constructor(accessKeyId: string, secretAccessKey: string, region: string) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
  }

  async detectDocumentText(document: Uint8Array): Promise<string> {
    console.log("=== AWS TEXTRACT API CALL ===");
    console.log("Document size:", document.length, "bytes");
    console.log("AWS Region:", this.region);
    console.log("AWS Access Key ID exists:", !!this.accessKeyId);
    console.log("Timestamp:", new Date().toISOString());

    const base64Document = btoa(String.fromCharCode.apply(null, Array.from(document)));
    console.log("Base64 document size:", base64Document.length);

    const requestBody = {
      Document: {
        Bytes: base64Document
      }
    };

    const url = `https://textract.${this.region}.amazonaws.com/`;
    const headers = await this.createAWSHeaders('DetectDocumentText', JSON.stringify(requestBody));

    console.log("Making AWS Textract API request...");
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      const duration = Date.now() - startTime;
      console.log("AWS Textract response received in", duration, "ms");
      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AWS Textract error response:", errorText);
        throw new Error(`AWS Textract API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log("AWS Textract successful response received");
      console.log("Blocks found:", result.Blocks?.length || 0);

      // Extract text from blocks
      let extractedText = '';
      if (result.Blocks) {
        const textBlocks = result.Blocks.filter((block: any) => block.BlockType === 'LINE');
        extractedText = textBlocks.map((block: any) => block.Text).join(' ');
        console.log("Text extracted from", textBlocks.length, "LINE blocks");
      }

      console.log("✅ AWS Textract extraction completed successfully");
      console.log("Extracted text length:", extractedText.length);
      
      return extractedText;
    } catch (error) {
      console.error("❌ AWS Textract API call failed:", error);
      throw error;
    }
  }

  private async createAWSHeaders(action: string, payload: string): Promise<Record<string, string>> {
    const host = `textract.${this.region}.amazonaws.com`;
    const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = date.substr(0, 8);

    const headers = {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `Textract.${action}`,
      'X-Amz-Date': date,
      'Host': host,
      'Authorization': await this.createAuthHeader(action, payload, date, dateStamp)
    };

    return headers;
  }

  private async createAuthHeader(action: string, payload: string, date: string, dateStamp: string): Promise<string> {
    // AWS Signature Version 4 implementation
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/textract/aws4_request`;
    
    // Create canonical request
    const host = `textract.${this.region}.amazonaws.com`;
    const canonicalHeaders = `host:${host}\nx-amz-date:${date}\nx-amz-target:Textract.${action}\n`;
    const signedHeaders = 'host;x-amz-date;x-amz-target';
    const payloadHash = await this.sha256(payload);
    
    const canonicalRequest = [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    
    // Create string to sign
    const stringToSign = [
      algorithm,
      date,
      credentialScope,
      await this.sha256(canonicalRequest)
    ].join('\n');
    
    // Calculate signature
    const kDate = await this.hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = await this.hmac(kDate, this.region);
    const kService = await this.hmac(kRegion, 'textract');
    const kSigning = await this.hmac(kService, 'aws4_request');
    const signature = await this.hmac(kSigning, stringToSign, true);
    
    return `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async hmac(key: string | Uint8Array, data: string, hex: boolean = false): Promise<string | Uint8Array> {
    const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    const dataBuffer = new TextEncoder().encode(data);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
    const sigArray = new Uint8Array(signature);
    
    if (hex) {
      return Array.from(sigArray).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    return sigArray;
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