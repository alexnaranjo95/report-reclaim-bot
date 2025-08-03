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
const adobeAccessToken = Deno.env.get('ADOBE_ACCESS_TOKEN')!;

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

    // Create extraction job with Adobe PDF Services API
    const extractResponse = await fetch('https://pdf-services.adobe.io/operation/extractpdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adobeAccessToken}`,
        'x-api-key': adobeClientId,
      },
      body: JSON.stringify({
        assetID: await uploadToAdobe(fileArrayBuffer, adobeAccessToken, adobeClientId),
        elementsToExtract: ['text'],
        elementsToExtractRenditions: ['tables'],
      }),
    });

    if (!extractResponse.ok) {
      throw new Error(`Adobe API error: ${extractResponse.status}`);
    }

    const extractData = await extractResponse.json();
    console.log('Adobe extraction job created:', extractData);

    // Poll for completion
    const extractedText = await pollExtractionJob(extractData.location, adobeAccessToken, adobeClientId);

    // Update database with extracted text
    await supabase
      .from('credit_reports')
      .update({ 
        raw_text: extractedText,
        extraction_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    console.log('PDF extraction completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        extractedText: extractedText.substring(0, 500) + '...' // Preview only
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Adobe PDF extraction error:', error);
    
    // Update status to failed
    const { reportId } = await req.json().catch(() => ({}));
    if (reportId) {
      await supabase
        .from('credit_reports')
        .update({ 
          extraction_status: 'failed',
          processing_errors: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function uploadToAdobe(fileBuffer: ArrayBuffer, accessToken: string, clientId: string): Promise<string> {
  const uploadResponse = await fetch('https://pdf-services.adobe.io/assets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': clientId,
    },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload to Adobe: ${uploadResponse.status}`);
  }

  const uploadData = await uploadResponse.json();
  return uploadData.assetID;
}

async function pollExtractionJob(jobUrl: string, accessToken: string, clientId: string): Promise<string> {
  let attempts = 0;
  const maxAttempts = 30; // 5 minutes with 10-second intervals
  
  while (attempts < maxAttempts) {
    const statusResponse = await fetch(jobUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': clientId,
      },
    });

    const statusData = await statusResponse.json();
    
    if (statusData.status === 'done') {
      // Download the result
      const resultResponse = await fetch(statusData.asset.downloadUri);
      const resultData = await resultResponse.json();
      
      // Extract text from the JSON structure
      let extractedText = '';
      if (resultData.elements) {
        extractedText = resultData.elements
          .filter((element: any) => element.Text)
          .map((element: any) => element.Text)
          .join(' ');
      }
      
      return extractedText;
    } else if (statusData.status === 'failed') {
      throw new Error('Adobe extraction job failed');
    }
    
    // Wait 10 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 10000));
    attempts++;
  }
  
  throw new Error('Adobe extraction job timed out');
}