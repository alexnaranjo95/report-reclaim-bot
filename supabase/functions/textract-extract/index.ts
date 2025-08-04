import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { TextractClient, DetectDocumentTextCommand } from 'https://esm.sh/@aws-sdk/client-textract@3.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  console.log("=== AMAZON TEXTRACT FUNCTION START ===");
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

    // Validate AWS credentials
    console.log("=== VALIDATING AWS CREDENTIALS ===");
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';
    
    console.log("AWS Access Key ID exists:", !!awsAccessKeyId);
    console.log("AWS Secret Access Key exists:", !!awsSecretAccessKey);
    console.log("AWS Region:", awsRegion);

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error('Missing AWS credentials: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set');
    }

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

    // Initialize AWS Textract client
    console.log("=== INITIALIZING AWS TEXTRACT CLIENT ===");
    const textractClient = new TextractClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

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

    // Convert to base64 for AWS Textract
    console.log("=== CONVERTING TO BASE64 ===");
    const base64String = btoa(String.fromCharCode(...bytes));
    console.log("Base64 conversion completed, length:", base64String.length);

    // Call Amazon Textract
    console.log("=== CALLING AMAZON TEXTRACT ===");
    const textractCommand = new DetectDocumentTextCommand({
      Document: {
        Bytes: bytes,
      },
    });

    console.log("Sending request to AWS Textract...");
    const textractResponse = await textractClient.send(textractCommand);
    console.log("✅ AWS Textract response received");

    if (!textractResponse.Blocks) {
      throw new Error("No text blocks found in Textract response");
    }

    // Extract text from Textract response
    console.log("=== EXTRACTING TEXT FROM TEXTRACT RESPONSE ===");
    const textBlocks = textractResponse.Blocks.filter(block => block.BlockType === 'LINE');
    console.log(`Found ${textBlocks.length} text lines`);

    let extractedText = '';
    for (const block of textBlocks) {
      if (block.Text) {
        extractedText += block.Text + ' ';
      }
    }

    extractedText = extractedText.trim();
    console.log("Text extraction completed, length:", extractedText.length);
    console.log("Text preview:", extractedText.substring(0, 300));

    if (extractedText.length < 50) {
      throw new Error("Insufficient text extracted from PDF via Textract");
    }

    // Enhanced validation with better error messages
    console.log("=== VALIDATING EXTRACTED TEXT ===");
    
    // Check for PDF metadata patterns that indicate we only got metadata
    const metadataPatterns = [
      /^PDF-\d+\.\d+/i,
      /^%PDF-\d+\.\d+/i,
      /^\/Type\s+\/Catalog/i,
      /^\/Pages\s+\d+\s+\d+\s+R/i,
      /^\/Kids\s+\[/i,
      /^\/Count\s+\d+/i,
      /^\/MediaBox\s+\[/i,
      /^\/Font\s+\//i,
      /^\/ProcSet\s+\[/i,
      /^\/Resources\s+<<\s*\/Font\s+<<\s*\/F\d+\s+\d+\s+\d+\s+R\s*>>\s*>>/i
    ];
    
    const isOnlyMetadata = metadataPatterns.some(pattern => pattern.test(extractedText));
    
    if (isOnlyMetadata) {
      console.error("❌ Only PDF metadata detected, no actual content");
      console.log("Metadata sample:", extractedText.substring(0, 500));
      throw new Error("Extracted text contains no valid credit report data - only PDF metadata detected. This PDF may be a scanned image or have complex formatting. Please try uploading a text-based PDF from Experian, Equifax, or TransUnion.");
    }
    
    // Check for credit report keywords (more flexible)
    const creditKeywords = [
      'credit', 'account', 'balance', 'payment', 'inquiry', 'collection',
      'name', 'address', 'phone', 'date', 'birth', 'social', 'security',
      'experian', 'equifax', 'transunion', 'fico', 'score', 'visa', 'mastercard',
      'chase', 'capital', 'wells', 'bank', 'mortgage', 'loan', 'consumer',
      'report', 'bureau', 'agency', 'creditor', 'debt', 'amount', 'limit'
    ];
    
    const lowerText = extractedText.toLowerCase();
    const foundKeywords = creditKeywords.filter(keyword => lowerText.includes(keyword));
    const keywordCount = foundKeywords.length;
    
    console.log(`Found ${keywordCount} credit-related keywords:`, foundKeywords.slice(0, 10));
    
    // More flexible validation - allow some text even if not all keywords are present
    if (keywordCount === 0) {
      // Check if we have any readable text that might be credit-related
      const hasReadableText = /[A-Za-z]{3,}/.test(extractedText);
      const hasNumbers = /\d+/.test(extractedText);
      const hasDollarSigns = /\$/.test(extractedText);
      
      if (hasReadableText && (hasNumbers || hasDollarSigns)) {
        console.warn("⚠️ No credit keywords found, but text appears readable. Proceeding with caution.");
        console.log("Text sample:", extractedText.substring(0, 500));
      } else {
        console.error("❌ No readable credit report content detected");
        console.log("Extracted text sample:", extractedText.substring(0, 500));
        throw new Error("Extracted text does not appear to be from a credit report. Please ensure you are uploading a valid credit report PDF from Experian, Equifax, or TransUnion.");
      }
    } else if (keywordCount < 3) {
      console.warn("⚠️ Few credit keywords found, but proceeding with extraction");
      console.log("Found keywords:", foundKeywords);
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
        message: 'PDF processed successfully with Amazon Textract',
        textLength: extractedText.length,
        textractBlocks: textBlocks.length,
        keywordCount: keywordCount,
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