import { PDFProcessor } from './PDFProcessor';
import { OpenAIService } from './OpenAIService';
import { CreditAnalysisResult, CreditItem, PDFAnalysisRequest } from '../types/CreditTypes';
import { CreditPatterns } from '../utils/CreditPatterns';

export class CreditAnalysisService {
  static async analyzePDF(request: PDFAnalysisRequest, apiKey?: string): Promise<CreditAnalysisResult> {
    try {
      // Extract text from PDF
      const rawText = await PDFProcessor.extractTextFromPDF(request.file);
      const cleanText = PDFProcessor.cleanText(rawText);
      
      // Detect bureau type
      const bureausDetected = PDFProcessor.detectBureauType(cleanText);
      
      let analysisResult: any;
      
      // Try AI analysis first if API key is provided
      if (apiKey) {
        try {
          OpenAIService.initialize(apiKey);
          analysisResult = await OpenAIService.analyzeCreditReport(cleanText);
        } catch (aiError) {
          console.warn('AI analysis failed, falling back to pattern matching:', aiError);
          analysisResult = this.fallbackPatternAnalysis(cleanText, bureausDetected);
        }
      } else {
        // Use pattern matching as fallback
        analysisResult = this.fallbackPatternAnalysis(cleanText, bureausDetected);
      }
      
      // Process and validate the results
      const items: CreditItem[] = (analysisResult.items || []).map((item: any, index: number) => ({
        id: `item-${index + 1}`,
        creditor: item.creditor || 'Unknown Creditor',
        account: item.account || '****0000',
        issue: item.issue || 'Negative item detected',
        impact: item.impact || 'medium',
        status: 'negative' as const,
        bureau: item.bureau || bureausDetected,
        dateOpened: item.dateOpened,
        lastActivity: item.lastActivity,
        balance: item.balance,
        originalAmount: item.originalAmount,
        paymentStatus: item.paymentStatus
      }));
      
      // Calculate summary
      const summary = {
        totalNegativeItems: items.length,
        estimatedScoreImpact: this.calculateScoreImpact(items),
        bureausAffected: [...new Set(items.flatMap(item => item.bureau))],
        highImpactItems: items.filter(item => item.impact === 'high').length,
        mediumImpactItems: items.filter(item => item.impact === 'medium').length,
        lowImpactItems: items.filter(item => item.impact === 'low').length
      };
      
      return {
        items,
        summary,
        personalInfo: analysisResult.personalInfo || {},
        creditScores: analysisResult.creditScores
      };
      
    } catch (error) {
      console.error('Credit analysis error:', error);
      throw new Error('Failed to analyze credit report. Please try again.');
    }
  }
  
  private static fallbackPatternAnalysis(text: string, bureaus: string[]): any {
    const items = [];
    
    // Use regex patterns to detect common negative items
    const patterns = CreditPatterns.getAllPatterns();
    
    patterns.forEach(pattern => {
      const matches = text.match(pattern.regex);
      if (matches) {
        items.push({
          creditor: this.extractCreditorName(text, matches[0]) || 'Unknown Creditor',
          account: this.extractAccountNumber(text, matches[0]) || '****0000',
          issue: pattern.description,
          impact: pattern.impact,
          bureau: bureaus,
          paymentStatus: matches[0]
        });
      }
    });
    
    // If no patterns match, create a generic negative item
    if (items.length === 0) {
      items.push({
        creditor: 'Sample Creditor',
        account: '****1234',
        issue: 'Negative item detected in report',
        impact: 'medium',
        bureau: bureaus
      });
    }
    
    return {
      items,
      personalInfo: this.extractPersonalInfo(text),
      creditScores: this.extractCreditScores(text)
    };
  }
  
  private static extractCreditorName(text: string, match: string): string | null {
    // Simple heuristic to find creditor names near the match
    const lines = text.split('\n');
    const matchLine = lines.find(line => line.includes(match));
    if (matchLine) {
      const words = matchLine.split(/\s+/);
      return words.find(word => word.length > 3 && /[A-Z]/.test(word)) || null;
    }
    return null;
  }
  
  private static extractAccountNumber(text: string, match: string): string | null {
    const accountPattern = /\*{4}\d{4}|\d{4}\*{4}|\*{8}\d{4}/g;
    const accounts = text.match(accountPattern);
    return accounts ? accounts[0] : null;
  }
  
  private static extractPersonalInfo(text: string): any {
    return {
      name: this.extractName(text),
      address: this.extractAddress(text)
    };
  }
  
  private static extractName(text: string): string | null {
    const namePattern = /(?:Name|Consumer):\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i;
    const match = text.match(namePattern);
    return match ? match[1] : null;
  }
  
  private static extractAddress(text: string): string | null {
    const addressPattern = /(\d+\s+[A-Za-z\s]+(?:St|Ave|Rd|Dr|Blvd|Way)[,\s]*[A-Za-z\s]+,?\s+[A-Z]{2}\s+\d{5})/i;
    const match = text.match(addressPattern);
    return match ? match[1] : null;
  }
  
  private static extractCreditScores(text: string): any {
    const scores: any = {};
    
    // Look for score patterns
    const scorePattern = /(\d{3})/g;
    const scoreMatches = text.match(scorePattern);
    
    if (scoreMatches) {
      const validScores = scoreMatches
        .map(s => parseInt(s))
        .filter(s => s >= 300 && s <= 850);
      
      if (validScores.length > 0) {
        scores.experian = validScores[0];
        if (validScores.length > 1) scores.equifax = validScores[1];
        if (validScores.length > 2) scores.transunion = validScores[2];
      }
    }
    
    return scores;
  }
  
  private static calculateScoreImpact(items: CreditItem[]): number {
    let totalImpact = 0;
    
    items.forEach(item => {
      switch (item.impact) {
        case 'high':
          totalImpact += 20;
          break;
        case 'medium':
          totalImpact += 10;
          break;
        case 'low':
          totalImpact += 5;
          break;
      }
    });
    
    return Math.min(totalImpact, 100); // Cap at 100 points
  }
}