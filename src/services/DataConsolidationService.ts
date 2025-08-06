import { supabase } from '@/integrations/supabase/client';

export interface ExtractionResult {
  id: string;
  report_id: string;
  extraction_method: string;
  extracted_text: string;
  processing_time_ms: number;
  character_count: number;
  word_count: number;
  confidence_score: number;
  has_structured_data: boolean;
  extraction_metadata: any;
  created_at: string;
}

export interface ConsolidationMetadata {
  id: string;
  report_id: string;
  primary_source: string;
  consolidation_strategy: string;
  confidence_level: number;
  field_sources: any;
  conflict_count: number;
  requires_human_review: boolean;
  consolidation_notes: string;
  processed_at: string;
}

export class DataConsolidationService {
  /**
   * Get all extraction results for a report
   */
  static async getExtractionResults(reportId: string): Promise<ExtractionResult[]> {
    const { data, error } = await supabase
      .from('extraction_results')
      .select('*')
      .eq('report_id', reportId)
      .order('confidence_score', { ascending: false });

    if (error) {
      throw new Error(`Failed to get extraction results: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get consolidation metadata for a report
   */
  static async getConsolidationMetadata(reportId: string): Promise<ConsolidationMetadata | null> {
    const { data, error } = await supabase
      .from('consolidation_metadata')
      .select('*')
      .eq('report_id', reportId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      throw new Error(`Failed to get consolidation metadata: ${error.message}`);
    }

    return data;
  }

  /**
   * Compare multiple extraction results and highlight differences
   */
  static async compareExtractionResults(reportId: string): Promise<{
    results: ExtractionResult[];
    comparison: {
      similarities: string[];
      differences: Array<{
        field: string;
        values: Array<{
          method: string;
          value: string;
          confidence: number;
        }>;
      }>;
    };
  }> {
    const results = await this.getExtractionResults(reportId);

    if (results.length < 2) {
      return {
        results,
        comparison: {
          similarities: [],
          differences: []
        }
      };
    }

    // Perform basic text comparison
    const similarities: string[] = [];
    const differences: Array<{
      field: string;
      values: Array<{
        method: string;
        value: string;
        confidence: number;
      }>;
    }> = [];

    // Find common patterns across all extractions
    const commonPatterns = this.findCommonPatterns(results);
    similarities.push(...commonPatterns);

    // Find conflicting information
    const conflicts = this.findConflicts(results);
    differences.push(...conflicts);

    return {
      results,
      comparison: {
        similarities,
        differences
      }
    };
  }

  /**
   * Re-consolidate extraction results with different strategy
   */
  static async reconsolidate(
    reportId: string, 
    strategy: 'highest_confidence' | 'majority_vote' | 'manual_review'
  ): Promise<{
    consolidatedText: string;
    confidence: number;
    primaryMethod: string;
  }> {
    const results = await this.getExtractionResults(reportId);

    if (results.length === 0) {
      throw new Error('No extraction results found for consolidation');
    }

    let primaryResult: ExtractionResult;
    let consolidatedText: string;
    let overallConfidence: number;

    switch (strategy) {
      case 'highest_confidence':
        primaryResult = results.reduce((best, current) => 
          current.confidence_score > best.confidence_score ? current : best
        );
        consolidatedText = primaryResult.extracted_text;
        overallConfidence = primaryResult.confidence_score;
        break;

      case 'majority_vote':
        // Simple majority vote based on common patterns
        const patterns = this.findCommonPatterns(results);
        primaryResult = results[0]; // Default to first
        consolidatedText = this.mergeTextsByMajority(results);
        overallConfidence = Math.min(0.95, 
          results.reduce((sum, r) => sum + r.confidence_score, 0) / results.length
        );
        break;

      case 'manual_review':
        // Flag for manual review but use highest confidence as placeholder
        primaryResult = results.reduce((best, current) => 
          current.confidence_score > best.confidence_score ? current : best
        );
        consolidatedText = primaryResult.extracted_text;
        overallConfidence = 0.5; // Lower confidence for manual review
        break;

      default:
        throw new Error(`Unknown consolidation strategy: ${strategy}`);
    }

    // Update consolidation metadata
    await supabase
      .from('consolidation_metadata')
      .upsert({
        report_id: reportId,
        primary_source: primaryResult.extraction_method,
        consolidation_strategy: strategy,
        confidence_level: overallConfidence,
        field_sources: {
          strategy_used: strategy,
          total_sources: results.length,
          methods_available: results.map(r => r.extraction_method)
        },
        conflict_count: this.findConflicts(results).length,
        requires_human_review: strategy === 'manual_review' || overallConfidence < 0.7,
        consolidation_notes: `Re-consolidated using ${strategy} strategy`,
        processed_at: new Date().toISOString()
      });

    // Update credit report with new consolidated text
    await supabase
      .from('credit_reports')
      .update({
        raw_text: consolidatedText,
        consolidation_status: 'completed',
        consolidation_confidence: overallConfidence,
        primary_extraction_method: primaryResult.extraction_method
      })
      .eq('id', reportId);

    return {
      consolidatedText,
      confidence: overallConfidence,
      primaryMethod: primaryResult.extraction_method
    };
  }

  /**
   * Get extraction summary for admin dashboard
   */
  static async getExtractionSummary(timeRange: 'day' | 'week' | 'month' = 'day'): Promise<{
    totalExtractions: number;
    methodBreakdown: Array<{
      method: string;
      count: number;
      avgConfidence: number;
    }>;
    consolidationStats: {
      totalConsolidations: number;
      avgConfidence: number;
      requiresReview: number;
    };
  }> {
    const timeFilter = this.getTimeFilter(timeRange);

    // Get extraction method breakdown
    const { data: methodStats, error: methodError } = await supabase
      .from('extraction_results')
      .select('extraction_method, confidence_score')
      .gte('created_at', timeFilter);

    if (methodError) {
      throw new Error(`Failed to get method stats: ${methodError.message}`);
    }

    // Get consolidation stats
    const { data: consolidationStats, error: consolidationError } = await supabase
      .from('consolidation_metadata')
      .select('confidence_level, requires_human_review')
      .gte('processed_at', timeFilter);

    if (consolidationError) {
      throw new Error(`Failed to get consolidation stats: ${consolidationError.message}`);
    }

    // Process method breakdown
    const methodMap = new Map<string, { count: number; totalConfidence: number }>();
    
    methodStats?.forEach(stat => {
      const existing = methodMap.get(stat.extraction_method) || { count: 0, totalConfidence: 0 };
      methodMap.set(stat.extraction_method, {
        count: existing.count + 1,
        totalConfidence: existing.totalConfidence + stat.confidence_score
      });
    });

    const methodBreakdown = Array.from(methodMap.entries()).map(([method, data]) => ({
      method,
      count: data.count,
      avgConfidence: data.totalConfidence / data.count
    }));

    // Process consolidation stats
    const totalConsolidations = consolidationStats?.length || 0;
    const avgConfidence = totalConsolidations > 0 
      ? consolidationStats!.reduce((sum, stat) => sum + stat.confidence_level, 0) / totalConsolidations
      : 0;
    const requiresReview = consolidationStats?.filter(stat => stat.requires_human_review).length || 0;

    return {
      totalExtractions: methodStats?.length || 0,
      methodBreakdown,
      consolidationStats: {
        totalConsolidations,
        avgConfidence,
        requiresReview
      }
    };
  }

  private static findCommonPatterns(results: ExtractionResult[]): string[] {
    const patterns: string[] = [];
    
    if (results.length < 2) return patterns;

    // Find common credit report indicators
    const commonKeywords = ['credit report', 'personal information', 'account number', 'payment history'];
    
    for (const keyword of commonKeywords) {
      const foundInAll = results.every(result => 
        result.extracted_text.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (foundInAll) {
        patterns.push(`All extractions contain: ${keyword}`);
      }
    }

    return patterns;
  }

  private static findConflicts(results: ExtractionResult[]): Array<{
    field: string;
    values: Array<{
      method: string;
      value: string;
      confidence: number;
    }>;
  }> {
    const conflicts: Array<{
      field: string;
      values: Array<{
        method: string;
        value: string;
        confidence: number;
      }>;
    }> = [];

    // Simple conflict detection based on text length differences
    if (results.length > 1) {
      const lengths = results.map(r => ({
        method: r.extraction_method,
        value: `${r.character_count} characters`,
        confidence: r.confidence_score
      }));

      const minLength = Math.min(...results.map(r => r.character_count));
      const maxLength = Math.max(...results.map(r => r.character_count));

      // If there's a significant difference in extracted text length
      if ((maxLength - minLength) / minLength > 0.5) {
        conflicts.push({
          field: 'Text Length',
          values: lengths
        });
      }
    }

    return conflicts;
  }

  private static mergeTextsByMajority(results: ExtractionResult[]): string {
    // Simple implementation: use the median length text
    const sortedByLength = [...results].sort((a, b) => a.character_count - b.character_count);
    const medianIndex = Math.floor(sortedByLength.length / 2);
    return sortedByLength[medianIndex].extracted_text;
  }

  private static getTimeFilter(timeRange: 'day' | 'week' | 'month'): string {
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    
    switch (timeRange) {
      case 'day':
        return new Date(now.getTime() - msPerDay).toISOString();
      case 'week':
        return new Date(now.getTime() - (7 * msPerDay)).toISOString();
      case 'month':
        return new Date(now.getTime() - (30 * msPerDay)).toISOString();
      default:
        return new Date(now.getTime() - msPerDay).toISOString();
    }
  }
}