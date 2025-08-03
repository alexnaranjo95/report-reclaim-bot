import { Round } from '@/services/SessionService';

export interface RoundAccessibilityCheck {
  isAccessible: boolean;
  isCurrentRound: boolean;
  canGraduate: boolean;
  daysRemaining: number;
  hasMailResponses: boolean;
  lockReason?: string;
}

export const canGraduateToNextRound = (round: Round): boolean => {
  if (!round.sent_at) return false;
  
  const now = new Date();
  const lastSent = new Date(round.sent_at);
  const daysPassed = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
  const thirtyDaysPassed = daysPassed >= 30;

  const hasUploadedResponses = round.mail_responses && round.mail_responses.length > 0;

  return thirtyDaysPassed && hasUploadedResponses;
};

export const getRoundAccessibility = (
  targetRoundNumber: number,
  currentRoundNumber: number,
  rounds: Round[]
): RoundAccessibilityCheck => {
  // Round 1 is always accessible
  if (targetRoundNumber === 1) {
    return {
      isAccessible: true,
      isCurrentRound: targetRoundNumber === currentRoundNumber,
      canGraduate: false,
      daysRemaining: 0,
      hasMailResponses: true
    };
  }

  const isCurrentRound = targetRoundNumber === currentRoundNumber;
  
  // For all rounds beyond Round 1, check graduation criteria from previous round
  if (targetRoundNumber > 1) {
    const previousRound = rounds.find(r => r.round_number === targetRoundNumber - 1);
    
    if (!previousRound) {
      return {
        isAccessible: false,
        isCurrentRound: false,
        canGraduate: false,
        daysRemaining: 30,
        hasMailResponses: false,
        lockReason: 'Previous round not found'
      };
    }

    if (!previousRound.sent_at) {
      return {
        isAccessible: false,
        isCurrentRound: false,
        canGraduate: false,
        daysRemaining: 30,
        hasMailResponses: false,
        lockReason: 'Previous round not sent yet'
      };
    }

    const now = new Date();
    const lastSent = new Date(previousRound.sent_at);
    const daysPassed = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
    const daysRemaining = Math.max(0, 30 - Math.floor(daysPassed));
    const hasMailResponses = previousRound.mail_responses && previousRound.mail_responses.length > 0;
    const canGraduate = daysPassed >= 30 && hasMailResponses;

    let lockReason = '';
    if (daysRemaining > 0 && !hasMailResponses) {
      lockReason = `Wait ${daysRemaining} more days and upload mail responses`;
    } else if (daysRemaining > 0) {
      lockReason = `Wait ${daysRemaining} more days`;
    } else if (!hasMailResponses) {
      lockReason = 'Upload mail responses from creditors';
    }

    return {
      isAccessible: canGraduate,
      isCurrentRound: false,
      canGraduate,
      daysRemaining,
      hasMailResponses,
      lockReason: canGraduate ? undefined : lockReason
    };
  }

  // This should not be reached since Round 1 is handled above
  // and all other rounds are checked for graduation criteria
  return {
    isAccessible: false,
    isCurrentRound,
    canGraduate: false,
    daysRemaining: 30,
    hasMailResponses: false,
    lockReason: 'Unknown round accessibility state'
  };
};