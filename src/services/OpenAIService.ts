
import { supabase } from '@/integrations/supabase/client';

export class OpenAIService {
  static async analyzeCreditReport(reportText: string): Promise<any> {
    try {
      // Check authentication first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated. Please log in.');
      }
      
      console.log('Analyzing credit report with authenticated session...');
      
      const { data, error } = await supabase.functions.invoke('openai-analysis', {
        body: {
          action: 'analyzeCreditReport',
          data: { reportText }
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Failed to analyze credit report: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('OpenAI analysis error:', error);
      if (error.message.includes('not authenticated')) {
        throw error; // Re-throw auth errors as-is
      }
      throw new Error('Failed to analyze credit report with AI');
    }
  }

  static async generateDisputeLetter(
    creditor: string,
    items: string[],
    type: string
  ): Promise<string> {
    try {
      // Check authentication first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated. Please log in.');
      }
      
      console.log('Generating dispute letter with authenticated session...');
      
      const { data, error } = await supabase.functions.invoke('openai-analysis', {
        body: {
          action: 'generateDisputeLetter',
          data: { creditor, items, type }
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Failed to generate dispute letter: ${error.message}`);
      }

      return data.letter;
    } catch (error) {
      console.error('Letter generation error:', error);
      if (error.message.includes('not authenticated')) {
        throw error; // Re-throw auth errors as-is
      }
      throw new Error('Failed to generate dispute letter');
    }
  }
}
