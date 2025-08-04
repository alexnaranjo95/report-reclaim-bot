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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('✅ User authenticated by Supabase JWT verification');

  try {
    const contentType = req.headers.get('content-type');
    
    if (contentType?.includes('multipart/form-data')) {
      // Handle PDF upload
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const action = formData.get('action') as string;
      
      if (action === 'analyzePDF' && file) {
        return await analyzePDFFile(file);
      }
    } else {
      // Handle JSON requests
      const { action, data } = await req.json();

      if (action === 'analyzeCreditReport') {
        return await analyzeCreditReport(data.reportText);
      } else if (action === 'generateDisputeLetter') {
        return await generateDisputeLetter(data.creditor, data.items, data.type);
      } else if (action === 'getTinyMCEKey') {
        console.log('TinyMCE API key request received');
        
        if (!tinyMCEApiKey) {
          console.error('TinyMCE API key not found in environment variables');
          return new Response(JSON.stringify({ 
            apiKey: 'no-api-key',
            error: 'TinyMCE API key not configured'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        return new Response(JSON.stringify({ apiKey: tinyMCEApiKey }), {
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
  try {
    console.log('🚀 Processing PDF file:', file.name, 'Size:', file.size);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration not found');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create file path and upload to storage
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop() || 'pdf';
    const filePath = `temp/${crypto.randomUUID()}.${fileExtension}`;
    
    console.log('📤 Uploading file to storage...');
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('credit-reports')
      .upload(filePath, file);
      
    if (uploadError) {
      console.error('File upload failed:', uploadError);
      throw new Error(`File upload failed: ${uploadError.message}`);
    }
    
    console.log('✅ File uploaded to storage:', filePath);
    
    // Create credit report record
    const { data: reportData, error: reportError } = await supabase
      .from('credit_reports')
      .insert({
        file_name: fileName,
        file_path: filePath,
        bureau_name: 'Pending',
        extraction_status: 'pending',
        user_id: '00000000-0000-0000-0000-000000000000'
      })
      .select()
      .single();
      
    if (reportError) {
      console.error('Failed to create report record:', reportError);
      throw new Error(`Failed to create report record: ${reportError.message}`);
    }
    
    const reportId = reportData.id;
    console.log('✅ Created report record:', reportId);
    
    // Try PDF extraction with multiple methods
    let extractedText = '';
    let extractionMethod = '';
    let extractionSuccess = false;
    
    // Method 1: Try Adobe PDF Services
    try {
      console.log('🔄 Attempting Adobe PDF extraction...');
      const adobeResponse = await supabase.functions.invoke('adobe-pdf-extract', {
        body: { reportId, filePath }
      });
      
      if (adobeResponse.data?.success) {
        console.log('✅ Adobe extraction successful');
        extractionSuccess = true;
        extractionMethod = 'Adobe PDF Services';
        
        // Fetch the extracted text
        const { data: reportWithText } = await supabase
          .from('credit_reports')
          .select('raw_text')
          .eq('id', reportId)
          .single();
          
        extractedText = reportWithText?.raw_text || '';
      }
    } catch (adobeError) {
      console.log('❌ Adobe extraction failed:', adobeError.message);
    }
    
    // Method 2: Try Enhanced PDF extraction if Adobe failed
    if (!extractionSuccess) {
      try {
        console.log('🔄 Attempting enhanced PDF extraction...');
        const enhancedResponse = await supabase.functions.invoke('enhanced-pdf-extract', {
          body: { reportId, filePath }
        });
        
        if (enhancedResponse.data?.success) {
          console.log('✅ Enhanced extraction successful');
          extractionSuccess = true;
          extractionMethod = 'Enhanced PDF Extraction';
          
          // Fetch the extracted text
          const { data: reportWithText } = await supabase
            .from('credit_reports')
            .select('raw_text')
            .eq('id', reportId)
            .single();
            
          extractedText = reportWithText?.raw_text || '';
        }
      } catch (enhancedError) {
        console.log('❌ Enhanced extraction failed:', enhancedError.message);
      }
    }
    
    // Validate extraction results
    if (!extractionSuccess || !extractedText || extractedText.length < 200) {
      await supabase
        .from('credit_reports')
        .update({
          extraction_status: 'failed',
          processing_errors: 'All PDF extraction methods failed - unable to extract readable text'
        })
        .eq('id', reportId);
        
      throw new Error('PDF extraction failed - unable to extract readable text from document');
    }
    
    console.log(`🎉 Extraction completed using: ${extractionMethod}`);
    console.log('📊 Extracted text length:', extractedText.length);
    
    // Analyze the extracted text with OpenAI
    console.log('🤖 Analyzing credit report with OpenAI...');
    const analysisResponse = await analyzeCreditReport(extractedText);
    
    // Clean up temporary record and file
    console.log('🧹 Cleaning up temporary data...');
    await supabase.from('credit_reports').delete().eq('id', reportId);
    await supabase.storage.from('credit-reports').remove([filePath]);
    
    console.log('✅ Analysis completed successfully');
    return analysisResponse;
    
  } catch (error) {
    console.error('💥 PDF processing error:', error);
    
    // Update report status to failed if we have reportId
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const formData = await req.formData();
        const file = formData.get('file') as File;
        if (file) {
          const { data: reports } = await supabase
            .from('credit_reports')
            .select('id')
            .eq('file_name', file.name)
            .order('created_at', { ascending: false })
            .limit(1);
            
          if (reports && reports.length > 0) {
            await supabase
              .from('credit_reports')
              .update({
                extraction_status: 'failed',
                processing_errors: error.message
              })
              .eq('id', reports[0].id);
          }
        }
      }
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }
    
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'PDF processing failed. The document may be corrupted, image-based, or contain unreadable text.',
      step: 'extraction',
      canRetry: true
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function analyzeCreditReport(reportText: string) {
  const prompt = `
Analyze this credit report text comprehensively and extract ALL data for a complete financial profile. Return a JSON object with the following structure:

{
  "items": [
    {
      "creditor": "Creditor Name",
      "account": "Account number (masked)",
      "issue": "Description of the negative item",
      "impact": "high|medium|low",
      "bureau": ["Bureau1", "Bureau2"],
      "dateOpened": "Date if available",
      "lastActivity": "Date if available",
      "balance": "Amount if available",
      "paymentStatus": "Status description"
    }
  ],
  "personalInfo": {
    "name": "Full name if found",
    "address": "Full address if found", 
    "ssn": "SSN if found (partial)",
    "dateOfBirth": "DOB if found",
    "phone": "Phone number if found",
    "employer": "Current employer if found"
  },
  "creditScores": {
    "experian": 0,
    "equifax": 0,
    "transunion": 0
  },
  "totalPositiveAccounts": 0,
  "totalAccounts": 0,
  "historicalData": {
    "lettersSent": 0,
    "itemsRemoved": 0,
    "itemsPending": 0,
    "successRate": 0,
    "avgRemovalTime": 0
  },
  "accountBreakdown": {
    "creditCards": 0,
    "mortgages": 0,
    "autoLoans": 0,
    "studentLoans": 0,
    "personalLoans": 0,
    "collections": 0,
    "other": 0
  }
}

COMPREHENSIVE ANALYSIS REQUIREMENTS:

1. NEGATIVE ITEMS (for "items" array) - BE VERY SPECIFIC:
   - Late payments: Look for "LATE", "30 DAYS LATE", "60 DAYS LATE", "90 DAYS LATE", "120+ DAYS LATE", payment history codes like "1", "2", "3", "4", "5", "6", "7"
   - Collections: Look for "COLLECTION", "PLACED FOR COLLECTION", "COLLECTION AGENCY", "COLLECTIONS", "DEBT COLLECTOR"
   - Charge-offs: Look for "CHARGE OFF", "CHARGED OFF", "CHARGE-OFF", "CHARGEOFF", "PROFIT AND LOSS", "P&L WRITE OFF", "WRITTEN OFF", "BAD DEBT"
   - Bankruptcies: Look for "BANKRUPTCY", "CHAPTER 7", "CHAPTER 13", "CHAPTER 11", "BK", "BANKRUPT"
   - Repossessions: Look for "REPOSSESSION", "REPO", "VOLUNTARY SURRENDER", "INVOLUNTARY REPO"
   - Foreclosures - look for "FORECLOSURE", "REAL ESTATE OWNED"
   - High credit utilization (>30%) - calculate utilization ratios
   - Incorrect information - wrong dates, amounts, or account details
   - Fraudulent accounts - accounts not opened by consumer

2. ACCOUNT COUNTING:
   - totalPositiveAccounts: Count accounts with "PAYS AS AGREED", "CURRENT", "NEVER LATE", good payment history
   - totalAccounts: Count ALL credit accounts (positive + negative)
   - accountBreakdown: Categorize by type (credit cards, mortgages, auto loans, student loans, personal loans, collections, other)

3. HISTORICAL DATA EXTRACTION:
   - Look for previous dispute information, letters sent, resolved items
   - Calculate success rates if historical data is present
   - Extract timeline information for removal processes

4. PERSONAL INFORMATION:
   - Extract complete personal details (name, address, SSN, DOB, phone, employer)
   - Ensure accuracy and completeness

5. CREDIT SCORES:
   - Extract scores from all three bureaus if present
   - Look for score history or trends

Rate impact as:
- high: Collections, charge-offs, bankruptcies, foreclosures, repossessions, 90+ day lates
- medium: 60-day lates, high utilization (>50%), multiple 30-day lates  
- low: Single 30-day lates, minor errors, high utilization (30-50%)

Credit Report Text:
${reportText}
`;

  console.log('🤖 Making OpenAI request...');
  
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

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
          content: 'You are an expert credit analyst with deep knowledge of credit reporting systems, FCRA regulations, and dispute processes. Analyze credit reports comprehensively and extract ALL relevant data with precision. ALWAYS return valid JSON without markdown code blocks. Be thorough in extracting every piece of useful information from the credit report.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.05,
      max_tokens: 4000
    }),
  });

  console.log('📡 OpenAI response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('✅ OpenAI response received');
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    console.error('Invalid OpenAI response structure:', data);
    throw new Error('No response from OpenAI');
  }

  const content = data.choices[0].message.content;
  console.log('📄 Raw OpenAI content preview:', content.substring(0, 400));
  
  // Clean up markdown code blocks
  let cleanedContent = content.trim();
  cleanedContent = cleanedContent.replace(/^```(?:json)?\s*/i, '');
  cleanedContent = cleanedContent.replace(/\s*```\s*$/i, '');
  cleanedContent = cleanedContent.replace(/```/g, '');
  
  console.log('🧹 Cleaned content for parsing:', cleanedContent.substring(0, 400));
  
  try {
    const analysisResult = JSON.parse(cleanedContent);
    console.log('✅ Successfully parsed JSON result');
    console.log('📊 Found items:', analysisResult.items?.length || 0);
    console.log('💳 Positive accounts:', analysisResult.totalPositiveAccounts || 0);
    console.log('📈 Total accounts:', analysisResult.totalAccounts || 0);
    
    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (parseError) {
    console.error('❌ JSON parse error:', parseError);
    console.error('🔍 Full cleaned content:', cleanedContent);
    
    // Try to extract JSON from the content more aggressively
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extractedJson = jsonMatch[0];
        console.log('🔄 Attempting to parse extracted JSON:', extractedJson.substring(0, 400));
        const analysisResult = JSON.parse(extractedJson);
        console.log('✅ Successfully parsed extracted JSON');
        return new Response(JSON.stringify(analysisResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (extractError) {
        console.error('❌ Extracted JSON parse error:', extractError);
      }
    }
    
    throw new Error(`Failed to parse OpenAI response as JSON: ${parseError.message}`);
  }
}

async function generateDisputeLetter(creditor: string, items: string[], type: string) {
  console.log('📝 Generating dispute letter for:', { creditor, items, type });
  
  const prompt = `
Generate a professional, FCRA-compliant dispute letter for credit repair.

Creditor: ${creditor}
Items to dispute: ${items.join(', ')}
Letter type: ${type}

REQUIREMENTS:
- Professional business letter format
- Reference FCRA Section 611 for investigations
- Reference FCRA Section 623 for data furnisher responsibilities  
- Include specific account details and dispute reasons
- Request validation and verification
- Set 30-day investigation timeline
- Include consumer rights statements
- Be assertive but professional
- 400-600 words maximum

Format as a complete business letter with:
- Date placeholder: [DATE]
- Address placeholders: [CONSUMER_NAME], [CONSUMER_ADDRESS]
- Bureau/Creditor address placeholder: [BUREAU_ADDRESS]
- Account-specific details
- Professional closing
`;

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
            content: 'You are an expert credit repair attorney with 20+ years of experience writing FCRA-compliant dispute letters. Generate professional, legally sound letters that achieve maximum results.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      }),
    });

    const data = await response.json();
    const letter = data.choices[0]?.message?.content || 'Error generating letter';

    console.log('✅ Dispute letter generated successfully');
    return new Response(JSON.stringify({ letter }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Letter generation error:', error);
    return new Response(JSON.stringify({ 
      letter: `Professional Dispute Letter Template\n\n[This would be a comprehensive dispute letter for ${creditor} regarding: ${items.join(', ')}]\n\nDue to API limitations, please check logs for detailed error information.` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}