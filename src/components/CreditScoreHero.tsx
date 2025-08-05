import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface CreditScore {
  score: number;
  rank: string;
  factors: string[];
}

interface CreditScores {
  transUnion?: CreditScore;
  experian?: CreditScore;
  equifax?: CreditScore;
}

interface CreditScoreHeroProps {
  creditScores: CreditScores;
}

export const CreditScoreHero: React.FC<CreditScoreHeroProps> = ({ creditScores }) => {
  const getScoreColor = (score: number) => {
    if (score >= 700) return 'text-success';
    if (score >= 600) return 'text-warning';
    return 'text-danger';
  };

  const getScoreGradient = (score: number) => {
    if (score >= 700) return 'from-success to-success-light';
    if (score >= 600) return 'from-warning to-amber-400';
    return 'from-danger to-red-400';
  };

  const getScoreBadgeVariant = (rank: string) => {
    const lowerRank = rank.toLowerCase();
    if (lowerRank.includes('excellent') || lowerRank.includes('great')) return 'default';
    if (lowerRank.includes('good') || lowerRank.includes('fair')) return 'secondary';
    return 'destructive';
  };

  const ScoreCircle: React.FC<{ score: number; bureau: string; rank: string }> = ({ score, bureau, rank }) => {
    const percentage = (score / 850) * 100;
    const circumference = 2 * Math.PI * 45; // radius = 45
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="hsl(var(--border))"
            strokeWidth="6"
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="currentColor"
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`transition-all duration-1000 ease-out ${getScoreColor(score)}`}
          />
        </svg>
        
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
            {score}
          </div>
          <div className="text-xs text-muted-foreground text-center leading-tight">
            {bureau}
          </div>
        </div>
      </div>
    );
  };

  const bureauScores = [
    { key: 'transUnion', name: 'TransUnion', data: creditScores.transUnion },
    { key: 'experian', name: 'Experian', data: creditScores.experian },
    { key: 'equifax', name: 'Equifax', data: creditScores.equifax },
  ];

  const availableScores = bureauScores.filter(bureau => bureau.data);
  const averageScore = availableScores.length > 0 
    ? Math.round(availableScores.reduce((sum, bureau) => sum + bureau.data!.score, 0) / availableScores.length)
    : 0;

  return (
    <Card className="shadow-elevated bg-gradient-card">
      <CardHeader>
        <CardTitle className="text-center text-2xl">Credit Score Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-center">
          {/* Individual Bureau Scores */}
          {bureauScores.map((bureau) => (
            <div key={bureau.key} className="text-center">
              {bureau.data ? (
                <div className="space-y-3">
                  <ScoreCircle 
                    score={bureau.data.score} 
                    bureau={bureau.name}
                    rank={bureau.data.rank}
                  />
                  <Badge variant={getScoreBadgeVariant(bureau.data.rank)}>
                    {bureau.data.rank}
                  </Badge>
                  {bureau.data.factors.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Top Factor: {bureau.data.factors[0]}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-32 h-32 mx-auto border-2 border-dashed border-border rounded-full flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                      <div className="text-xs text-muted-foreground">No Score</div>
                      <div className="text-xs text-muted-foreground">{bureau.name}</div>
                    </div>
                  </div>
                  <Badge variant="outline">Not Available</Badge>
                </div>
              )}
            </div>
          ))}

          {/* Average Score Summary */}
          {availableScores.length > 0 && (
            <div className="text-center lg:border-l lg:border-border lg:pl-8">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Average Score</h3>
                <div className={`text-4xl font-bold ${getScoreColor(averageScore)}`}>
                  {averageScore}
                </div>
                <div className="text-sm text-muted-foreground">
                  Based on {availableScores.length} bureau{availableScores.length !== 1 ? 's' : ''}
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Score Range: 300-850</div>
                  <div className="flex items-center gap-1 text-xs">
                    {averageScore >= 700 ? (
                      <TrendingUp className="h-3 w-3 text-success" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-warning" />
                    )}
                    <span className={averageScore >= 700 ? 'text-success' : 'text-warning'}>
                      {averageScore >= 700 ? 'Good Credit Health' : 'Room for Improvement'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Risk Factors Summary */}
        {availableScores.some(bureau => bureau.data?.factors.length) && (
          <div className="mt-8 pt-6 border-t border-border">
            <h4 className="font-medium mb-4">Key Risk Factors</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bureauScores.map((bureau) => (
                bureau.data?.factors.length ? (
                  <div key={bureau.key} className="space-y-2">
                    <div className="font-medium text-sm">{bureau.name}</div>
                    <ul className="space-y-1">
                      {bureau.data.factors.slice(0, 3).map((factor, index) => (
                        <li key={index} className="text-xs text-muted-foreground flex items-start gap-1">
                          <span className="text-warning">•</span>
                          <span>{factor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};