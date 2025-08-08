import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const docsumoApiKey = Deno.env.get('DOCSUMO_API_KEY');

serve(async (req) => {
  console.log(`📋 Request method: ${req.method}, URL: ${req.url}`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let reportId: string | null = null;

  try {
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase configuration missing');
    if (!docsumoApiKey) throw new Error('Docsumo API key not configured');

    const { reportId: rid, filePath } = await req.json();
    reportId = rid;
    if (!reportId || !filePath) throw new Error('Missing reportId or filePath');

    console.log(`🚀 Starting Docsumo extraction for report ${reportId}, file: ${filePath}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase
      .from('credit_reports')
      .update({
        extraction_status: 'processing',
        consolidation_status: 'processing',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(filePath);
    if (downloadError) throw new Error(`Failed to download PDF: ${downloadError.message}`);

    const arrayBuffer = await fileData.arrayBuffer();
    console.log('📄 Downloaded PDF, size:', arrayBuffer.byteLength);

    const startTime = Date.now();
    const extraction = await extractWithDocsumo(arrayBuffer);
    const extractionResult = extraction.text;
    const totalTime = Date.now() - startTime;

    console.log(`✅ Docsumo extraction completed in ${totalTime}ms via ${extraction.diagnostics?.endpoint || 'unknown endpoint'}`);

    const usedMethod = extraction.diagnostics.usedFallback ? 'fallback' : 'docsumo';
    const characterCount = extractionResult.length;
    const wordCount = extractionResult.split(/\s+/).filter(w => w.length > 0).length;
    const confidence = calculateConfidenceScore(extractionResult, usedMethod);
    const hasStructuredData = hasExtractableData(extractionResult);

    const sanitizedText = sanitizeTextForPostgres(extractionResult);

    await supabase
      .from('extraction_results')
      .insert({
        report_id: reportId,
        extraction_method: extraction.diagnostics.usedFallback ? 'fallback' : 'docsumo',
        extracted_text: sanitizedText,
        processing_time_ms: totalTime,
        character_count: characterCount,
        word_count: wordCount,
        confidence_score: confidence,
        has_structured_data: hasStructuredData,
        extraction_metadata: {
          hasError: false,
          errorMessage: null,
          processingTime: totalTime,
          docsumoAttempts: extraction.diagnostics.attempts,
          endpoint: extraction.diagnostics.endpoint,
          usedFallback: extraction.diagnostics.usedFallback,
        }
      });

    console.log(`📊 Docsumo: ${characterCount} chars, confidence: ${confidence}, structured: ${hasStructuredData}`);

    if (extractionResult.length < 100) throw new Error('Docsumo extraction returned insufficient text data');

    await supabase
      .from('consolidation_metadata')
      .insert({
        report_id: reportId,
        primary_source: usedMethod,
        consolidation_strategy: 'single_source',
        confidence_level: confidence,
        field_sources: { primary_text: usedMethod, total_sources: 1, methods_used: [usedMethod] },
        conflict_count: 0,
        requires_human_review: confidence < 0.7,
        consolidation_notes: `${usedMethod}-only extraction. Confidence: ${confidence}`
      });

    // First update: set status only
    const { error: statusError } = await supabase
      .from('credit_reports')
      .update({
        extraction_status: 'completed',
        consolidation_status: 'completed',
        consolidation_confidence: confidence,
        primary_extraction_method: usedMethod,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (statusError) {
      console.error('Failed to update status:', statusError);
      throw new Error(`Status update failed: ${statusError.message}`);
    }

    // Second update: set raw_text separately with extra sanitization
    const { error: textError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: sanitizedText
      })
      .eq('id', reportId);

    if (textError) {
      console.error('Failed to update raw_text:', textError);
      // Don't throw - we have the text in our response
      console.log('⚠️ Raw text update failed but extraction succeeded');
    }

    console.log(`✅ Docsumo extraction completed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        extractedText: sanitizedText,
        textLength: extractionResult.length,
        primaryMethod: extraction.diagnostics.usedFallback ? 'fallback' : 'docsumo',
        consolidationConfidence: confidence,
        extractionResult: {
          method: extraction.diagnostics.usedFallback ? 'fallback' : 'docsumo',
          confidence: confidence,
          characterCount: characterCount,
          hasStructuredData: hasStructuredData,
        },
        diagnostics: extraction.diagnostics,
        hasValidText: extractionResult.length > 100,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Docsumo extraction error:', error);

    if (reportId && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'failed',
            consolidation_status: 'failed',
            processing_errors: sanitizeTextForPostgres(`${error.message} | Stack: ${error.stack?.substring(0, 500) || 'No stack trace'}`),
            updated_at: new Date().toISOString(),
          })
          .eq('id', reportId);
      } catch (updateError) {
        console.error('Failed to update error status:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message, details: error.stack?.substring(0, 500) || 'No additional details' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calculateConfidenceScore(text: string, method: string): number {
  if (!text || text.length < 50) return 0.0;
  let baseScore = 0.5;
  switch (method) {
    case 'docsumo':
      baseScore = 0.86;
      break;
    case 'fallback':
      baseScore = 0.3;
      break;
    default:
      baseScore = 0.6;
  }
  const lengthScore = Math.min(0.3, text.length / 10000);
  const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  const creditKeywords = (text.match(/credit|report|account|balance|payment|inquiry/gi) || []).length;
  const qualityScore = lengthScore + alphaRatio * 0.2 + Math.min(0.2, creditKeywords / 50);
  return Math.min(0.99, baseScore + qualityScore);
}

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
    /balance/i,
  ];
  let matches = 0;
  for (const pattern of creditIndicators) {
    if (pattern.test(text)) matches++;
  }
  return matches >= 3;
}

function sanitizeTextForPostgres(text: string): string {
  if (!text) return text;
  try {
    // More aggressive sanitization for PostgreSQL JSON storage
    let safe = text.replace(/\u0000/g, ''); // Remove null bytes
    safe = safe.replace(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, ''); // Remove unpaired surrogates
    safe = safe.replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u'); // Fix invalid unicode escapes
    safe = safe.replace(/[\u0001-\u0009\u000B-\u001F]/g, ' '); // Replace control chars with spaces
    safe = safe.replace(/[\u007F-\u009F]/g, ' '); // Replace additional control chars
    safe = safe.replace(/"/g, '\\"'); // Escape quotes for JSON safety
    safe = safe.replace(/\\/g, '\\\\'); // Escape backslashes
    safe = safe.trim();
    
    // Truncate if too long (PostgreSQL text limit safety)
    if (safe.length > 1000000) {
      safe = safe.substring(0, 1000000) + '... [truncated]';
    }
    
    return safe;
  } catch (error) {
    console.error('Sanitization error:', error);
    return text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim(); // Fallback: ASCII only
  }
}

async function extractWithDocsumo(pdfBuffer: ArrayBuffer): Promise<{ text: string; diagnostics: { attempts: { endpoint: string; status: number; ok: boolean; error?: string }[]; endpoint?: string; usedFallback: boolean } }> {
  console.log('🔄 Starting Docsumo OCR extraction...');
  const attempts: { endpoint: string; status: number; ok: boolean; error?: string }[] = [];
  let lastError: any = null;
  try {
    const apiKey = Deno.env.get('DOCSUMO_API_KEY');
    if (!apiKey) throw new Error('Docsumo API key not configured');

    const formData = new FormData();
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('file', pdfBlob, 'credit-report.pdf');

    // Try multiple known endpoints (header uses `apikey` per docs)
    const endpoints = [
      'https://app.docsumo.com/api/v1/documents/extract',
      'https://app.docsumo.com/api/v1/eevee/extract'
    ];

    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': apiKey,
            'Accept': 'application/json',
          },
          body: formData,
        });

        if (!resp.ok) {
          const text = await resp.text();
          attempts.push({ endpoint, status: resp.status, ok: false, error: text?.slice(0, 500) });
          console.error(`❌ Docsumo API error @ ${endpoint}: ${resp.status} ${resp.statusText}`);
          continue; // try next endpoint
        }

        attempts.push({ endpoint, status: resp.status, ok: true });
        const result = await resp.json();

        let extractedText = '';
        if (result?.data?.raw_text) extractedText = result.data.raw_text;
        else if (result?.raw_text) extractedText = result.raw_text;
        else if (result?.data?.text) extractedText = result.data.text;
        else if (result?.text) extractedText = result.text;
        else if (result?.data?.ocr_text) extractedText = result.data.ocr_text;
        else if (result?.ocr_text) extractedText = result.ocr_text;
        else if (Array.isArray(result?.pages)) {
          extractedText = result.pages.map((p: any) => p.text || p.content || '').filter((t: string) => t.length > 0).join('\n');
        } else {
          const findTextInObject = (obj: any): string[] => {
            const texts: string[] = [];
            if (typeof obj === 'string' && obj.length > 20) texts.push(obj);
            else if (obj && typeof obj === 'object') {
              for (const value of Object.values(obj)) texts.push(...findTextInObject(value));
            }
            return texts;
          };
          const foundTexts = findTextInObject(result);
          extractedText = foundTexts.join('\n');
        }

        if (extractedText) {
          extractedText = extractedText.trim().replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n');
        }

        console.log(`📊 Docsumo extracted ${extractedText.length} characters from ${endpoint}`);
        if (extractedText.length < 100) {
          console.log('⚠️ Docsumo returned insufficient text, will try fallback.');
          break; // proceed to fallback below
        }

        return { text: extractedText, diagnostics: { attempts, endpoint, usedFallback: false } };
      } catch (fetchErr) {
        lastError = fetchErr;
        attempts.push({ endpoint, status: 0, ok: false, error: String(fetchErr).slice(0, 500) });
        console.error(`❌ Docsumo fetch error @ ${endpoint}:`, fetchErr);
      }
    }

    // If we reached here, docsumo failed or insufficient text
    console.log('🔄 Docsumo failed, attempting fallback PDF extraction...');
    const fallbackText = await fallbackTextExtraction(pdfBuffer);
    return { text: fallbackText, diagnostics: { attempts, endpoint: 'fallback', usedFallback: true } };
  } catch (error) {
    console.error('❌ Docsumo extraction error:', error);
    console.log('🔄 Docsumo failed completely, attempting fallback PDF extraction...');
    try {
      const fallbackText = await fallbackTextExtraction(pdfBuffer);
      return { text: fallbackText, diagnostics: { attempts, endpoint: 'fallback', usedFallback: true } };
    } catch (fallbackError) {
      console.error('❌ Fallback extraction also failed:', fallbackError);
      throw new Error(`Docsumo extraction failed: ${(lastError?.message || error.message)}`);
    }
  }
}

async function fallbackTextExtraction(arrayBuffer: ArrayBuffer): Promise<string> {
  console.log('🔄 Attempting basic PDF text extraction...');
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false });
    const pdfContent = decoder.decode(uint8Array);

    let extractedText = '';
    const textMatches = pdfContent.match(/\((.*?)\)/g);
    if (textMatches) {
      extractedText = textMatches
        .map((match) => match.slice(1, -1))
        .filter((text) => text.length > 2 && !/^[\s\n\r]*$/.test(text))
        .join(' ');
    }

    if (extractedText.length < 100) {
      const tjMatches = pdfContent.match(/\[(.*?)\]\s*TJ/g);
      if (tjMatches) {
        extractedText = tjMatches
          .map((match) => match.replace(/\[(.*?)\]\s*TJ/, '$1'))
          .filter((text) => text.length > 2)
          .join(' ');
      }
    }

    if (extractedText.length < 100) {
      const btMatches = pdfContent.match(/BT\s*(.*?)\s*ET/gs);
      if (btMatches) {
        extractedText = btMatches
          .map((match) => {
            const tjOps = match.match(/\((.*?)\)\s*Tj/g);
            return tjOps ? tjOps.map((tj) => tj.replace(/\((.*?)\)\s*Tj/, '$1')).join(' ') : '';
          })
          .filter((text) => text.length > 2)
          .join(' ');
      }
    }

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
