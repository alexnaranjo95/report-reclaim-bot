import OpenAI from 'openai';

export class OpenAIService {
  private static openai: OpenAI | null = null;

  static initialize(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  static async analyzeCreditReport(reportText: string): Promise<any> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized. Please provide API key.');
    }

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

Focus on identifying:
- Late payments (30, 60, 90+ days)
- Collections accounts
- Charge-offs
- Bankruptcies
- High credit utilization
- Incorrect information
- Fraudulent accounts

Rate impact as:
- high: Collections, charge-offs, bankruptcies, 90+ day lates
- medium: 60-day lates, high utilization
- low: 30-day lates, minor errors

Credit Report Text:
${reportText}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
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
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content);
    } catch (error) {
      console.error('OpenAI analysis error:', error);
      throw new Error('Failed to analyze credit report with AI');
    }
  }

  static async generateDisputeLetter(
    creditor: string,
    items: string[],
    type: string
  ): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

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

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
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
      });

      return response.choices[0]?.message?.content || 'Error generating letter';
    } catch (error) {
      console.error('Letter generation error:', error);
      throw new Error('Failed to generate dispute letter');
    }
  }
}