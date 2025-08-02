-- Add status column to profiles table for access control
ALTER TABLE public.profiles 
ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended'));

-- Create index for better performance on status queries
CREATE INDEX idx_profiles_status ON public.profiles(status);

-- Update existing profiles to be active by default
UPDATE public.profiles SET status = 'active' WHERE status IS NULL;