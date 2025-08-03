import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportId, filePath } = await req.json();
    
    console.log('Processing PDF extraction for:', reportId, filePath);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);

    if (fileError || !fileData) {
      console.error('File download error:', fileError);
      throw new Error('Cannot download file');
    }

    // Convert to base64 for Adobe API
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    console.log('File size:', arrayBuffer.byteLength, 'bytes');

    // Call Adobe PDF Extract API
    const adobeClientId = Deno.env.get('ADOBE_CLIENT_ID');
    const adobeAccessToken = Deno.env.get('ADOBE_ACCESS_TOKEN');

    if (!adobeClientId || !adobeAccessToken) {
      console.error('Missing Adobe credentials');
      throw new Error('Adobe credentials not configured');
    }

    const adobeResponse = await fetch('https://pdf-services.adobe.io/operation/extractpdf', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adobeAccessToken}`,
        'x-api-key': adobeClientId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assetID: `report-${reportId}`,
        getCharBounds: false,
        includeStyling: false,
        elementsToExtract: ['text']
      })
    });

    if (!adobeResponse.ok) {
      console.error('Adobe API error:', adobeResponse.status);
      throw new Error('Adobe extraction failed');
    }

    const extractedData = await adobeResponse.json();
    const extractedText = extractedData?.elements?.map(el => el.Text).join(' ') || '';

    console.log('Extracted text length:', extractedText.length);

    if (!extractedText) {
      throw new Error('No text extracted from PDF');
    }

    // Save extracted text to database
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedText,
        extraction_status: 'completed',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error('Failed to save extracted text');
    }

    // Simple parsing and storage
    await parseAndStoreData(supabase, reportId, extractedText);

    console.log('PDF processing completed successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      textLength: extractedText.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Processing error:', error);
    
    // Update report with error status
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { reportId } = await req.json();
      await supabase
        .from('credit_reports')
        .update({
          extraction_status: 'failed',
          processing_errors: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function parseAndStoreData(supabase: any, reportId: string, text: string) {
  try {
    // Extract personal information
    const nameMatch = text.match(/Name[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
    const dobMatch = text.match(/Date\s+of\s+Birth[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const addressMatch = text.match(/Address[:\s]+([A-Z0-9\s,.-]+)/i);

    if (nameMatch || dobMatch || addressMatch) {
      await supabase.from('personal_information').insert({
        report_id: reportId,
        full_name: nameMatch?.[1] || null,
        date_of_birth: dobMatch?.[1] ? new Date(dobMatch[1]) : null,
        current_address: addressMatch?.[1] ? { street: addressMatch[1] } : null
      });
    }

    // Extract credit accounts
    const accountMatches = text.matchAll(/([A-Z][a-z]+\s+[A-Z][a-z]+).*?\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g);
    for (const match of accountMatches) {
      await supabase.from('credit_accounts').insert({
        report_id: reportId,
        creditor_name: match[1],
        current_balance: parseFloat(match[2].replace(/,/g, '')),
        account_status: 'open'
      });
    }

    // Extract inquiries
    const inquiryMatches = text.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:inquiry|credit)/gi);
    for (const match of inquiryMatches) {
      await supabase.from('credit_inquiries').insert({
        report_id: reportId,
        inquirer_name: match[1],
        inquiry_date: new Date(match[2])
      });
    }

    console.log('Data parsing and storage completed');
  } catch (parseError) {
    console.error('Parsing error:', parseError);
    // Don't throw - extraction was successful even if parsing fails
  }
}