-- Add snapshot_data column to rounds table for storing complete round state
ALTER TABLE public.rounds 
ADD COLUMN IF NOT EXISTS snapshot_data jsonb DEFAULT '{}'::jsonb;

-- Add index for better performance when querying rounds by user and status
CREATE INDEX IF NOT EXISTS idx_rounds_user_status ON public.rounds(user_id, status);

-- Add index for better performance when querying rounds by session
CREATE INDEX IF NOT EXISTS idx_rounds_session_round ON public.rounds(session_id, round_number);