import { supabase } from '@/integrations/supabase/client';
import { CreditAnalysisResult, DisputeLetter } from '@/types/CreditTypes';

export interface Session {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
  updated_at: string;
  analysis_data?: CreditAnalysisResult;
}

export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  status: 'draft' | 'saved' | 'sent' | 'active' | 'completed' | 'waiting';
  created_at: string;
  completed_at?: string;
  can_start_at?: string;
  snapshot_data?: any;
}

export interface Letter {
  id: string;
  round_id: string;
  creditor: string;
  bureau: string;
  items: string[];
  content: string;
  status: 'draft' | 'sent';
  type: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ResponseLog {
  id: string;
  round_id: string;
  creditor: string;
  received_response: boolean;
  response_content?: string;
  response_summary?: string;
  documents?: string[];
  created_at: string;
}

export class SessionService {
  static async createSession(name: string, analysisData: CreditAnalysisResult): Promise<Session> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('sessions')
      .insert([
        {
          name,
          status: 'active' as const,
          analysis_data: analysisData as any,
          user_id: user.id
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      status: data.status as Session['status'],
      analysis_data: data.analysis_data as any as CreditAnalysisResult
    };
  }

  static async getSessions(): Promise<Session[]> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(session => ({
      ...session,
      status: session.status as Session['status'],
      analysis_data: session.analysis_data as any as CreditAnalysisResult
    }));
  }

  static async getSession(id: string): Promise<Session | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return {
      ...data,
      status: data.status as Session['status'],
      analysis_data: data.analysis_data as any as CreditAnalysisResult
    };
  }

  static async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .update({
        ...updates,
        analysis_data: updates.analysis_data as any
      })
      .eq('id', id);

    if (error) throw error;
  }

  static async createRound(sessionId: string, roundNumber: number): Promise<Round> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('rounds')
      .insert([
        {
          session_id: sessionId,
          round_number: roundNumber,
          status: 'active',
          user_id: user.id
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      status: data.status as Round['status']
    };
  }

  static async getRounds(sessionId: string): Promise<Round[]> {
    const { data, error } = await supabase
      .from('rounds')
      .select('*')
      .eq('session_id', sessionId)
      .order('round_number', { ascending: true });

    if (error) throw error;
    return (data || []).map(round => ({
      ...round,
      status: round.status as Round['status']
    }));
  }

  static async getCurrentRound(sessionId: string): Promise<Round | null> {
    const { data, error } = await supabase
      .from('rounds')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'active')
      .single();

    if (error) return null;
    return data ? {
      ...data,
      status: data.status as Round['status']
    } : null;
  }

  static async completeRound(roundId: string): Promise<void> {
    const nextStartDate = new Date();
    nextStartDate.setDate(nextStartDate.getDate() + 30);

    const { error } = await supabase
      .from('rounds')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', roundId);

    if (error) throw error;

    // Create next round with 30-day delay
    const { data: currentRound } = await supabase
      .from('rounds')
      .select('session_id, round_number')
      .eq('id', roundId)
      .single();

    if (currentRound) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      await supabase
        .from('rounds')
        .insert([
          {
            session_id: currentRound.session_id,
            round_number: currentRound.round_number + 1,
            status: 'waiting',
            can_start_at: nextStartDate.toISOString(),
            user_id: user.id
          }
        ]);
    }
  }

  static async saveLetter(letter: Omit<Letter, 'id' | 'created_at' | 'updated_at'>): Promise<Letter> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('letters')
      .insert([{
        ...letter,
        user_id: user.id
      }])
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      status: data.status as Letter['status']
    };
  }

  static async updateLetter(id: string, updates: Partial<Letter>): Promise<void> {
    const { error } = await supabase
      .from('letters')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
  }

  static async getLetters(roundId: string): Promise<Letter[]> {
    const { data, error } = await supabase
      .from('letters')
      .select('*')
      .eq('round_id', roundId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(letter => ({
      ...letter,
      status: letter.status as Letter['status']
    }));
  }

  static async markLetterAsSent(letterId: string): Promise<void> {
    const { error } = await supabase
      .from('letters')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', letterId);

    if (error) throw error;
  }

  static async saveResponseLog(log: Omit<ResponseLog, 'id' | 'created_at'>): Promise<ResponseLog> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('response_logs')
      .insert([{
        ...log,
        user_id: user.id
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getResponseLogs(roundId: string): Promise<ResponseLog[]> {
    const { data, error } = await supabase
      .from('response_logs')
      .select('*')
      .eq('round_id', roundId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async canStartNextRound(sessionId: string): Promise<{ canStart: boolean; nextRoundDate?: string }> {
    const { data, error } = await supabase
      .from('rounds')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'waiting')
      .order('round_number', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) return { canStart: false };

    if (data.can_start_at) {
      const canStartDate = new Date(data.can_start_at);
      const now = new Date();
      return {
        canStart: now >= canStartDate,
        nextRoundDate: data.can_start_at
      };
    }

    return { canStart: true };
  }

  static async saveRoundSnapshot(roundId: string, snapshotData: any): Promise<void> {
    const { error } = await supabase
      .from('rounds')
      .update({
        snapshot_data: snapshotData,
        status: 'saved'
      })
      .eq('id', roundId);

    if (error) throw error;
  }

  static async createOrUpdateRound(sessionId: string, roundNumber: number, snapshotData?: any): Promise<Round> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    console.log('[SessionService] createOrUpdateRound called with:', {
      sessionId,
      roundNumber,
      userId: user.id,
      hasSnapshotData: !!snapshotData
    });

    // Check if round already exists
    const { data: existingRound, error: fetchError } = await supabase
      .from('rounds')
      .select('*')
      .eq('session_id', sessionId)
      .eq('round_number', roundNumber)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[SessionService] Error fetching existing round:', fetchError);
      throw fetchError;
    }

    console.log('[SessionService] Existing round found:', !!existingRound);

    if (existingRound) {
      // Update existing round
      const updateData = {
        snapshot_data: snapshotData || existingRound.snapshot_data,
        status: snapshotData ? 'saved' : existingRound.status
      };

      console.log('[SessionService] Updating round with data:', updateData);

      const { data, error } = await supabase
        .from('rounds')
        .update(updateData)
        .eq('id', existingRound.id)
        .select()
        .single();

      if (error) {
        console.error('[SessionService] Error updating round:', error);
        throw error;
      }

      console.log('[SessionService] Round updated successfully:', data);
      return {
        ...data,
        status: data.status as Round['status']
      };
    } else {
      // Create new round
      const insertData = {
        session_id: sessionId,
        round_number: roundNumber,
        status: snapshotData ? 'saved' : 'draft',
        snapshot_data: snapshotData || {},
        user_id: user.id
      };

      console.log('[SessionService] Creating new round with data:', insertData);

      const { data, error } = await supabase
        .from('rounds')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('[SessionService] Error creating round:', error);
        throw error;
      }

      console.log('[SessionService] Round created successfully:', data);
      return {
        ...data,
        status: data.status as Round['status']
      };
    }
  }

  static async updateRoundStatus(roundId: string, status: Round['status']): Promise<void> {
    const { error } = await supabase
      .from('rounds')
      .update({
        status
      })
      .eq('id', roundId);

    if (error) throw error;
  }

  static async getRound(roundId: string): Promise<Round | null> {
    const { data, error } = await supabase
      .from('rounds')
      .select('*')
      .eq('id', roundId)
      .single();

    if (error) return null;
    return {
      ...data,
      status: data.status as Round['status']
    };
  }
}