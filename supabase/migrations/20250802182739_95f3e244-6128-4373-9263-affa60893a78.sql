-- CRITICAL SECURITY FIX: Fix Nullable user_id Columns and Add Foreign Key Constraints

-- First, update any existing records that might have NULL user_id values
-- For sessions, we'll need to handle this carefully since sessions should always have a user
UPDATE public.sessions 
SET user_id = auth.uid() 
WHERE user_id IS NULL AND auth.uid() IS NOT NULL;

-- For rounds, update based on session user_id
UPDATE public.rounds 
SET user_id = s.user_id 
FROM public.sessions s 
WHERE public.rounds.session_id = s.id AND public.rounds.user_id IS NULL;

-- For letters, update based on round user_id  
UPDATE public.letters 
SET user_id = r.user_id 
FROM public.rounds r 
WHERE public.letters.round_id = r.id AND public.letters.user_id IS NULL;

-- For response_logs, update based on round user_id
UPDATE public.response_logs 
SET user_id = r.user_id 
FROM public.rounds r 
WHERE public.response_logs.round_id = r.id AND public.response_logs.user_id IS NULL;

-- Now make user_id columns NOT NULL and add foreign key constraints
ALTER TABLE public.sessions 
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT fk_sessions_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.rounds 
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT fk_rounds_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.letters 
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT fk_letters_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.response_logs 
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT fk_response_logs_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraints for referential integrity
ALTER TABLE public.rounds 
  ADD CONSTRAINT fk_rounds_session_id FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE public.letters 
  ADD CONSTRAINT fk_letters_round_id FOREIGN KEY (round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;

ALTER TABLE public.response_logs 
  ADD CONSTRAINT fk_response_logs_round_id FOREIGN KEY (round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;

-- Create storage policies for verification-documents bucket
INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('verification-documents', '.emptyFolderPlaceholder', auth.uid(), '{}') ON CONFLICT DO NOTHING;

-- Storage policies for verification-documents bucket
CREATE POLICY "Users can view their own verification documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'verification-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own verification documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'verification-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own verification documents" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'verification-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own verification documents" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'verification-documents' AND auth.uid()::text = (storage.foldername(name))[1]);