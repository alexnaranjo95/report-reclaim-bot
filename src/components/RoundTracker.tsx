import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Calendar, Target, CheckCircle } from 'lucide-react';

interface RoundTrackerProps {
  currentRound: number;
  totalRounds: number;
}

export const RoundTracker = ({ currentRound, totalRounds }: RoundTrackerProps) => {
  const progressPercentage = (currentRound / totalRounds) * 100;
  
  return (
    <Card className="bg-gradient-primary shadow-elevated text-primary-foreground animate-slide-in">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">Round Progress</CardTitle>
          <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
            {currentRound}/{totalRounds}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-primary-foreground/80">
            <span>Round {currentRound}</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <Progress 
            value={progressPercentage} 
            className="h-2 bg-white/20"
          />
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4" />
            <span>Month {currentRound} of 12</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4" />
            <span>Credit Repair Journey</span>
          </div>

          {currentRound > 1 && (
            <div className="flex items-center gap-2 text-sm text-success-glow">
              <CheckCircle className="h-4 w-4" />
              <span>{currentRound - 1} rounds completed</span>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-white/20">
          <div className="text-xs text-primary-foreground/70">
            Next milestone: Round {Math.min(currentRound + 1, totalRounds)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};