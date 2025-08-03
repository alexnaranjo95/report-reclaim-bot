-- Create credit_reports table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.credit_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bureau_name TEXT NOT NULL,
  report_date DATE,
  file_path TEXT,
  file_name TEXT,
  raw_text TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_errors TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on credit_reports
ALTER TABLE public.credit_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Users can view their own credit reports" ON public.credit_reports;
DROP POLICY IF EXISTS "Users can create their own credit reports" ON public.credit_reports;
DROP POLICY IF EXISTS "Users can update their own credit reports" ON public.credit_reports;
DROP POLICY IF EXISTS "Users can delete their own credit reports" ON public.credit_reports;

-- Create RLS policies for credit_reports
CREATE POLICY "Users can view their own credit reports" 
ON public.credit_reports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own credit reports" 
ON public.credit_reports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credit reports" 
ON public.credit_reports 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credit reports" 
ON public.credit_reports 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates (only if function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_credit_reports_updated_at ON public.credit_reports;
    CREATE TRIGGER update_credit_reports_updated_at
    BEFORE UPDATE ON public.credit_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Drop existing storage policies if they exist, then create new ones
DROP POLICY IF EXISTS "Users can view their own credit report files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own credit report files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own credit report files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own credit report files" ON storage.objects;

-- Create storage policies for credit-reports bucket
CREATE POLICY "Users can view their own credit report files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'credit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own credit report files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'credit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own credit report files" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'credit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own credit report files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'credit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);