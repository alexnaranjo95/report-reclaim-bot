import { DisputeLetter } from '@/types/CreditTypes';
import { secureStorage } from '@/utils/SecureStorage';

export interface LetterBatch {
  round: number;
  letters: DisputeLetter[];
  generatedAt: string;
  version: number;
  archived: boolean;
  sessionId: string;
  roundId: string;
}

export class LetterBatchService {
  private static STORAGE_KEY = 'lettersByRound';

  /**
   * Save letter batch to localStorage (will be extended to database once migration is approved)
   */
  static async saveLetterBatch(
    sessionId: string,
    roundNumber: number,
    letters: DisputeLetter[]
  ): Promise<LetterBatch> {
    try {
      // Get existing batches for this session
      const existingBatches = this.getFromLocalStorage();
      const sessionBatches = Object.values(existingBatches).filter(b => b.sessionId === sessionId);
      const existingRoundBatches = sessionBatches.filter(b => b.round === roundNumber);
      
      // Determine version
      const latestVersion = existingRoundBatches.length > 0 
        ? Math.max(...existingRoundBatches.map(b => b.version)) 
        : 0;
      const newVersion = latestVersion + 1;

      // Archive previous versions if regenerating
      if (existingRoundBatches.length > 0) {
        this.archivePreviousVersions(sessionId, roundNumber);
      }

      // Create batch object
      const batch: LetterBatch = {
        round: roundNumber,
        letters,
        generatedAt: new Date().toISOString(),
        version: newVersion,
        archived: false,
        sessionId,
        roundId: `${sessionId}-round-${roundNumber}` // Generate a consistent roundId
      };

      // Save to localStorage
      this.saveToLocalStorage(batch);

      console.log(`Letters for Round ${roundNumber} saved successfully.`);
      return batch;
    } catch (error) {
      console.error('Error saving letter batch:', error);
      throw error;
    }
  }

  /**
   * Get letter batch for specific round
   */
  static async getLetterBatch(sessionId: string, roundNumber: number): Promise<LetterBatch | null> {
    try {
      const stored = this.getFromLocalStorage();
      const sessionBatches = Object.values(stored).filter(
        b => b.sessionId === sessionId && b.round === roundNumber && !b.archived
      );
      
      if (sessionBatches.length === 0) {
        return null;
      }

      // Return the latest version
      return sessionBatches.reduce((latest, current) => 
        current.version > latest.version ? current : latest
      );
    } catch (error) {
      console.error('Error getting letter batch:', error);
      return null;
    }
  }

  /**
   * Get all letter batches for a session
   */
  static async getAllLetterBatches(sessionId: string): Promise<Record<number, LetterBatch>> {
    try {
      const stored = this.getFromLocalStorage();
      const batchesByRound: Record<number, LetterBatch> = {};
      
      // Get all batches for this session
      const sessionBatches = Object.values(stored).filter(
        b => b.sessionId === sessionId && !b.archived
      );

      // Group by round and keep only the latest version
      for (const batch of sessionBatches) {
        const roundNumber = batch.round;
        if (!batchesByRound[roundNumber] || batch.version > batchesByRound[roundNumber].version) {
          batchesByRound[roundNumber] = batch;
        }
      }

      return batchesByRound;
    } catch (error) {
      console.error('Error getting all letter batches:', error);
      return {};
    }
  }

  /**
   * Get letter batches from localStorage for offline access
   */
  static getFromLocalStorage(): Record<string, LetterBatch> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return {};
    }
  }

  /**
   * Save letter batch to localStorage
   */
  private static saveToLocalStorage(batch: LetterBatch): void {
    try {
      const existing = this.getFromLocalStorage();
      const key = `${batch.sessionId}-${batch.round}-v${batch.version}`;
      existing[key] = batch;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  /**
   * Archive previous versions of letter batches for a round
   */
  private static archivePreviousVersions(sessionId: string, roundNumber: number): void {
    try {
      const existing = this.getFromLocalStorage();
      
      // Mark all previous versions of this round as archived
      for (const [key, batch] of Object.entries(existing)) {
        if (batch.sessionId === sessionId && batch.round === roundNumber && !batch.archived) {
          existing[key] = { ...batch, archived: true };
        }
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));
    } catch (error) {
      console.error('Error archiving previous versions:', error);
    }
  }

  /**
   * Hydrate UI state from localStorage (will be extended to database once migration is approved)
   */
  static async hydrateLetterBatches(sessionId: string): Promise<Record<number, LetterBatch>> {
    try {
      return await this.getAllLetterBatches(sessionId);
    } catch (error) {
      console.error('Error hydrating letter batches:', error);
      return {};
    }
  }

  /**
   * Clear localStorage (for testing or reset)
   */
  static clearLocalStorage(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
