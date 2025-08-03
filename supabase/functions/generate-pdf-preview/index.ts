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
    
    const { html, templateId, fileName } = await req.json();
    
    if (!html) {
      return new Response(
        JSON.stringify({ error: 'HTML content is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
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
        </body>
      </html>
    `;

    console.log('HTML prepared for PDF generation');

    // For now, we'll return the HTML and let the client handle PDF generation
    // In a production environment, you might want to use a service like Puppeteer
    const pdfFileName = fileName || `template-preview-${Date.now()}.html`;
    
    // Store the preview HTML in Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('verification-documents')
      .upload(`pdf-previews/${pdfFileName}`, new Blob([fullHtml], { type: 'text/html' }), {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading preview:', uploadError);
      throw uploadError;
    }

    // Get signed URL for the preview
    const { data: signedUrlData } = await supabase.storage
      .from('verification-documents')
      .createSignedUrl(`pdf-previews/${pdfFileName}`, 3600);

    console.log('PDF preview generated successfully');

    // Update template with preview URL if templateId provided
    if (templateId && signedUrlData?.signedUrl) {
      await supabase
        .from('template_layouts')
        .update({ preview_pdf_url: signedUrlData.signedUrl })
        .eq('id', templateId);
    }

    return new Response(
      JSON.stringify({ 
        preview_url: signedUrlData?.signedUrl,
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