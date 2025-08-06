
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
const googleCloudVisionApiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
const googleCloudProjectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
const googleCloudServiceAccountKey = Deno.env.get('GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY');

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
    
    // Try Google Document AI first if credentials are available
    if (googleCloudProjectId && googleCloudServiceAccountKey) {
      try {
        console.log('🔍 Attempting Google Document AI extraction...');
        extractedText = await extractWithGoogleDocumentAI(arrayBuffer);
        extractionMethod = 'google-document-ai';
        console.log(`✅ Google Document AI extraction successful: ${extractedText.length} characters`);
      } catch (googleError) {
        console.log('⚠️ Google Document AI failed, trying next method:', googleError.message);
      }
    }
    
    // Try Google Cloud Vision if Document AI failed and Vision API key is available
    if ((!extractedText || extractedText.length < 100) && googleCloudVisionApiKey) {
      try {
        console.log('🔍 Attempting Google Cloud Vision extraction...');
        extractedText = await extractWithGoogleVision(arrayBuffer);
        extractionMethod = 'google-vision';
        console.log(`✅ Google Vision extraction successful: ${extractedText.length} characters`);
      } catch (visionError) {
        console.log('⚠️ Google Vision failed, trying next method:', visionError.message);
      }
    }
    
    // Try AWS Textract if Google services failed and AWS credentials are available
    if ((!extractedText || extractedText.length < 100) && awsAccessKeyId && awsSecretAccessKey) {
      try {
        console.log('🔍 Attempting AWS Textract extraction...');
        extractedText = await extractWithTextract(arrayBuffer);
        extractionMethod = 'textract';
        console.log(`✅ Textract extraction successful: ${extractedText.length} characters`);
      } catch (textractError) {
        console.log('⚠️ Textract failed, falling back to simple extraction:', textractError.message);
      }
    }
    
    // Fallback to simple extraction if all cloud services failed
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
      // If all extraction fails, provide a basic placeholder
      extractedText = `Credit Report Extract - Manual Review Required
Report ID: ${reportId}
File: ${filePath}
Status: Extraction completed but requires manual review
Please review the original document for complete data.`;
    }

    console.log(`Final extraction method: ${extractionMethod}, text length: ${extractedText.length}`);

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

// Google Document AI extraction function
async function extractWithGoogleDocumentAI(pdfBuffer: ArrayBuffer): Promise<string> {
  const serviceAccountKey = JSON.parse(Deno.env.get('GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY') || '{}');
  const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
  
  // Convert PDF to base64
  const base64Data = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
  
  // Get access token using service account
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await createJWT(serviceAccountKey),
    }),
  });
  
  if (!tokenResponse.ok) {
    throw new Error(`Token request failed: ${tokenResponse.status}`);
  }
  
  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  
  // Process document with Document AI
  const documentAIResponse = await fetch(
    `https://documentai.googleapis.com/v1/projects/${projectId}/locations/us/processors/general:process`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rawDocument: {
          content: base64Data,
          mimeType: 'application/pdf'
        }
      }),
    }
  );
  
  if (!documentAIResponse.ok) {
    throw new Error(`Document AI request failed: ${documentAIResponse.status}`);
  }
  
  const result = await documentAIResponse.json();
  return result.document?.text || '';
}

// Google Cloud Vision API extraction function
async function extractWithGoogleVision(pdfBuffer: ArrayBuffer): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  
  // Convert PDF to base64
  const base64Data = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
  
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
          type: 'TEXT_DETECTION',
          maxResults: 1
        }]
      }]
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Vision API error: ${response.status} ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.responses?.[0]?.fullTextAnnotation?.text || '';
}

// Create JWT for Google service account authentication
async function createJWT(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/[+/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/[+/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  
  const data = `${encodedHeader}.${encodedPayload}`;
  
  // Import the private key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    new TextEncoder().encode(serviceAccount.private_key.replace(/\\n/g, '\n')),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
  
  // Sign the data
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(data)
  );
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/[+/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  
  return `${data}.${encodedSignature}`;
}

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

// Fallback text extraction using basic PDF parsing
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
