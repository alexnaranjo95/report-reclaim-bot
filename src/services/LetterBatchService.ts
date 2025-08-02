import { supabase } from '@/integrations/supabase/client';
import { SessionService } from './SessionService';
import { DisputeLetter } from '@/types/CreditTypes';

export interface LetterBatch {
  round: number;
  letters: DisputeLetter[];
  generatedAt: string;
  version: number;
  archived: boolean;
  sessionId: string;
  roundId: string;
}

export interface LetterBatchResponse {
  id: string;
  round_number: number;
  letters_data: DisputeLetter[];
  generated_at: string;
  version: number;
  archived: boolean;
  session_id: string;
  round_id: string;
  created_at: string;
  updated_at: string;
}

export class LetterBatchService {
  private static STORAGE_KEY = 'lettersByRound';

  /**
   * Save letter batch to both database and localStorage
   */
  static async saveLetterBatch(
    sessionId: string,
    roundNumber: number,
    letters: DisputeLetter[]
  ): Promise<LetterBatch> {
    try {
      // Get or create round
      const rounds = await SessionService.getRounds(sessionId);
      let currentRound = rounds.find(r => r.round_number === roundNumber);
      
      if (!currentRound) {
        currentRound = await SessionService.createRound(sessionId, roundNumber);
      }

      // Check for existing batch to determine version
      const existingBatches = await this.getLetterBatchesForRound(currentRound.id);
      const latestVersion = existingBatches.length > 0 
        ? Math.max(...existingBatches.map(b => b.version)) 
        : 0;
      const newVersion = latestVersion + 1;

      // Archive previous versions if regenerating
      if (existingBatches.length > 0) {
        await this.archivePreviousVersions(currentRound.id);
      }

      // Create batch object
      const batch: LetterBatch = {
        round: roundNumber,
        letters,
        generatedAt: new Date().toISOString(),
        version: newVersion,
        archived: false,
        sessionId,
        roundId: currentRound.id
      };

      // Save to database via migration-created table
      const { data, error } = await supabase
        .from('letter_batches')
        .insert([{
          round_id: currentRound.id,
          session_id: sessionId,
          round_number: roundNumber,
          letters_data: letters as any,
          generated_at: batch.generatedAt,
          version: newVersion,
          archived: false
        }])
        .select()
        .single();

      if (error) {
        console.error('Failed to save letter batch to database:', error);
        throw new Error('Failed to save letters to database');
      }

      // Save individual letters to letters table for compatibility
      for (const letter of letters) {
        await SessionService.saveLetter({
          round_id: currentRound.id,
          creditor: letter.creditor,
          bureau: letter.bureau,
          items: letter.items,
          content: letter.content,
          status: letter.status === 'ready' ? 'draft' : 'draft',
          type: letter.type,
          user_id: (await supabase.auth.getUser()).data.user?.id || '',
          version: newVersion
        });
      }

      // Save to localStorage for offline resilience
      this.saveToLocalStorage(batch);

      return batch;
    } catch (error) {
      console.error('Error saving letter batch:', error);
      throw error;
    }
  }

  /**
   * Get letter batch for specific round
   */
  static async getLetterBatch(roundId: string): Promise<LetterBatch | null> {
    try {
      const { data, error } = await supabase
        .from('letter_batches')
        .select('*')
        .eq('round_id', roundId)
        .eq('archived', false)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return this.mapResponseToBatch(data);
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
      const { data, error } = await supabase
        .from('letter_batches')
        .select('*')
        .eq('session_id', sessionId)
        .eq('archived', false)
        .order('round_number', { ascending: true });

      if (error) {
        console.error('Error getting letter batches:', error);
        return {};
      }

      const batchesByRound: Record<number, LetterBatch> = {};
      
      for (const batch of data) {
        const roundNumber = batch.round_number;
        if (!batchesByRound[roundNumber] || batch.version > batchesByRound[roundNumber].version) {
          batchesByRound[roundNumber] = this.mapResponseToBatch(batch);
        }
      }

      // Also save to localStorage for offline access
      for (const batch of Object.values(batchesByRound)) {
        this.saveToLocalStorage(batch);
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
  static getFromLocalStorage(): Record<number, LetterBatch> {
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
      existing[batch.round] = batch;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  /**
   * Archive previous versions of letter batches for a round
   */
  private static async archivePreviousVersions(roundId: string): Promise<void> {
    const { error } = await supabase
      .from('letter_batches')
      .update({ archived: true })
      .eq('round_id', roundId)
      .eq('archived', false);

    if (error) {
      console.error('Error archiving previous versions:', error);
    }
  }

  /**
   * Get all versions of letter batches for a round (for audit)
   */
  private static async getLetterBatchesForRound(roundId: string): Promise<LetterBatch[]> {
    const { data, error } = await supabase
      .from('letter_batches')
      .select('*')
      .eq('round_id', roundId)
      .order('version', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(batch => this.mapResponseToBatch(batch));
  }

  /**
   * Map database response to LetterBatch interface
   */
  private static mapResponseToBatch(data: LetterBatchResponse): LetterBatch {
    return {
      round: data.round_number,
      letters: data.letters_data,
      generatedAt: data.generated_at,
      version: data.version,
      archived: data.archived,
      sessionId: data.session_id,
      roundId: data.round_id
    };
  }

  /**
   * Hydrate UI state from database and localStorage
   */
  static async hydrateLetterBatches(sessionId: string): Promise<Record<number, LetterBatch>> {
    try {
      // Try to get from database first
      const dbBatches = await this.getAllLetterBatches(sessionId);
      
      // Fallback to localStorage if database is unavailable
      if (Object.keys(dbBatches).length === 0) {
        return this.getFromLocalStorage();
      }

      return dbBatches;
    } catch (error) {
      console.error('Error hydrating letter batches:', error);
      // Fallback to localStorage
      return this.getFromLocalStorage();
    }
  }

  /**
   * Clear localStorage (for testing or reset)
   */
  static clearLocalStorage(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}