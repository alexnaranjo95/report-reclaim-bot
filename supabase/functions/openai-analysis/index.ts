
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();

    if (action === 'analyzeCreditReport') {
      return await analyzeCreditReport(data.reportText);
    } else if (action === 'generateDisputeLetter') {
      return await generateDisputeLetter(data.creditor, data.items, data.type);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
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
Analyze this credit report text and extract negative items. Return a JSON object with the following structure:

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
    "address": "Address if found"
  },
  "creditScores": {
    "experian": 0,
    "equifax": 0,
    "transunion": 0
  }
}

Focus on identifying NEGATIVE ITEMS ONLY:
- Late payments (30, 60, 90+ days late) - look for "LATE", "30 DAYS", "60 DAYS", "90 DAYS", payment history codes
- Collections accounts - look for "COLLECTION", "PLACED FOR COLLECTION", collection agencies
- Charge-offs - look for "CHARGE OFF", "CHARGED OFF", "PROFIT AND LOSS"
- Bankruptcies - look for "BANKRUPTCY", "CHAPTER 7", "CHAPTER 13", "BK"
- Repossessions - look for "REPOSSESSION", "REPO", "VOLUNTARY SURRENDER"
- Foreclosures - look for "FORECLOSURE", "REAL ESTATE OWNED"
- High credit utilization (>30%) - calculate utilization ratios
- Incorrect information - wrong dates, amounts, or account details
- Fraudulent accounts - accounts not opened by consumer

Rate impact as:
- high: Collections, charge-offs, bankruptcies, foreclosures, repossessions, 90+ day lates
- medium: 60-day lates, high utilization (>50%), multiple 30-day lates
- low: Single 30-day lates, minor errors, high utilization (30-50%)

Credit Report Text:
${reportText}
`;

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
          content: 'You are a credit repair expert. Analyze credit reports and identify negative items that can be disputed.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    }),
  });

  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('No response from OpenAI');
  }

  const content = data.choices[0].message.content;
  const analysisResult = JSON.parse(content);

  return new Response(JSON.stringify(analysisResult), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function generateDisputeLetter(creditor: string, items: string[], type: string) {
  const prompt = `
Generate a professional dispute letter for credit repair. 

Creditor: ${creditor}
Items to dispute: ${items.join(', ')}
Letter type: ${type}

The letter should be:
- Professional and formal
- Specific about the disputed items
- Request proper documentation/validation
- Include consumer rights references
- Be under 500 words

Format as a complete business letter with proper headers and closing.
`;

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
          content: 'You are a credit repair expert who writes effective dispute letters that comply with FCRA regulations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    }),
  });

  const data = await response.json();
  const letter = data.choices[0]?.message?.content || 'Error generating letter';

  return new Response(JSON.stringify({ letter }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
