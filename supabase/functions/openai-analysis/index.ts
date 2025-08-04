import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const tinyMCEApiKey = Deno.env.get('TINYMCE_API_KEY');

console.log('OpenAI API Key configured:', !!openAIApiKey);
console.log('TinyMCE API Key configured:', !!tinyMCEApiKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('✅ User authenticated by Supabase JWT verification');

  try {
    const contentType = req.headers.get('content-type');
    
    if (contentType?.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const action = formData.get('action') as string;
      
      if (action === 'analyzePDF' && file) {
        return await analyzePDFFile(file);
      }
    } else {
      const { action, data } = await req.json();

      if (action === 'analyzeCreditReport') {
        return await analyzeCreditReport(data.reportText);
      } else if (action === 'generateDisputeLetter') {
        return await generateDisputeLetter(data.creditor, data.items, data.type);
      } else if (action === 'getTinyMCEKey') {
        return new Response(JSON.stringify({ 
          apiKey: tinyMCEApiKey || 'no-api-key' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in openai-analysis function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function analyzePDFFile(file: File) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration not found');
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let reportId: string = '';
  
  try {
    console.log('🚀 Processing PDF file:', file.name, 'Size:', file.size);
    
    // Upload file to storage
    const filePath = `temp/${crypto.randomUUID()}.pdf`;
    console.log('📤 Uploading file to storage...');
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('credit-reports')
      .upload(filePath, file);
      
    if (uploadError) {
      throw new Error(`File upload failed: ${uploadError.message}`);
    }
    
    console.log('📁 File uploaded to storage:', filePath);
    
    // Create credit report record
    const { data: reportData, error: reportError } = await supabase
      .from('credit_reports')
      .insert({
        file_name: file.name,
        file_path: filePath,
        bureau_name: 'Unknown',
        extraction_status: 'pending',
        user_id: '00000000-0000-0000-0000-000000000000' // Will be updated by client
      })
      .select('id')
      .single();
      
    if (reportError || !reportData) {
      throw new Error(`Failed to create report record: ${reportError?.message}`);
    }
    
    reportId = reportData.id;
    console.log('📋 Created report record:', reportId);
    
    // Update status to processing
    await supabase
      .from('credit_reports')
      .update({ extraction_status: 'processing' })
      .eq('id', reportId);
    
    // Extract text using multiple methods
    console.log('🔍 Starting text extraction...');
    let extractedText = '';
    let extractionMethod = '';
    
    try {
      // Method 1: PDF.js extraction
      console.log('Attempting PDF.js extraction...');
      extractedText = await extractWithPDFJS(file);
      extractionMethod = 'PDF.js';
      console.log('✅ PDF.js extraction successful');
    } catch (pdfjsError) {
      console.log('❌ PDF.js failed:', pdfjsError.message);
      
      try {
        // Method 2: Enhanced extraction
        console.log('Attempting enhanced extraction...');
        const arrayBuffer = await file.arrayBuffer();
        extractedText = await extractWithEnhancedMethod(arrayBuffer);
        extractionMethod = 'Enhanced';
        console.log('✅ Enhanced extraction successful');
      } catch (enhancedError) {
        console.log('❌ Enhanced extraction failed:', enhancedError.message);
        
        // CRITICAL: NO MORE FALSE DATA FALLBACK
        throw new Error('All PDF extraction methods failed. Unable to extract readable text from this PDF. Please ensure the PDF contains text (not just scanned images) and try again.');
      }
    }
    
    console.log(`📊 Extraction completed using: ${extractionMethod}`);
    console.log('Extracted text length:', extractedText.length);
    
    // Validate extraction
    if (!extractedText || extractedText.length < 100) {
      throw new Error('No readable text extracted from PDF. Please ensure this is a text-based PDF, not a scanned image.');
    }
    
    // Validate that extracted text contains credit report content
    if (!containsCreditKeywords(extractedText)) {
      throw new Error('Extracted text does not appear to be from a credit report. Please upload a valid credit report from Experian, Equifax, or TransUnion.');
    }
    
    // Store extracted text permanently
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedText,
        extraction_status: 'completed'
      })
      .eq('id', reportId);
      
    if (updateError) {
      throw new Error(`Failed to save extracted text: ${updateError.message}`);
    }
    
    // Parse and store structured data
    await parseAndStoreCreditData(supabase, reportId, extractedText);
    
    // Analyze with OpenAI
    console.log('🧠 Analyzing with OpenAI...');
    const analysisJson = await analyzeCreditReport(extractedText);
    const analysis = JSON.parse(analysisJson);
    
    return new Response(JSON.stringify({
      success: true,
      reportId,
      extractionMethod,
      textLength: extractedText.length,
      analysis: analysis
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('💥 PDF processing error:', error);
    
    // Update error status
    if (reportId) {
      await supabase
        .from('credit_reports')
        .update({
          extraction_status: 'failed',
          processing_errors: error.message
        })
        .eq('id', reportId);
    }
    
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      reportId
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function extractWithPDFJS(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Simple PDF text extraction using basic PDF parsing
  const uint8Array = new Uint8Array(arrayBuffer);
  const pdfString = new TextDecoder('latin1').decode(uint8Array);
  
  // Extract text content from PDF streams
  const textRegex = /BT\s*(.*?)\s*ET/gs;
  const matches = pdfString.match(textRegex);
  
  if (!matches) {
    throw new Error('No text content found in PDF');
  }
  
  let extractedText = '';
  for (const match of matches) {
    // Extract text from Tj and TJ operators
    const textCommands = match.match(/\(([^)]*)\)\s*Tj/g);
    if (textCommands) {
      for (const cmd of textCommands) {
        const textMatch = cmd.match(/\(([^)]*)\)/);
        if (textMatch && textMatch[1]) {
          extractedText += textMatch[1] + ' ';
        }
      }
    }
  }
  
  if (extractedText.length < 100) {
    throw new Error('Insufficient text content extracted');
  }
  
  return extractedText.trim();
}

async function extractWithEnhancedMethod(arrayBuffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(arrayBuffer);
  let extractedText = '';
  let currentSequence = '';
  
  // Extract readable sequences from PDF bytes
  for (let i = 0; i < uint8Array.length; i++) {
    const byte = uint8Array[i];
    
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      currentSequence += String.fromCharCode(byte);
    } else {
      if (currentSequence.length >= 8) {
        const cleanSequence = currentSequence.replace(/[^\w\s.,()-]/g, ' ').trim();
        if (cleanSequence.length >= 5 && containsCreditKeywords(cleanSequence)) {
          extractedText += cleanSequence + ' ';
        }
      }
      currentSequence = '';
    }
  }
  
  if (extractedText.length < 100) {
    throw new Error('Insufficient text content extracted');
  }
  
  return extractedText.trim();
}

function containsCreditKeywords(text: string): boolean {
  const keywords = [
    'credit', 'account', 'balance', 'payment', 'name', 'address',
    'phone', 'date', 'birth', 'social', 'security', 'experian',
    'equifax', 'transunion', 'visa', 'mastercard', 'discover'
  ];
  
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}

async function parseAndStoreCreditData(supabase: any, reportId: string, text: string) {
  try {
    console.log('📋 Parsing and storing credit data...');
    
    // Extract personal information
    const personalInfo = extractPersonalInfo(text);
    if (personalInfo.full_name || personalInfo.date_of_birth) {
      await supabase.from('personal_information').insert({
        report_id: reportId,
        ...personalInfo
      });
      console.log('✅ Personal information stored');
    }
    
    // Extract credit accounts
    const accounts = extractCreditAccounts(text);
    for (const account of accounts) {
      await supabase.from('credit_accounts').insert({
        report_id: reportId,
        ...account
      });
    }
    console.log(`✅ Stored ${accounts.length} credit accounts`);
    
    // Extract credit inquiries
    const inquiries = extractCreditInquiries(text);
    for (const inquiry of inquiries) {
      await supabase.from('credit_inquiries').insert({
        report_id: reportId,
        ...inquiry
      });
    }
    console.log(`✅ Stored ${inquiries.length} credit inquiries`);
    
    // Extract negative items
    const negativeItems = extractNegativeItems(text);
    for (const item of negativeItems) {
      await supabase.from('negative_items').insert({
        report_id: reportId,
        ...item
      });
    }
    console.log(`✅ Stored ${negativeItems.length} negative items`);
    
  } catch (error) {
    console.error('❌ Error parsing credit data:', error);
    throw error;
  }
}

function extractPersonalInfo(text: string) {
  const nameMatch = text.match(/(?:Name|Consumer):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  const dobMatch = text.match(/(?:Date of Birth|DOB|Born):\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const ssnMatch = text.match(/(?:SSN|Social Security):\s*(\*{3}-\*{2}-\d{4}|\d{3}-\d{2}-\d{4})/i);
  const addressMatch = text.match(/(?:Address|Current Address):\s*([^,\n]+(?:,\s*[^,\n]+)*)/i);

  return {
    full_name: nameMatch?.[1] || null,
    date_of_birth: dobMatch?.[1] ? formatDate(dobMatch[1]) : null,
    ssn_partial: ssnMatch?.[1] || null,
    current_address: addressMatch?.[1] ? { street: addressMatch[1] } : null
  };
}

function extractCreditAccounts(text: string): any[] {
  const accounts = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for creditor names
    if (line.includes('Credit Card') || line.includes('Bank') || line.includes('Auto Loan')) {
      const creditorName = line.trim();
      const accountData: any = { creditor_name: creditorName };
      
      // Look for account details in following lines
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const detailLine = lines[j];
        
        if (detailLine.includes('Account Number:')) {
          accountData.account_number = detailLine.split(':')[1]?.trim();
        } else if (detailLine.includes('Current Balance:')) {
          const balanceStr = detailLine.split(':')[1]?.trim().replace(/[$,]/g, '');
          accountData.current_balance = parseFloat(balanceStr) || 0;
        } else if (detailLine.includes('Credit Limit:')) {
          const limitStr = detailLine.split(':')[1]?.trim().replace(/[$,]/g, '');
          accountData.credit_limit = parseFloat(limitStr) || 0;
        } else if (detailLine.includes('Account Type:')) {
          accountData.account_type = detailLine.split(':')[1]?.trim();
        } else if (detailLine.includes('Payment Status:')) {
          accountData.account_status = detailLine.split(':')[1]?.trim();
        }
      }
      
      if (accountData.creditor_name) {
        accounts.push(accountData);
      }
    }
  }
  
  return accounts;
}

function extractCreditInquiries(text: string): any[] {
  const inquiries = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('Date:') && (i > 0 && !lines[i-1].includes(':'))) {
      const inquirerName = lines[i-1]?.trim();
      const dateMatch = line.match(/Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      
      if (inquirerName && dateMatch) {
        inquiries.push({
          inquirer_name: inquirerName,
          inquiry_date: formatDate(dateMatch[1]),
          inquiry_type: 'hard'
        });
      }
    }
  }
  
  return inquiries;
}

function extractNegativeItems(text: string): any[] {
  const negativeItems = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('Collection') || line.includes('Services')) {
      const negativeItem: any = {
        negative_type: 'collection',
        description: line.trim()
      };
      
      // Look for amount in following lines
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const detailLine = lines[j];
        if (detailLine.includes('Amount:')) {
          const amountStr = detailLine.split(':')[1]?.trim().replace(/[$,]/g, '');
          negativeItem.amount = parseFloat(amountStr) || 0;
        }
      }
      
      negativeItems.push(negativeItem);
    }
  }
  
  return negativeItems;
}

function formatDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

async function analyzeCreditReport(reportText: string) {
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Truncate text to fit within token limits (~3000 tokens = ~12000 characters)
  const maxLength = 12000;
  let truncatedText = reportText;
  
  if (reportText.length > maxLength) {
    // Try to find a natural break point (paragraph, section)
    const truncateAt = reportText.lastIndexOf('\n', maxLength);
    truncatedText = reportText.substring(0, truncateAt > 0 ? truncateAt : maxLength);
    console.log(`📝 Truncated text from ${reportText.length} to ${truncatedText.length} characters`);
  }

  // Log sample of text for debugging
  console.log(`🧠 Analyzing with OpenAI...`);
  console.log(`📄 Text sample: ${truncatedText.substring(0, 500)}...`);

  const prompt = `You are analyzing a REAL credit report document. This contains actual financial data that you must extract carefully.

CRITICAL: Look for ACTUAL data in this text, not generic examples. Find:
- Real names (not "John Doe" or examples)
- Real addresses 
- Real account numbers (even partial like ****1234)
- Real creditor names (Bank of America, Chase, Capital One, etc.)
- Real balances and credit limits
- Real credit scores

Credit Report Text:
${truncatedText}

INSTRUCTIONS:
1. Search through ALL the text for actual financial data
2. If you find partial account numbers, extract them
3. If you find any creditor names, include them
4. If you see balances, limits, or scores, extract the numbers
5. If information is truly missing, say "Not found" but be thorough first

Respond in JSON format:
{
  "summary": {
    "totalAccounts": number,
    "totalBalance": number,
    "creditUtilization": number,
    "paymentHistory": string,
    "creditScore": number,
    "overallRisk": "low" | "medium" | "high"
  },
  "personalInfo": {
    "name": string,
    "dateOfBirth": string,
    "address": string,
    "ssn": string
  },
  "accounts": [
    {
      "creditor": string,
      "accountNumber": string,
      "balance": number,
      "limit": number,
      "status": string,
      "type": string
    }
  ],
  "inquiries": [
    {
      "company": string,
      "date": string,
      "type": string
    }
  ],
  "negativeItems": [
    {
      "type": string,
      "description": string,
      "amount": number,
      "severity": number
    }
  ],
  "recommendations": [
    {
      "category": string,
      "action": string,
      "priority": "high" | "medium" | "low",
      "impact": string
    }
  ]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a credit analysis expert. Analyze credit reports and provide detailed, actionable insights in valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 3000
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const analysisContent = data.choices[0]?.message?.content;

    if (!analysisContent) {
      throw new Error('No analysis content received from OpenAI');
    }

    // Clean up potential markdown formatting
    const cleanContent = analysisContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Validate JSON
    try {
      JSON.parse(cleanContent);
    } catch (jsonError) {
      console.error('Invalid JSON from OpenAI:', cleanContent);
      throw new Error('OpenAI returned invalid JSON format');
    }

    return cleanContent;

  } catch (error) {
    console.error('Credit report analysis error:', error);
    throw new Error(`Analysis failed: ${error.message}`);
  }
}

async function generateDisputeLetter(creditor: string, items: string[], type: string) {
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `Generate a professional FCRA-compliant dispute letter for the following:

Creditor: ${creditor}
Items to dispute: ${items.join(', ')}
Letter type: ${type}

The letter should be:
- Formal and professional
- FCRA compliant
- Include proper legal language
- Request verification and removal if unverifiable
- Include a 30-day response timeframe

Generate only the letter content, no additional formatting.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a legal expert specializing in FCRA-compliant dispute letters. Generate professional, legally sound dispute letters.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 1500
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const letterContent = data.choices[0]?.message?.content;

    if (!letterContent) {
      throw new Error('No letter content generated');
    }

    return new Response(JSON.stringify({ letter: letterContent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Letter generation error:', error);
    throw new Error(`Letter generation failed: ${error.message}`);
  }
}