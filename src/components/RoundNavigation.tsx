import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Round } from '@/services/SessionService';

interface RoundNavigationProps {
  rounds: Round[];
  currentRound: number;
  onRoundSelect: (roundNumber: number, round: Round) => void;
  onCreateNewRound: () => void;
}

export const RoundNavigation: React.FC<RoundNavigationProps> = ({
  rounds,
  currentRound,
  onRoundSelect,
  onCreateNewRound
}) => {
  const getRoundStatusBadge = (round: Round) => {
    switch (round.status) {
      case 'sent':
        return <Badge className="bg-green-500 text-white">Sent</Badge>;
      case 'saved':
        return <Badge className="bg-yellow-500 text-white">Open</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge variant="outline">Active</Badge>;
    }
  };

  const getRoundActionButton = (round: Round) => {
    if (round.status === 'sent') {
      return getRoundStatusBadge(round);
    }
    
    if (round.status === 'saved') {
      return (
        <Button
          size="sm"
          variant="outline"
          className="bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100"
          onClick={() => onRoundSelect(round.round_number, round)}
        >
          Open
        </Button>
      );
    }

    return getRoundStatusBadge(round);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Dispute Rounds</h3>
        <Button 
          onClick={onCreateNewRound}
          size="sm"
          variant="outline"
        >
          + New Round
        </Button>
      </div>
      
      <div className="space-y-3">
        {rounds.map((round) => (
          <div
            key={round.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              round.round_number === currentRound
                ? 'bg-blue-50 border-blue-200'
                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">Round {round.round_number}</span>
              {round.round_number === currentRound && (
                <Badge variant="outline" className="text-xs">Current</Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {getRoundActionButton(round)}
            </div>
          </div>
        ))}
        
        {rounds.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            No rounds yet. Start by creating your first round.
          </div>
        )}
      </div>
    </Card>
  );
};