import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SessionService, Session, Round, Letter } from '@/services/SessionService';
import { CheckCircle, Clock, FileText, Play, Pause, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SessionListProps {
  onSelectSession: (session: Session) => void;
  selectedSessionId?: string;
  onCreateNew: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({
  onSelectSession,
  selectedSessionId,
  onCreateNew
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionRounds, setSessionRounds] = useState<Record<string, Round[]>>({});
  const [sessionLetters, setSessionLetters] = useState<Record<string, Letter[]>>({});

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await SessionService.getSessions();
      setSessions(data);
      
      // Load rounds and letters for each session
      const roundsData: Record<string, Round[]> = {};
      const lettersData: Record<string, Letter[]> = {};
      
      for (const session of data) {
        const rounds = await SessionService.getRounds(session.id);
        roundsData[session.id] = rounds;
        
        for (const round of rounds) {
          const letters = await SessionService.getLetters(round.id);
          lettersData[round.id] = letters;
        }
      }
      
      setSessionRounds(roundsData);
      setSessionLetters(lettersData);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSessionProgress = (sessionId: string) => {
    const rounds = sessionRounds[sessionId] || [];
    const totalLetters = rounds.reduce((total, round) => {
      const letters = sessionLetters[round.id] || [];
      return total + letters.length;
    }, 0);
    
    const sentLetters = rounds.reduce((total, round) => {
      const letters = sessionLetters[round.id] || [];
      return total + letters.filter(letter => letter.status === 'sent').length;
    }, 0);

    return { total: totalLetters, sent: sentLetters };
  };

  const getCurrentRoundNumber = (sessionId: string) => {
    const rounds = sessionRounds[sessionId] || [];
    const activeRound = rounds.find(r => r.status === 'active');
    return activeRound ? activeRound.round_number : rounds.length;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      default:
        return <Play className="h-4 w-4 text-blue-500" />;
    }
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading sessions...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Sessions
          </div>
          <Button size="sm" onClick={onCreateNew}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="p-4 space-y-3">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No sessions yet</p>
                <p className="text-sm">Create your first credit repair session</p>
              </div>
            ) : (
              sessions.map((session) => {
                const progress = getSessionProgress(session.id);
                const currentRound = getCurrentRoundNumber(session.id);
                const isSelected = selectedSessionId === session.id;

                return (
                  <div key={session.id}>
                    <div
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => onSelectSession(session)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(session.status)}
                          <h4 className="font-medium text-sm truncate">{session.name}</h4>
                        </div>
                         <Badge variant="secondary" className="text-xs">
                          Round {currentRound} of 12
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Letters: {progress.sent}/{progress.total}</span>
                          <span>{formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}</span>
                        </div>
                        
                        {progress.total > 0 && (
                          <div className="w-full bg-secondary rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full transition-all"
                              style={{
                                width: `${(progress.sent / progress.total) * 100}%`
                              }}
                            />
                          </div>
                        )}
                        
                        <Badge 
                          variant={session.status === 'active' ? 'default' : session.status === 'completed' ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {session.status}
                        </Badge>
                      </div>
                    </div>
                    {session !== sessions[sessions.length - 1] && <Separator className="my-2" />}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};