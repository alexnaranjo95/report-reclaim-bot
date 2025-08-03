-- Update the status check constraint to include the new status values needed
ALTER TABLE public.rounds 
DROP CONSTRAINT IF EXISTS rounds_status_check;

-- Add the updated constraint with all required status values
ALTER TABLE public.rounds 
ADD CONSTRAINT rounds_status_check 
CHECK (status IN ('draft', 'saved', 'sent', 'active', 'completed', 'waiting'));