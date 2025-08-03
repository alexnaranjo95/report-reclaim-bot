
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const tinyMCEApiKey = Deno.env.get('TINYMCE_API_KEY');

console.log('OpenAI API Key configured:', !!openAIApiKey);
console.log('TinyMCE API Key configured:', !!tinyMCEApiKey);
if (tinyMCEApiKey) {
  console.log('TinyMCE API Key preview:', tinyMCEApiKey.substring(0, 10) + '...');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Since verify_jwt = true is set in config.toml, Supabase handles JWT verification
  // We can access user info from the context
  console.log('Request received, checking user context...');
  
  try {
    // Get user from Supabase context (automatically populated when JWT verification passes)
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('No authorization header found');
      return new Response(
        JSON.stringify({ error: 'Authentication required - no auth header' }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Create Supabase client with the auth header
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    console.log('Supabase URL configured:', !!supabaseUrl);
    console.log('Supabase Key configured:', !!supabaseKey);
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase configuration missing');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Test the authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('Auth verification failed:', authError.message);
      return new Response(
        JSON.stringify({ error: 'Authentication failed: ' + authError.message }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    
    if (!user) {
      console.error('No user found after auth verification');
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    
    console.log('User authenticated successfully:', user.id);
  } catch (authSetupError) {
    console.error('Authentication setup error:', authSetupError);
    return new Response(
      JSON.stringify({ error: 'Authentication setup failed' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

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
        console.log('TinyMCE API key configured:', !!tinyMCEApiKey);
        console.log('TinyMCE API key value:', tinyMCEApiKey ? tinyMCEApiKey.substring(0, 10) + '...' : 'not found');
        
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

  console.log('Making OpenAI request...');
  
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
      model: 'gpt-4.1-2025-04-14',
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

  console.log('OpenAI response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('OpenAI response received');
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    console.error('Invalid OpenAI response structure:', data);
    throw new Error('No response from OpenAI');
  }

  const content = data.choices[0].message.content;
  console.log('Raw OpenAI content:', content.substring(0, 400));
  
  // More robust cleaning of markdown code blocks
  let cleanedContent = content.trim();
  
  // Remove opening markdown code blocks
  cleanedContent = cleanedContent.replace(/^```(?:json)?\s*/i, '');
  
  // Remove closing markdown code blocks
  cleanedContent = cleanedContent.replace(/\s*```\s*$/i, '');
  
  // Remove any remaining markdown artifacts
  cleanedContent = cleanedContent.replace(/```/g, '');
  
  console.log('Cleaned content for parsing:', cleanedContent.substring(0, 400));
  
  try {
    const analysisResult = JSON.parse(cleanedContent);
    console.log('Successfully parsed JSON result');
    console.log('Found items:', analysisResult.items?.length || 0);
    console.log('Positive accounts:', analysisResult.totalPositiveAccounts || 0);
    console.log('Total accounts:', analysisResult.totalAccounts || 0);
    
    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    console.error('Full cleaned content:', cleanedContent);
    
    // Try to extract JSON from the content more aggressively
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extractedJson = jsonMatch[0];
        console.log('Attempting to parse extracted JSON:', extractedJson.substring(0, 400));
        const analysisResult = JSON.parse(extractedJson);
        console.log('Successfully parsed extracted JSON');
        console.log('Found items from extracted:', analysisResult.items?.length || 0);
        return new Response(JSON.stringify(analysisResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (extractError) {
        console.error('Extracted JSON parse error:', extractError);
      }
    }
    
    throw new Error(`Failed to parse OpenAI response as JSON: ${parseError.message}`);
  }
}

async function generateDisputeLetter(creditor: string, items: string[], type: string) {
  // Enhanced dispute letter generation with multiple calls for accuracy
  console.log('Generating enhanced dispute letter for:', { creditor, items, type });
  
  // First call: Generate the main dispute letter
  const mainLetterPrompt = `
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

  // Second call: Generate supporting documentation requirements
  const documentationPrompt = `
For a credit dispute regarding ${creditor} with issues: ${items.join(', ')}, generate a list of supporting documentation that should be requested and included.

Provide:
1. Documents to request from creditor
2. Documents consumer should gather
3. Legal citations to include
4. Timeline expectations
5. Follow-up actions if no response

Format as a structured list.
`;

  try {
    // Multiple API calls for comprehensive results
    const [mainLetterResponse, documentationResponse] = await Promise.all([
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-2025-04-14',
          messages: [
            {
              role: 'system',
              content: 'You are an expert credit repair attorney with 20+ years of experience writing FCRA-compliant dispute letters. Generate professional, legally sound letters that achieve maximum results.'
            },
            {
              role: 'user',
              content: mainLetterPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1500
        }),
      }),
      
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-2025-04-14',
          messages: [
            {
              role: 'system',
              content: 'You are a credit repair specialist who knows exactly what documentation and legal requirements are needed for successful disputes.'
            },
            {
              role: 'user',
              content: documentationPrompt
            }
          ],
          temperature: 0.2,
          max_tokens: 800
        }),
      })
    ]);

    const [mainLetterData, documentationData] = await Promise.all([
      mainLetterResponse.json(),
      documentationResponse.json()
    ]);

    const mainLetter = mainLetterData.choices[0]?.message?.content || 'Error generating main letter';
    const documentation = documentationData.choices[0]?.message?.content || 'Error generating documentation list';

    // Third call: Enhance and finalize the letter
    const enhancementPrompt = `
Take this dispute letter and enhance it with the documentation requirements. Make it more powerful and legally precise:

MAIN LETTER:
${mainLetter}

DOCUMENTATION REQUIREMENTS:
${documentation}

Combine these into one comprehensive, professional dispute letter that includes:
1. The main letter content
2. Documentation requirements section
3. Legal citations
4. Timeline expectations
5. Consequences of non-compliance

Keep it under 800 words but make it highly effective.
`;

    const enhancementResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: 'You are a master credit repair expert. Create the most effective dispute letter possible by combining all provided elements into one powerful, professional document.'
          },
          {
            role: 'user',
            content: enhancementPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      }),
    });

    const enhancementData = await enhancementResponse.json();
    const finalLetter = enhancementData.choices[0]?.message?.content || mainLetter;

    console.log('Enhanced dispute letter generated successfully');
    return new Response(JSON.stringify({ letter: finalLetter }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Enhanced letter generation error:', error);
    return new Response(JSON.stringify({ 
      letter: `Professional Dispute Letter Template\n\n[This would be a comprehensive dispute letter for ${creditor} regarding: ${items.join(', ')}]\n\nDue to API limitations, please use the debug function to check logs for detailed error information.` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function analyzePDFFile(file: File) {
  try {
    console.log('Processing PDF file:', file.name, 'Size:', file.size);
    
    // Convert PDF to text using a simple extraction method
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Simple PDF text extraction - look for text content between stream objects
    const pdfText = new TextDecoder().decode(uint8Array);
    
    // Extract readable text from PDF content
    let extractedText = '';
    const textMatches = pdfText.match(/stream\s*(.*?)\s*endstream/gs);
    
    if (textMatches) {
      for (const match of textMatches) {
        const streamContent = match.replace(/^stream\s*/, '').replace(/\s*endstream$/, '');
        // Try to extract readable text
        const readableText = streamContent.replace(/[^\x20-\x7E\n\r]/g, ' ');
        if (readableText.trim().length > 10) {
          extractedText += readableText + '\n';
        }
      }
    }
    
    // Fallback: extract any readable text from the entire PDF
    if (!extractedText.trim()) {
      extractedText = pdfText.replace(/[^\x20-\x7E\n\r]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    console.log('Extracted text length:', extractedText.length);
    
    if (extractedText.length < 100) {
      throw new Error('Could not extract sufficient text from PDF');
    }
    
    // Now analyze the extracted text with OpenAI
    return await analyzeCreditReport(extractedText);
    
  } catch (error) {
    console.error('PDF processing error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process PDF file',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
