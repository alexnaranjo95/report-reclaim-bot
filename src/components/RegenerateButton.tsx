import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Round } from '@/services/SessionService';

interface RegenerateButtonProps {
  currentRound: number;
  sessionId?: string;
  onRegenerate: () => void;
  roundData?: Round;
}

export const RegenerateButton: React.FC<RegenerateButtonProps> = ({
  currentRound,
  sessionId,
  onRegenerate,
  roundData
}) => {
  const [canRegenerate, setCanRegenerate] = useState(false);
  const [regenerationCount, setRegenerationCount] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { toast } = useToast();

  // Check regeneration eligibility
  useEffect(() => {
    const checkRegenerationEligibility = () => {
      if (!roundData) {
        setCanRegenerate(true);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const lastRegenDate = roundData.last_regeneration_date;
      const count = roundData.regeneration_count || 0;
      const isSent = roundData.sent_at !== null && roundData.sent_at !== undefined;

      // If round is sent, hide regenerate button
      if (isSent) {
        setCanRegenerate(false);
        return;
      }

      // Check daily limit
      if (lastRegenDate === today && count >= 1) {
        setCanRegenerate(false);
        setRegenerationCount(count);
      } else {
        setCanRegenerate(true);
        setRegenerationCount(count);
      }
    };

    checkRegenerationEligibility();
  }, [roundData]);

  const handleRegenerate = async () => {
    if (!sessionId || !canRegenerate) return;

    setIsRegenerating(true);
    try {
      // Update regeneration tracking in database
      const today = new Date().toISOString().split('T')[0];
      const newCount = (roundData?.last_regeneration_date === today) 
        ? (roundData.regeneration_count || 0) + 1 
        : 1;

      const { error } = await supabase
        .from('rounds')
        .update({
          regeneration_count: newCount,
          last_regeneration_date: today
        })
        .eq('id', roundData?.id);

      if (error) throw error;

      // Call the regeneration function
      await onRegenerate();

      // Update local state
      setRegenerationCount(newCount);
      setCanRegenerate(newCount < 1); // Only allow 1 per day

      toast({
        title: "Round Regenerated",
        description: `Round ${currentRound} has been regenerated. ${1 - newCount} regeneration(s) remaining today.`,
      });

    } catch (error) {
      console.error('Regeneration failed:', error);
      toast({
        title: "Regeneration Failed",
        description: "Failed to regenerate round. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  // Don't show button if round is sent
  if (roundData?.sent_at) {
    return null;
  }

  const isDisabled = !canRegenerate || isRegenerating;
  const buttonText = isRegenerating ? 'Regenerating...' : 'Regenerate';
  
  // Show different tooltip messages based on state
  let tooltipMessage = '';
  if (roundData?.last_regeneration_date === new Date().toISOString().split('T')[0] && regenerationCount >= 1) {
    tooltipMessage = 'Daily regeneration limit reached (1 per day)';
  } else if (roundData?.sent_at) {
    tooltipMessage = 'Cannot regenerate sent rounds';
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleRegenerate}
      disabled={isDisabled}
      className="flex items-center gap-1 border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      title={tooltipMessage}
    >
      <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
      {buttonText}
    </Button>
  );
};