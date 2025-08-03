import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const adobeClientId = Deno.env.get('ADOBE_CLIENT_ID')!;
const adobeClientSecret = Deno.env.get('ADOBE_CLIENT_SECRET')!;

// Cache for access token
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportId, filePath } = await req.json();
    
    if (!reportId || !filePath) {
      return new Response(
        JSON.stringify({ error: 'Missing reportId or filePath' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting Adobe PDF extraction for:', reportId);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({ extraction_status: 'processing' })
      .eq('id', reportId);

    // Get signed URL for the file
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('credit-reports')
      .createSignedUrl(filePath, 3600);

    if (urlError) throw urlError;

    // Download file content
    const fileResponse = await fetch(signedUrlData.signedUrl);
    const fileBlob = await fileResponse.blob();
    const fileArrayBuffer = await fileBlob.arrayBuffer();

    // Get access token using client credentials
    const accessToken = await getAccessToken();

    // Step 1: Create Asset
    console.log('Creating Adobe asset...');
    const assetData = await createAsset(accessToken);
    
    // Step 2: Upload PDF to Adobe
    console.log('Uploading PDF to Adobe...');
    await uploadPdfToAdobe(assetData.uploadUri, fileArrayBuffer);
    
    // Step 3: Extract Text
    console.log('Starting text extraction...');
    const extractJobLocation = await startExtraction(accessToken, assetData.assetID);
    
    // Step 4: Poll for completion and get results
    console.log('Polling for extraction completion...');
    const extractedText = await pollExtractionJob(extractJobLocation, accessToken);

    // Update database with extracted text
    await supabase
      .from('credit_reports')
      .update({ 
        raw_text: extractedText,
        extraction_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    console.log('PDF extraction completed successfully. Text length:', extractedText.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        extractedText: extractedText.substring(0, 500) + '...' // Preview only
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Adobe PDF extraction error:', error);
    
    // Parse specific error messages
    let errorMessage = error.message;
    if (error.message.includes('401')) {
      errorMessage = 'Adobe authentication failed. Please check API credentials.';
    } else if (error.message.includes('429')) {
      errorMessage = 'Service temporarily unavailable. Please try later.';
    } else if (error.message.includes('corrupted') || error.message.includes('invalid')) {
      errorMessage = 'Unable to read PDF. Please upload a different file.';
    }

    // Update status to failed
    try {
      const { reportId } = await req.json().catch(() => ({}));
      if (reportId) {
        await supabase
          .from('credit_reports')
          .update({ 
            extraction_status: 'failed',
            processing_errors: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId);
      }
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Step 1: Get Access Token using OAuth client credentials
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  console.log('Getting new Adobe access token...');
  
  const tokenResponse = await fetch('https://ims-na1.adobelogin.com/ims/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'client_id': adobeClientId,
      'client_secret': adobeClientSecret,
      'grant_type': 'client_credentials',
      'scope': 'openid,AdobeID,read_organizations,additional_info.projectedProductContext,additional_info.roles'
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Adobe OAuth failed: ${tokenResponse.status} - ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  
  // Cache the token (expires in 24 hours minus 5 minutes for safety)
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = Date.now() + ((tokenData.expires_in || 86400) - 300) * 1000;
  
  console.log('Adobe access token obtained successfully');
  return cachedAccessToken;
}

// Step 2: Create Asset
async function createAsset(accessToken: string): Promise<{ assetID: string; uploadUri: string }> {
  const response = await fetch('https://pdf-services.adobe.io/assets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': adobeClientId,
    },
    body: JSON.stringify({
      mediaType: 'application/pdf'
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Adobe asset: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    assetID: data.assetID,
    uploadUri: data.uploadUri
  };
}

// Step 3: Upload PDF to Adobe
async function uploadPdfToAdobe(uploadUri: string, fileBuffer: ArrayBuffer): Promise<void> {
  const response = await fetch(uploadUri, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload PDF to Adobe: ${response.status}`);
  }
}

// Step 4: Start Extraction Job
async function startExtraction(accessToken: string, assetID: string): Promise<string> {
  const response = await fetch('https://pdf-services.adobe.io/operation/extractpdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': adobeClientId,
    },
    body: JSON.stringify({
      assetID: assetID,
      elementsToExtract: ['text', 'tables'],
      tableOutputFormat: 'csv',
      includeStyling: true,
      renditionsToExtract: ['tables']
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start Adobe extraction: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.location; // Job status URL
}

// Step 5: Poll for completion and get results
async function pollExtractionJob(jobUrl: string, accessToken: string): Promise<string> {
  let attempts = 0;
  const maxAttempts = 30; // 5 minutes with 10-second intervals
  
  while (attempts < maxAttempts) {
    // Add 2-second delay between API calls for rate limiting
    if (attempts > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const statusResponse = await fetch(jobUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': adobeClientId,
      },
    });

    if (!statusResponse.ok) {
      throw new Error(`Failed to check job status: ${statusResponse.status}`);
    }

    const statusData = await statusResponse.json();
    console.log(`Extraction job status: ${statusData.status} (attempt ${attempts + 1})`);
    
    if (statusData.status === 'done') {
      // Download the extraction results
      const resultResponse = await fetch(statusData.asset.downloadUri);
      if (!resultResponse.ok) {
        throw new Error(`Failed to download extraction results: ${resultResponse.status}`);
      }
      
      const resultData = await resultResponse.json();
      
      // Extract and combine all text elements while preserving structure
      let extractedText = '';
      if (resultData.elements) {
        const textElements = resultData.elements
          .filter((element: any) => element.Text)
          .map((element: any) => {
            // Include font info for structure recognition
            const text = element.Text;
            const fontSize = element.Font?.size || 0;
            const isBold = element.Font?.weight === 'bold' || element.Font?.weight > 600;
            
            // Add line breaks for headers (larger font or bold text)
            if (fontSize > 12 || isBold) {
              return `\n\n${text}\n`;
            }
            return text;
          });
        
        extractedText = textElements.join(' ')
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/\n\s+/g, '\n') // Clean up line breaks
          .trim();
      }
      
      // Also include table data if available
      if (resultData.tables && resultData.tables.length > 0) {
        extractedText += '\n\nTABLES:\n';
        resultData.tables.forEach((table: any, index: number) => {
          extractedText += `\nTable ${index + 1}:\n${table.csvData || 'No table data'}\n`;
        });
      }
      
      if (!extractedText || extractedText.length < 10) {
        throw new Error('No meaningful text extracted from PDF. The file may be corrupted or image-based.');
      }
      
      console.log(`Successfully extracted ${extractedText.length} characters of text`);
      return extractedText;
      
    } else if (statusData.status === 'failed') {
      const errorMsg = statusData.error?.message || 'Unknown extraction error';
      throw new Error(`Adobe extraction job failed: ${errorMsg}`);
    } else if (statusData.status === 'in_progress') {
      // Continue polling
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    } else {
      throw new Error(`Unexpected job status: ${statusData.status}`);
    }
  }
  
  throw new Error('Adobe extraction job timed out after 5 minutes');
}