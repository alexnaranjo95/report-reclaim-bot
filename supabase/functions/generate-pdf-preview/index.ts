import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Generating PDF preview');
    
    const { html, templateId, fileName, documentSettings, adminFiles, adminDocs } = await req.json();
    
    if (!html) {
      return new Response(
        JSON.stringify({ error: 'HTML content is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Build document appendages if settings are provided
    let documentAppendages = '';
    
    if (documentSettings && (documentSettings.includeGovId || documentSettings.includeProofOfAddress || documentSettings.includeSSN)) {
      documentAppendages = `
        <div style="page-break-before: always; padding-top: 0;">
          <h3 style="text-align: center; margin-bottom: 30px; border-bottom: 1px solid #ccc; padding-bottom: 10px;">
            Attached Documents
          </h3>
      `;
      
      // Create document map for easy lookup
      const docsMap = (adminDocs || []).reduce((acc, doc) => {
        acc[doc.category] = doc;
        return acc;
      }, {});

      if (documentSettings.includeGovId) {
        const govDoc = docsMap['gov_id'];
        documentAppendages += `
          <div style="margin-bottom: 40px;">
            <h4 style="margin-bottom: 15px;">Government Identification</h4>
            <div style="border: 1px solid #ccc; padding: 20px; text-align: center; background: #fff;">
              ${govDoc ? `
                <img src="${govDoc.file_url}" 
                     alt="Government ID" 
                     style="${govDoc.edited_width ? `width: ${govDoc.edited_width}px; height: ${govDoc.edited_height}px;` : 'max-width: 100%; max-height: 400px;'} object-fit: contain; display: block; margin: 0 auto;" />
                <p style="margin-top: 10px; font-size: 10pt; color: #666;">${govDoc.file_name}</p>
              ` : `
                <p><strong>Government ID Document</strong></p>
                <p style="color: #666; font-size: 11pt;">Driver's License, State ID, or Passport will be attached here</p>
              `}
            </div>
          </div>
        `;
      }
      
      if (documentSettings.includeProofOfAddress) {
        const addressDoc = docsMap['proof_of_address'];
        documentAppendages += `
          <div style="margin-bottom: 40px;">
            <h4 style="margin-bottom: 15px;">Proof of Address</h4>
            <div style="border: 1px solid #ccc; padding: 20px; text-align: center; background: #fff;">
              ${addressDoc ? `
                <img src="${addressDoc.file_url}" 
                     alt="Proof of Address" 
                     style="${addressDoc.edited_width ? `width: ${addressDoc.edited_width}px; height: ${addressDoc.edited_height}px;` : 'max-width: 100%; max-height: 400px;'} object-fit: contain; display: block; margin: 0 auto;" />
                <p style="margin-top: 10px; font-size: 10pt; color: #666;">${addressDoc.file_name}</p>
              ` : `
                <p><strong>Address Verification Document</strong></p>
                <p style="color: #666; font-size: 11pt;">Utility Bill, Bank Statement, or Lease Agreement will be attached here</p>
              `}
            </div>
          </div>
        `;
      }
      
      if (documentSettings.includeSSN) {
        const ssnDoc = docsMap['ssn'];
        documentAppendages += `
          <div style="margin-bottom: 40px;">
            <h4 style="margin-bottom: 15px;">Social Security Verification</h4>
            <div style="border: 1px solid #ccc; padding: 20px; text-align: center; background: #fff;">
              ${ssnDoc ? `
                <img src="${ssnDoc.file_url}" 
                     alt="Social Security Number" 
                     style="${ssnDoc.edited_width ? `width: ${ssnDoc.edited_width}px; height: ${ssnDoc.edited_height}px;` : 'max-width: 100%; max-height: 400px;'} object-fit: contain; display: block; margin: 0 auto;" />
                <p style="margin-top: 10px; font-size: 10pt; color: #666;">${ssnDoc.file_name}</p>
              ` : `
                <p><strong>Social Security Number Document</strong></p>
                <p style="color: #666; font-size: 11pt;">SSN Card, W-2, or Tax Document will be attached here</p>
              `}
            </div>
          </div>
        `;
      }
      
      documentAppendages += '</div>';
    }

    // Create a complete HTML document with PostGrid-compatible styling
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            @page {
              size: 8.5in 11in;
              margin: 1in;
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #000;
              background: #fff;
              margin: 0;
              padding: 0;
            }
            .header {
              margin-bottom: 20px;
            }
            .date {
              text-align: right;
              margin-bottom: 10px;
            }
            .round-info {
              text-align: right;
              font-weight: bold;
            }
            .body {
              margin: 20px 0;
            }
            .footer {
              margin-top: 30px;
            }
            p {
              margin: 10px 0;
            }
            h1, h2, h3, h4, h5, h6 {
              font-weight: bold;
              margin: 15px 0 10px 0;
            }
          </style>
        </head>
        <body>
          ${html}
          ${documentAppendages}
        </body>
      </html>
    `;

    console.log('HTML prepared for PDF generation');

    // For now, we'll return the HTML and let the client handle PDF generation
    // In a production environment, you might want to use a service like Puppeteer
    const pdfFileName = fileName || `template-preview-${Date.now()}.html`;
    
    console.log('PDF preview generated successfully');

    return new Response(
      JSON.stringify({ 
        html: fullHtml,
        success: true 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in generate-pdf-preview function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});