
import { supabase } from '@/integrations/supabase/client';

export class OpenAIService {
  static async analyzeCreditReport(reportText: string): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('openai-analysis', {
        body: {
          action: 'analyzeCreditReport',
          data: { reportText }
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error('Failed to analyze credit report with AI');
      }

      return data;
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
    try {
      const { data, error } = await supabase.functions.invoke('openai-analysis', {
        body: {
          action: 'generateDisputeLetter',
          data: { creditor, items, type }
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error('Failed to generate dispute letter');
      }

      return data.letter;
    } catch (error) {
      console.error('Letter generation error:', error);
      throw new Error('Failed to generate dispute letter');
    }
  }
}
