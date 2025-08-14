import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CreditScore } from '../../schema';

interface ScoresProps {
  data: CreditScore[];
}

export const Scores: React.FC<ScoresProps> = ({ data }) => {
  const getScoreColor = (score: number) => {
    if (score >= 800) return 'bg-green-600';
    if (score >= 740) return 'bg-green-500';
    if (score >= 670) return 'bg-yellow-500';
    if (score >= 580) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreCategory = (score: number) => {
    if (score >= 800) return 'Exceptional';
    if (score >= 740) return 'Very Good';
    if (score >= 670) return 'Good';
    if (score >= 580) return 'Fair';
    return 'Poor';
  };

  return (
    <section aria-labelledby="credit-scores-header">
      <Card>
        <CardHeader>
          <CardTitle id="credit-scores-header">Credit Scores</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-muted-foreground">No credit scores available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {data.map((score, i) => (
                <div key={i} className="text-center space-y-2">
                  <h3 className="font-semibold text-lg">{score.bureau}</h3>
                  
                  {score.score ? (
                    <>
                      <div className="relative w-32 h-32 mx-auto">
                        <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-muted"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          />
                          <path
                            className={getScoreColor(score.score)}
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeDasharray={`${(score.score / 850) * 100}, 100`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold">{score.score}</span>
                          <span className="text-xs text-muted-foreground">/ 850</span>
                        </div>
                      </div>
                      
                      <Badge variant="secondary">
                        {getScoreCategory(score.score)}
                      </Badge>
                    </>
                  ) : (
                    <div className="w-32 h-32 mx-auto flex items-center justify-center border-2 border-dashed border-muted rounded-full">
                      <span className="text-muted-foreground">N/A</span>
                    </div>
                  )}
                  
                  {score.date && (
                    <p className="text-xs text-muted-foreground">
                      As of {score.date}
                    </p>
                  )}
                  
                  {score.model && (
                    <p className="text-xs text-muted-foreground">
                      Model: {score.model}
                    </p>
                  )}
                  
                  {score.factors && score.factors.length > 0 && (
                    <div className="text-left">
                      <p className="text-xs font-medium mb-1">Key Factors:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {score.factors.slice(0, 3).map((factor, fi) => (
                          <li key={fi}>• {factor}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};