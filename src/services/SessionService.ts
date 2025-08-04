import { supabase } from '@/integrations/supabase/client';

export interface Session {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
  updated_at: string;
  analysis_data?: any; // Credit analysis types removed
  user_id: string;
}

export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  status: 'active' | 'completed' | 'locked';
  created_at: string;
  completed_at?: string;
  can_start_at?: string;
  user_id: string;
  last_regeneration_date?: string;
  regeneration_count?: number;
  append_settings?: {
    includeSSN?: boolean;
    includeGovId?: boolean;
    includeProofOfAddress?: boolean;
  };
  snapshot_data?: any;
}

export class SessionService {
  /**
   * Create a new session
   */
  static async createSession(userId: string, name?: string): Promise<Session> {
    const sessionName = name || `Session ${new Date().toLocaleDateString()}`;
    
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: userId,
        name: sessionName,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    return data as Session;
  }

  /**
   * Get all sessions for a user
   */
  static async getUserSessions(userId: string): Promise<Session[]> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch sessions: ${error.message}`);
    }

    return (data || []) as Session[];
  }

  /**
   * Get a specific session by ID
   */
  static async getSession(sessionId: string): Promise<Session | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Session not found
      }
      throw new Error(`Failed to fetch session: ${error.message}`);
    }

    return data as Session;
  }

  /**
   * Update session status
   */
  static async updateSessionStatus(sessionId: string, status: 'active' | 'completed' | 'paused'): Promise<Session> {
    const { data, error } = await supabase
      .from('sessions')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update session status: ${error.message}`);
    }

    return data as Session;
  }

  /**
   * Delete a session and all associated rounds
   */
  static async deleteSession(sessionId: string): Promise<void> {
    // First delete all rounds in this session
    const { error: roundsError } = await supabase
      .from('rounds')
      .delete()
      .eq('session_id', sessionId);

    if (roundsError) {
      throw new Error(`Failed to delete session rounds: ${roundsError.message}`);
    }

    // Then delete the session
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`);
    }
  }

  /**
   * Get rounds for a session
   */
  static async getSessionRounds(sessionId: string): Promise<Round[]> {
    const { data, error } = await supabase
      .from('rounds')
      .select('*')
      .eq('session_id', sessionId)
      .order('round_number', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch rounds: ${error.message}`);
    }

    return (data || []) as Round[];
  }

  /**
   * Create a new round for a session
   */
  static async createRound(sessionId: string, userId: string, roundNumber: number): Promise<Round> {
    const { data, error } = await supabase
      .from('rounds')
      .insert({
        session_id: sessionId,
        user_id: userId,
        round_number: roundNumber,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create round: ${error.message}`);
    }

    return data as Round;
  }

  /**
   * Update round status
   */
  static async updateRoundStatus(roundId: string, status: 'active' | 'completed' | 'locked'): Promise<Round> {
    const { data, error } = await supabase
      .from('rounds')
      .update({ 
        status,
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {})
      })
      .eq('id', roundId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update round status: ${error.message}`);
    }

    return data as Round;
  }

  /**
   * Update round append settings
   */
  static async updateRoundAppendSettings(roundId: string, settings: Round['append_settings']): Promise<Round> {
    const { data, error } = await supabase
      .from('rounds')
      .update({ append_settings: settings })
      .eq('id', roundId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update round append settings: ${error.message}`);
    }

    return data as Round;
  }

  /**
   * Check if user can start a specific round
   */
  static async canStartRound(roundId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('rounds')
      .select('can_start_at, status')
      .eq('id', roundId)
      .single();

    if (error) return false;

    if (data.status !== 'locked') return true;
    
    if (!data.can_start_at) return false;

    return new Date() >= new Date(data.can_start_at);
  }

  /**
   * Set when a round can be started (for time locks)
   */
  static async setRoundStartTime(roundId: string, canStartAt: Date): Promise<Round> {
    const { data, error } = await supabase
      .from('rounds')
      .update({ 
        can_start_at: canStartAt.toISOString(),
        status: 'locked'
      })
      .eq('id', roundId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to set round start time: ${error.message}`);
    }

    return data as Round;
  }
}