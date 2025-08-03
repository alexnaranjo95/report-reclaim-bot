-- Add regeneration tracking to rounds table
ALTER TABLE public.rounds 
ADD COLUMN regeneration_count INTEGER DEFAULT 0,
ADD COLUMN last_regeneration_date DATE;

-- Create index for efficient querying
CREATE INDEX idx_rounds_regeneration ON public.rounds(last_regeneration_date, regeneration_count);