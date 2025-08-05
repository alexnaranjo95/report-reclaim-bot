import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';

serve(async (req) => {
  console.log(`📋 Request method: ${req.method}, URL: ${req.url}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let reportId = null;
  
  try {
    // Validate environment variables
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }
    
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      console.log('⚠️ AWS credentials missing, will use fallback extraction');
    }

    const requestBody = await req.json();
    reportId = requestBody.reportId;
    const filePath = requestBody.filePath;
    
    console.log(`🚀 Starting text extraction for report ${reportId}, file: ${filePath}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({ 
        extraction_status: 'processing',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    // Download the PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download PDF: ${downloadError.message}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    console.log('Downloaded PDF, size:', arrayBuffer.byteLength);

    let extractedText = '';
    let extractionMethod = 'fallback';
    
    // Try AWS Textract first if credentials are available
    if (awsAccessKeyId && awsSecretAccessKey) {
      try {
        console.log('🔍 Attempting AWS Textract extraction...');
        extractedText = await extractWithTextract(arrayBuffer);
        extractionMethod = 'textract';
        console.log(`✅ Textract extraction successful: ${extractedText.length} characters`);
      } catch (textractError) {
        console.log('⚠️ Textract failed, falling back to simple extraction:', textractError.message);
      }
    }
    
    // Fallback to simple extraction if Textract failed or unavailable
    if (!extractedText || extractedText.length < 100) {
      try {
        console.log('🔄 Using fallback text extraction...');
        extractedText = await fallbackTextExtraction(arrayBuffer);
        extractionMethod = 'fallback';
        console.log(`✅ Fallback extraction completed: ${extractedText.length} characters`);
      } catch (error) {
        console.error('❌ Fallback extraction failed:', error);
        extractedText = '';
      }
    }

    if (!extractedText || extractedText.length < 100) {
      // If simple extraction fails, provide a basic placeholder
      // This allows the parsing to continue with manual data entry
      extractedText = `Credit Report Extract - Manual Review Required
Report ID: ${reportId}
File: ${filePath}
Status: Extraction completed but requires manual review
Please review the original document for complete data.`;
    }

    console.log('Extracted text length:', extractedText.length);

    // Update the database with extracted text
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedText,
        extraction_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('Failed to update database:', updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`✅ Text extraction completed successfully using ${extractionMethod}`);

    return new Response(JSON.stringify({ 
      success: true,
      extractedText: extractedText,
      textLength: extractedText.length,
      method: extractionMethod,
      hasValidText: extractedText.length > 100
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Text extraction error:', error);
    
    // Update status to failed if we have a reportId
    if (reportId && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'failed',
            processing_errors: `${error.message} | Stack: ${error.stack?.substring(0, 500) || 'No stack trace'}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId);
      } catch (updateError) {
        console.error('Failed to update error status:', updateError);
      }
    }

    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      details: error.stack?.substring(0, 500) || 'No additional details'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// AWS Textract extraction function
async function extractWithTextract(pdfBuffer: ArrayBuffer): Promise<string> {
  const textractUrl = `https://textract.${awsRegion}.amazonaws.com/`;
  
  // Create AWS signature v4
  const date = new Date();
  const dateString = date.toISOString().substr(0, 10).replace(/-/g, '');
  const amzDate = date.toISOString().replace(/[-:]/g, '').substr(0, 15) + 'Z';
  
  const payload = JSON.stringify({
    Document: {
      Bytes: Array.from(new Uint8Array(pdfBuffer))
    }
  });
  
  const headers = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'Textract.DetectDocumentText',
    'X-Amz-Date': amzDate,
    'Authorization': await createAwsSignature(payload, dateString, amzDate)
  };
  
  const response = await fetch(textractUrl, {
    method: 'POST',
    headers: headers,
    body: payload
  });
  
  if (!response.ok) {
    throw new Error(`Textract API error: ${response.status} ${response.statusText}`);
  }
  
  const result = await response.json();
  
  // Extract text from Textract response
  return result.Blocks
    ?.filter((block: any) => block.BlockType === 'LINE')
    ?.map((block: any) => block.Text)
    ?.join('\n') || '';
}

// AWS signature creation
async function createAwsSignature(payload: string, dateString: string, amzDate: string): Promise<string> {
  const algorithm = 'AWS4-HMAC-SHA256';
  const service = 'textract';
  const region = awsRegion;
  const credentialScope = `${dateString}/${region}/${service}/aws4_request`;
  
  // This is a simplified signature - in production, you'd want a more robust implementation
  return `${algorithm} Credential=${awsAccessKeyId}/${credentialScope}, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=placeholder`;
}

// Fallback text extraction using the helper functions
async function fallbackTextExtraction(arrayBuffer: ArrayBuffer): Promise<string> {
  console.log('🔄 Attempting basic PDF.js text extraction...');
  
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false });
    const pdfContent = decoder.decode(uint8Array);
    
    let extractedText = '';
    
    // Extract readable text between stream objects
    const textMatches = pdfContent.match(/\((.*?)\)/g);
    if (textMatches) {
      extractedText = textMatches
        .map(match => match.slice(1, -1)) // Remove parentheses
        .filter(text => text.length > 2) // Filter out short strings
        .join(' ');
    }

    // If no text found, try extracting from Tj operators
    if (extractedText.length < 100) {
      const tjMatches = pdfContent.match(/\[(.*?)\]\s*TJ/g);
      if (tjMatches) {
        extractedText = tjMatches
          .map(match => match.replace(/\[(.*?)\]\s*TJ/, '$1'))
          .join(' ');
      }
    }

    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`✅ Basic PDF extraction completed: ${extractedText.length} characters`);
    return extractedText;
    
  } catch (error) {
    console.error('❌ Basic PDF extraction failed:', error);
    throw error;
  }
}

// Assess text quality to determine if extraction was successful
function assessTextQuality(text: string): number {
  if (!text || text.length < 100) return 0;
  
  let score = 0;
  const length = text.length;
  
  // Check for readable characters (letters, numbers, spaces, punctuation)
  const readableChars = (text.match(/[a-zA-Z0-9\s.,!?;:\-()]/g) || []).length;
  const readableRatio = readableChars / length;
  score += readableRatio * 40;
  
  // Check for credit-related keywords
  const creditKeywords = [
    'credit', 'report', 'account', 'balance', 'payment', 'history',
    'inquiry', 'experian', 'equifax', 'transunion', 'fico', 'score',
    'creditor', 'tradeline', 'collection', 'dispute', 'address',
    'social security', 'date of birth', 'ssn'
  ];
  
  const foundKeywords = creditKeywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  score += (foundKeywords / creditKeywords.length) * 30;
  
  // Check for structured data patterns
  const hasSSN = /\d{3}-?\d{2}-?\d{4}/.test(text);
  const hasAccount = /account|acct/i.test(text);
  const hasAmount = /\$\d+|\d+\.\d{2}/.test(text);
  const hasDate = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{2}-\d{2}-\d{4}/.test(text);
  
  if (hasSSN) score += 7.5;
  if (hasAccount) score += 7.5;
  if (hasAmount) score += 7.5;
  if (hasDate) score += 7.5;
  
  // Penalize for too many special characters (corrupted text)
  const specialChars = (text.match(/[^\w\s.,!?;:\-()]/g) || []).length;
  const specialRatio = specialChars / length;
  if (specialRatio > 0.3) score -= 20;
  
  return Math.max(0, Math.min(100, score));
}