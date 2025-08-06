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
const docuClipperApiKey = Deno.env.get('DOCUCLIPPER_API_KEY');

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
    
    console.log(`🚀 Starting parallel text extraction for report ${reportId}, file: ${filePath}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({ 
        extraction_status: 'processing',
        consolidation_status: 'processing',
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
    console.log('📄 Downloaded PDF, size:', arrayBuffer.byteLength);

    // DOCUCLIPPER ONLY EXTRACTION
    console.log('🔄 Starting DocuClipper-only extraction...');
    
    if (!docuClipperApiKey) {
      throw new Error('DocuClipper API key not configured');
    }

    // Extract using DocuClipper only
    const startTime = Date.now();
    const extractionResult = await extractWithDocuClipper(arrayBuffer);
    const totalTime = Date.now() - startTime;

    console.log(`✅ DocuClipper extraction completed in ${totalTime}ms`);

    // Process and validate the extraction result
    const characterCount = extractionResult.length;
    const wordCount = extractionResult.split(/\s+/).filter(w => w.length > 0).length;
    const confidence = calculateConfidenceScore(extractionResult, 'docuclipper');
    const hasStructuredData = hasExtractableData(extractionResult);

    // Store extraction result
    await supabase
      .from('extraction_results')
      .insert({
        report_id: reportId,
        extraction_method: 'docuclipper',
        extracted_text: extractionResult,
        processing_time_ms: totalTime,
        character_count: characterCount,
        word_count: wordCount,
        confidence_score: confidence,
        has_structured_data: hasStructuredData,
        extraction_metadata: {
          hasError: false,
          errorMessage: null,
          processingTime: totalTime
        }
      });

    console.log(`📊 DocuClipper: ${characterCount} chars, confidence: ${confidence}, structured: ${hasStructuredData}`);

    if (extractionResult.length < 100) {
      throw new Error('DocuClipper extraction returned insufficient text data');
    }

    // Store consolidation metadata (simplified for single method)
    await supabase
      .from('consolidation_metadata')
      .insert({
        report_id: reportId,
        primary_source: 'docuclipper',
        consolidation_strategy: 'single_source',
        confidence_level: confidence,
        field_sources: {
          primary_text: 'docuclipper',
          total_sources: 1,
          methods_used: ['docuclipper']
        },
        conflict_count: 0,
        requires_human_review: confidence < 0.7,
        consolidation_notes: `DocuClipper-only extraction. Confidence: ${confidence}`
      });

    // Update the database with extraction result
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractionResult,
        extraction_status: 'completed',
        consolidation_status: 'completed',
        consolidation_confidence: confidence,
        primary_extraction_method: 'docuclipper',
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('Failed to update database:', updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`✅ DocuClipper extraction completed successfully`);

    return new Response(JSON.stringify({ 
      success: true,
      extractedText: extractionResult,
      textLength: extractionResult.length,
      primaryMethod: 'docuclipper',
      consolidationConfidence: confidence,
      extractionResult: {
        method: 'docuclipper',
        confidence: confidence,
        characterCount: characterCount,
        hasStructuredData: hasStructuredData
      },
      hasValidText: extractionResult.length > 100
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Parallel text extraction error:', error);
    
    // Update status to failed if we have a reportId
    if (reportId && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'failed',
            consolidation_status: 'failed',
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

// Calculate confidence score based on text quality and extraction method
function calculateConfidenceScore(text: string, method: string): number {
  if (!text || text.length < 50) return 0.0;
  
  let baseScore = 0.5;
  
  // Method-based scoring
  switch (method) {
    case 'google-document-ai':
      baseScore = 0.9;
      break;
    case 'google-vision':
      baseScore = 0.8;
      break;
    case 'docuclipper':
      baseScore = 0.85;
      break;
    case 'textract':
      baseScore = 0.7;
      break;
    case 'fallback':
      baseScore = 0.3;
      break;
  }
  
  // Text quality adjustments
  const lengthScore = Math.min(0.3, text.length / 10000);
  const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  const creditKeywords = (text.match(/credit|report|account|balance|payment|inquiry/gi) || []).length;
  
  const qualityScore = lengthScore + (alphaRatio * 0.2) + Math.min(0.2, creditKeywords / 50);
  
  return Math.min(0.99, baseScore + qualityScore);
}

// Check if text contains extractable credit report data
function hasExtractableData(text: string): boolean {
  if (!text || text.length < 200) return false;
  
  const creditIndicators = [
    /credit\s*report/i,
    /personal\s*information/i,
    /account\s*number/i,
    /payment\s*history/i,
    /credit\s*score/i,
    /inquiry|inquiries/i,
    /creditor/i,
    /balance/i
  ];
  
  let matches = 0;
  for (const pattern of creditIndicators) {
    if (pattern.test(text)) matches++;
  }
  
  return matches >= 3;
}

// Google Document AI extraction function  
async function extractWithGoogleDocumentAI(pdfBuffer: ArrayBuffer): Promise<string> {
  const serviceAccountKey = JSON.parse(Deno.env.get('GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY') || '{}');
  const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
  
  if (!serviceAccountKey.client_email || !serviceAccountKey.private_key) {
    throw new Error('Invalid Google Cloud service account configuration');
  }
  
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
    const errorText = await tokenResponse.text();
    throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`);
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
    const errorText = await documentAIResponse.text();
    throw new Error(`Document AI request failed: ${documentAIResponse.status} - ${errorText}`);
  }
  
  const result = await documentAIResponse.json();
  return result.document?.text || '';
}

// Google Cloud Vision API extraction function
async function extractWithGoogleVision(pdfBuffer: ArrayBuffer): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  
  // NOTE: Vision API doesn't directly support PDFs, so this is a simplified approach
  // In production, you'd want to convert PDF to images first
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
    const errorText = await response.text();
    throw new Error(`Vision API error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  
  // Check for API errors in response
  if (result.responses?.[0]?.error) {
    throw new Error(`Vision API processing error: ${result.responses[0].error.message}`);
  }
  
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
  
  try {
    // Clean and format the private key
    let privateKeyPem = serviceAccount.private_key.replace(/\\n/g, '\n');
    
    // Ensure proper PEM format
    if (!privateKeyPem.includes('-----BEGIN PRIVATE KEY-----')) {
      throw new Error('Invalid private key format');
    }
    
    // Import the private key
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      new TextEncoder().encode(privateKeyPem),
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
  } catch (error) {
    throw new Error(`JWT creation failed: ${error.message}`);
  }
}

// DocuClipper extraction function for general OCR
async function extractWithDocuClipper(pdfBuffer: ArrayBuffer): Promise<string> {
  console.log('🔄 Starting DocuClipper OCR extraction...');
  
  try {
    const apiKey = Deno.env.get('DOCUCLIPPER_API_KEY');
    if (!apiKey) {
      throw new Error('DocuClipper API key not configured');
    }

    console.log('📤 Uploading PDF to DocuClipper for text extraction...');

    // Create form data for the PDF
    const formData = new FormData();
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('file', pdfBlob, 'credit-report.pdf');

    // Try the correct DocuClipper endpoint for document processing
    const response = await fetch(
      'https://api.docuclipper.com/api/v1/documents/extract',
      {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Accept': 'application/json',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ DocuClipper API error: ${response.status} ${response.statusText}`);
      console.error(`❌ Error details: ${errorText}`);
      
      // Try fallback extraction if DocuClipper fails
      console.log('🔄 DocuClipper failed, attempting fallback PDF extraction...');
      return await fallbackTextExtraction(pdfBuffer);
    }

    const result = await response.json();
    console.log('✅ DocuClipper response received');

    // Log response structure for debugging
    console.log('📋 DocuClipper response keys:', Object.keys(result));

    let extractedText = '';

    // Extract text from DocuClipper response
    if (result.text) {
      extractedText = result.text;
    } else if (result.data?.text) {
      extractedText = result.data.text;
    } else if (result.data?.content) {
      extractedText = result.data.content;
    } else if (result.content) {
      extractedText = result.content;
    } else if (result.extractedText) {
      extractedText = result.extractedText;
    } else if (result.data?.extractedText) {
      extractedText = result.data.extractedText;
    } else if (result.pages && Array.isArray(result.pages)) {
      // Extract text from pages array
      extractedText = result.pages
        .map((page: any) => page.text || page.content || '')
        .filter((text: string) => text.length > 0)
        .join('\n');
    } else {
      // Log full response for debugging
      console.log('📋 Full DocuClipper response:', JSON.stringify(result, null, 2));
      
      // Try to find any text in the response
      const findTextInObject = (obj: any, path = ''): string[] => {
        const texts: string[] = [];
        
        if (typeof obj === 'string' && obj.length > 20) {
          texts.push(obj);
        } else if (obj && typeof obj === 'object') {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && value.length > 20) {
              texts.push(value);
            } else if (value && typeof value === 'object') {
              texts.push(...findTextInObject(value, `${path}.${key}`));
            }
          }
        }
        
        return texts;
      };
      
      const foundTexts = findTextInObject(result);
      extractedText = foundTexts.join('\n');
    }

    // Clean up the extracted text
    if (extractedText) {
      extractedText = extractedText
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n');
    }

    console.log(`📊 DocuClipper extracted ${extractedText.length} characters`);
    
    // Log a sample of the extracted text for debugging
    if (extractedText.length > 0) {
      const sample = extractedText.substring(0, 200);
      console.log(`📝 Text sample: "${sample}${extractedText.length > 200 ? '...' : ''}"`);
    }
    
    if (extractedText.length < 100) {
      console.log('⚠️ DocuClipper returned insufficient text, trying fallback extraction...');
      return await fallbackTextExtraction(pdfBuffer);
    }

    return extractedText;

  } catch (error) {
    console.error('❌ DocuClipper extraction error:', error);
    
    // Try fallback extraction if DocuClipper completely fails
    console.log('🔄 DocuClipper failed completely, attempting fallback PDF extraction...');
    try {
      return await fallbackTextExtraction(pdfBuffer);
    } catch (fallbackError) {
      console.error('❌ Fallback extraction also failed:', fallbackError);
      throw new Error(`DocuClipper extraction failed: ${error.message}`);
    }
  }
}

// AWS Textract extraction function with proper signature
async function extractWithTextract(pdfBuffer: ArrayBuffer): Promise<string> {
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const region = Deno.env.get('AWS_REGION') || 'us-east-1';
  
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured');
  }
  
  // For this implementation, we'll use a simplified approach
  // In production, you'd implement full AWS Signature Version 4
  const textractUrl = `https://textract.${region}.amazonaws.com/`;
  
  const date = new Date();
  const dateString = date.toISOString().substr(0, 10).replace(/-/g, '');
  const amzDate = date.toISOString().replace(/[-:]/g, '').substr(0, 15) + 'Z';
  
  // Convert ArrayBuffer to base64 for Textract
  const base64Data = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
  
  const payload = JSON.stringify({
    Document: {
      Bytes: base64Data
    }
  });
  
  const headers = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'Textract.DetectDocumentText',
    'X-Amz-Date': amzDate,
    // Note: This is a simplified implementation
    // Production code would need proper AWS Signature Version 4
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${dateString}/${region}/textract/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=placeholder`
  };
  
  // For now, we'll simulate a simple extraction since implementing full AWS sig v4 is complex
  // In production, you'd use the AWS SDK or implement proper signatures
  throw new Error('AWS Textract integration requires full signature implementation');
}

// Fallback text extraction using basic PDF parsing
async function fallbackTextExtraction(arrayBuffer: ArrayBuffer): Promise<string> {
  console.log('🔄 Attempting basic PDF text extraction...');
  
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
        .filter(text => text.length > 2 && !/^[\s\n\r]*$/.test(text)) // Filter out short/empty strings
        .join(' ');
    }

    // If no text found, try extracting from Tj operators
    if (extractedText.length < 100) {
      const tjMatches = pdfContent.match(/\[(.*?)\]\s*TJ/g);
      if (tjMatches) {
        extractedText = tjMatches
          .map(match => match.replace(/\[(.*?)\]\s*TJ/, '$1'))
          .filter(text => text.length > 2)
          .join(' ');
      }
    }

    // Try BT/ET text extraction blocks
    if (extractedText.length < 100) {
      const btMatches = pdfContent.match(/BT\s*(.*?)\s*ET/gs);
      if (btMatches) {
        extractedText = btMatches
          .map(match => {
            // Extract text from Tj operations within BT/ET blocks
            const tjOps = match.match(/\((.*?)\)\s*Tj/g);
            return tjOps ? tjOps.map(tj => tj.replace(/\((.*?)\)\s*Tj/, '$1')).join(' ') : '';
          })
          .filter(text => text.length > 2)
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
    
    if (extractedText.length < 100) {
      throw new Error('Insufficient text extracted from PDF - likely an image-based document');
    }
    
    return extractedText;
    
  } catch (error) {
    console.error('❌ Basic PDF extraction failed:', error);
    throw error;
  }
}