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

    if (extractedText.length < 100) {
      throw new Error("Insufficient text extracted from PDF via Textract");
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
        message: 'PDF processed successfully with Amazon Textract',
        textLength: extractedText.length,
        textractBlocks: textBlocks.length,
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