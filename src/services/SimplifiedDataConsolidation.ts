import { supabase } from '@/integrations/supabase/client';
import { Logger } from '@/utils/logger';

export interface ConsolidationResult {
  text: string;
  confidence: number;
  method: string;
}

/**
 * Simplified Data Consolidation Service
 * Removes complex voting mechanisms and uses simple best-effort approach
 */
export class SimplifiedDataConsolidation {
  /**
   * Get the best extraction result based on confidence
   */
  static async getBestExtraction(reportId: string): Promise<ConsolidationResult | null> {
    try {
      // Get all extraction results
      const { data, error } = await supabase
        .from('pdf_extraction_results')
        .select('*')
        .eq('report_id', reportId)
        .order('confidence_score', { ascending: false })
        .limit(1);
      
      if (error || !data || data.length === 0) {
        Logger.warn('No extraction results found for consolidation');
        return null;
      }
      
      const best = data[0];
      
      return {
        text: best.extracted_text,
        confidence: best.confidence_score,
        method: best.extraction_method
      };
      
    } catch (error) {
      Logger.error('Failed to get best extraction:', error);
      return null;
    }
  }
  
  /**
   * Simple merge of multiple extractions
   * Takes the highest confidence text as primary and fills gaps from others
   */
  static async mergeExtractions(reportId: string): Promise<string> {
    try {
      const { data } = await supabase
        .from('pdf_extraction_results')
        .select('extracted_text, confidence_score')
        .eq('report_id', reportId)
        .order('confidence_score', { ascending: false });
      
      if (!data || data.length === 0) {
        return '';
      }
      
      // Use highest confidence as base
      let mergedText = data[0].extracted_text;
      
      // If base text is too short, try to combine with others
      if (mergedText.length < 1000 && data.length > 1) {
        for (let i = 1; i < Math.min(data.length, 3); i++) {
          const additionalText = data[i].extracted_text;
          
          // Only add text that seems to contain new information
          if (!this.isTextDuplicate(mergedText, additionalText)) {
            mergedText += '\n\n' + additionalText;
          }
        }
      }
      
      return mergedText;
      
    } catch (error) {
      Logger.error('Failed to merge extractions:', error);
      return '';
    }
  }
  
  /**
   * Check if text is duplicate (simple similarity check)
   */
  private static isTextDuplicate(text1: string, text2: string): boolean {
    // Simple check: if more than 50% of words in text2 appear in text1
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = text2.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const word of words2) {
      if (words1.has(word)) matches++;
    }
    
    return matches > words2.length * 0.5;
  }
  
  /**
   * Save consolidated result
   */
  static async saveConsolidation(
    reportId: string, 
    text: string, 
    confidence: number
  ): Promise<void> {
    await supabase
      .from('credit_reports')
      .update({
        raw_text: text,
        consolidation_confidence: confidence,
        consolidation_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);
  }
}