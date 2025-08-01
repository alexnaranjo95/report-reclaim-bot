export interface CreditPattern {
  regex: RegExp;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export class CreditPatterns {
  private static patterns: CreditPattern[] = [
    // Late payments
    {
      regex: /30\s*days?\s*late|30\s*day\s*delinquent/gi,
      description: 'Late payment (30 days)',
      impact: 'low'
    },
    {
      regex: /60\s*days?\s*late|60\s*day\s*delinquent/gi,
      description: 'Late payment (60 days)',
      impact: 'medium'
    },
    {
      regex: /90\s*days?\s*late|90\s*day\s*delinquent/gi,
      description: 'Late payment (90+ days)',
      impact: 'high'
    },
    
    // Collections
    {
      regex: /collection|collections|collect/gi,
      description: 'Collection account',
      impact: 'high'
    },
    
    // Charge-offs
    {
      regex: /charge[\s-]*off|chargeoff|charged[\s-]*off/gi,
      description: 'Charge-off account',
      impact: 'high'
    },
    
    // Bankruptcy
    {
      regex: /bankruptcy|chapter\s*7|chapter\s*11|chapter\s*13|bankrupt/gi,
      description: 'Bankruptcy filing',
      impact: 'high'
    },
    
    // Foreclosure
    {
      regex: /foreclosure|foreclosed/gi,
      description: 'Foreclosure',
      impact: 'high'
    },
    
    // Judgments
    {
      regex: /judgment|judgement|civil\s*judgment/gi,
      description: 'Civil judgment',
      impact: 'high'
    },
    
    // Tax liens
    {
      regex: /tax\s*lien|federal\s*tax|state\s*tax/gi,
      description: 'Tax lien',
      impact: 'high'
    },
    
    // Repossession
    {
      regex: /repossession|repossessed|repo/gi,
      description: 'Repossession',
      impact: 'high'
    },
    
    // High utilization
    {
      regex: /utilization|over\s*limit|overlimit/gi,
      description: 'High credit utilization',
      impact: 'medium'
    },
    
    // Account disputes
    {
      regex: /dispute|disputed|not\s*mine|unauthorized/gi,
      description: 'Disputed account',
      impact: 'medium'
    },
    
    // Incorrect information
    {
      regex: /incorrect|inaccurate|wrong|error/gi,
      description: 'Incorrect information',
      impact: 'low'
    }
  ];

  static getAllPatterns(): CreditPattern[] {
    return this.patterns;
  }

  static getPatternsByImpact(impact: 'high' | 'medium' | 'low'): CreditPattern[] {
    return this.patterns.filter(pattern => pattern.impact === impact);
  }

  static findMatches(text: string, impact?: 'high' | 'medium' | 'low'): Array<{ pattern: CreditPattern; matches: RegExpMatchArray }> {
    const patternsToCheck = impact ? this.getPatternsByImpact(impact) : this.patterns;
    const results = [];

    for (const pattern of patternsToCheck) {
      const matches = text.match(pattern.regex);
      if (matches) {
        results.push({ pattern, matches });
      }
    }

    return results;
  }
}