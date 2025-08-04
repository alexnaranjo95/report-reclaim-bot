import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const adobeClientId = Deno.env.get('ADOBE_CLIENT_ID');
const adobeClientSecret = Deno.env.get('ADOBE_CLIENT_SECRET');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
    console.log(`Starting Adobe PDF extraction for report ${reportId}`);

    if (!adobeClientId || !adobeClientSecret) {
      throw new Error('Adobe API credentials not configured');
    }

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({ extraction_status: 'processing' })
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

    // Get Adobe access token
    const tokenResponse = await fetch('https://ims-na1.adobelogin.com/ims/token/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'client_id': adobeClientId,
        'client_secret': adobeClientSecret,
        'grant_type': 'client_credentials',
        'scope': 'https://ims-na1.adobelogin.com/s/ent_dataservices_sdk'
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`Adobe token request failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('Adobe access token obtained');

    // Extract text using Adobe PDF Services
    const extractResponse = await fetch('https://cpf-ue1.adobe.io/ops/:create?respondWith=%7B%22reltype%22%3A%22http%3A//ns.adobe.com/rel/primary%22%7D', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': adobeClientId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        'assetID': 'urn:aaid:AS:UE1:' + crypto.randomUUID(),
        'name': 'extractpdf.in',
        'dc:format': 'application/pdf',
        'cpf:inputs': {
          'documentIn': {
            'cpf:location': 'InputFile0',
            'dc:format': 'application/pdf'
          }
        },
        'cpf:engine': {
          'repo:assetId': 'urn:aaid:cpf:Service-26c557db8b0940398f5ba7a87a85b11d'
        },
        'cpf:outputs': {
          'documentOut': {
            'cpf:location': 'multipartLabelOut',
            'dc:format': 'application/json'
          }
        }
      })
    });

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      console.error('Adobe extraction request failed:', errorText);
      throw new Error(`Adobe PDF extraction failed: ${errorText}`);
    }

    const extractData = await extractResponse.json();
    console.log('Adobe extraction completed');

    // Process the extracted text and update database
    const extractedText = extractData.elements
      ?.filter((element: any) => element.Text)
      ?.map((element: any) => element.Text)
      ?.join(' ') || '';

    if (!extractedText || extractedText.length < 100) {
      throw new Error('No readable text extracted from PDF');
    }

    console.log('Extracted text length:', extractedText.length);

    // Update the database with extracted text
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedText,
        extraction_status: 'completed'
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('Failed to update database:', updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    // Parse and store the credit data
    await parseAndStoreCreditData(supabase, reportId, extractedText);

    return new Response(JSON.stringify({ 
      success: true,
      method: 'adobe',
      textLength: extractedText.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Adobe PDF extraction error:', error);
    
    // Update status to failed
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { reportId } = await req.json().catch(() => ({ reportId: null }));
      
      if (reportId) {
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'failed',
            processing_errors: error.message
          })
          .eq('id', reportId);
      }
    }

    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function parseAndStoreCreditData(supabase: any, reportId: string, text: string) {
  try {
    console.log('Parsing credit data for report:', reportId);

    // Extract personal information
    const personalInfo = extractPersonalInfo(text);
    if (personalInfo) {
      await supabase.from('personal_information').upsert({
        report_id: reportId,
        ...personalInfo
      });
    }

    // Extract credit accounts
    const accounts = extractCreditAccounts(text);
    for (const account of accounts) {
      await supabase.from('credit_accounts').upsert({
        report_id: reportId,
        ...account
      });
    }

    // Extract credit inquiries
    const inquiries = extractCreditInquiries(text);
    for (const inquiry of inquiries) {
      await supabase.from('credit_inquiries').upsert({
        report_id: reportId,
        ...inquiry
      });
    }

    // Extract negative items
    const negativeItems = extractNegativeItems(text);
    for (const item of negativeItems) {
      await supabase.from('negative_items').upsert({
        report_id: reportId,
        ...item
      });
    }

    console.log('Credit data parsing completed');
  } catch (error) {
    console.error('Error parsing credit data:', error);
    throw error;
  }
}

function extractPersonalInfo(text: string) {
  const nameMatch = text.match(/(?:Name|Consumer):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  const dobMatch = text.match(/(?:Date of Birth|DOB|Born):\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const ssnMatch = text.match(/(?:SSN|Social Security):\s*(\*{3}-\*{2}-\d{4}|\d{3}-\d{2}-\d{4})/i);
  
  const addressMatch = text.match(/(?:Address|Residence):\s*([^,\n]+(?:,\s*[^,\n]+)*)/i);

  return {
    full_name: nameMatch?.[1] || null,
    date_of_birth: dobMatch?.[1] ? formatDate(dobMatch[1]) : null,
    ssn_partial: ssnMatch?.[1] || null,
    current_address: addressMatch?.[1] ? { street: addressMatch[1] } : null
  };
}

function extractCreditAccounts(text: string): any[] {
  const accounts = [];
  const accountPattern = /(?:Account|Acct):\s*([^\n]+)[\s\S]*?(?:Creditor|Company):\s*([^\n]+)/gi;
  
  let match;
  while ((match = accountPattern.exec(text)) !== null) {
    accounts.push({
      account_number: match[1]?.trim(),
      creditor_name: match[2]?.trim(),
      account_type: determineAccountType(match[2]?.trim() || ''),
      current_balance: 0,
      account_status: 'unknown'
    });
  }
  
  return accounts;
}

function extractCreditInquiries(text: string): any[] {
  const inquiries = [];
  const inquiryPattern = /(?:Inquiry|Request).*?([A-Z][A-Z\s&]+).*?(\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
  
  let match;
  while ((match = inquiryPattern.exec(text)) !== null) {
    inquiries.push({
      inquirer_name: match[1]?.trim(),
      inquiry_date: formatDate(match[2]),
      inquiry_type: 'hard'
    });
  }
  
  return inquiries;
}

function extractNegativeItems(text: string): any[] {
  const negativeItems = [];
  const negativeKeywords = [
    'late payment', 'collection', 'charge off', 'bankruptcy',
    'repossession', 'foreclosure', 'past due'
  ];
  
  for (const keyword of negativeKeywords) {
    const regex = new RegExp(`(.*?${keyword}.*?)(?=\\n|$)`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      negativeItems.push({
        negative_type: keyword,
        description: match[1]?.trim(),
        severity_score: keyword.includes('bankruptcy') ? 10 : 
                      keyword.includes('charge off') ? 8 : 6
      });
    }
  }
  
  return negativeItems;
}

function determineAccountType(creditorName: string): string {
  const name = creditorName.toLowerCase();
  if (name.includes('card') || name.includes('visa') || name.includes('mastercard')) return 'credit_card';
  if (name.includes('mortgage') || name.includes('home') || name.includes('real estate')) return 'mortgage';
  if (name.includes('auto') || name.includes('car') || name.includes('vehicle')) return 'auto_loan';
  if (name.includes('student') || name.includes('education')) return 'student_loan';
  return 'other';
}

function formatDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}