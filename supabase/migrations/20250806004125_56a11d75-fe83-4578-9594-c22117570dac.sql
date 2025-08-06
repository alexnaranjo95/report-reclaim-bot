-- Create table for storing multiple extraction results per report
CREATE TABLE public.extraction_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  extraction_method TEXT NOT NULL, -- 'google-document-ai', 'google-vision', 'textract', 'fallback'
  extracted_text TEXT,
  processing_time_ms INTEGER,
  character_count INTEGER,
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00
  word_count INTEGER,
  has_structured_data BOOLEAN DEFAULT false,
  extraction_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for consolidation metadata
CREATE TABLE public.consolidation_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  primary_source TEXT NOT NULL, -- which method was chosen as primary
  consolidation_strategy TEXT NOT NULL, -- 'highest_confidence', 'majority_vote', 'manual_review'
  confidence_level DECIMAL(3,2), -- overall confidence in consolidation
  field_sources JSONB DEFAULT '{}', -- tracks which source was used for each field
  conflict_count INTEGER DEFAULT 0,
  requires_human_review BOOLEAN DEFAULT false,
  consolidation_notes TEXT,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_extraction_results_report_id ON public.extraction_results(report_id);
CREATE INDEX idx_extraction_results_method ON public.extraction_results(extraction_method);
CREATE INDEX idx_consolidation_metadata_report_id ON public.consolidation_metadata(report_id);

-- Enable RLS on new tables
ALTER TABLE public.extraction_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_metadata ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for extraction_results
CREATE POLICY "Users can view their own extraction results" 
ON public.extraction_results 
FOR SELECT 
USING (auth.uid() = (
  SELECT user_id FROM credit_reports WHERE id = extraction_results.report_id
));

CREATE POLICY "Users can insert their own extraction results" 
ON public.extraction_results 
FOR INSERT 
WITH CHECK (auth.uid() = (
  SELECT user_id FROM credit_reports WHERE id = extraction_results.report_id
));

CREATE POLICY "Users can update their own extraction results" 
ON public.extraction_results 
FOR UPDATE 
USING (auth.uid() = (
  SELECT user_id FROM credit_reports WHERE id = extraction_results.report_id
));

CREATE POLICY "Users can delete their own extraction results" 
ON public.extraction_results 
FOR DELETE 
USING (auth.uid() = (
  SELECT user_id FROM credit_reports WHERE id = extraction_results.report_id
));

-- Create RLS policies for consolidation_metadata
CREATE POLICY "Users can view their own consolidation metadata" 
ON public.consolidation_metadata 
FOR SELECT 
USING (auth.uid() = (
  SELECT user_id FROM credit_reports WHERE id = consolidation_metadata.report_id
));

CREATE POLICY "Users can insert their own consolidation metadata" 
ON public.consolidation_metadata 
FOR INSERT 
WITH CHECK (auth.uid() = (
  SELECT user_id FROM credit_reports WHERE id = consolidation_metadata.report_id
));

CREATE POLICY "Users can update their own consolidation metadata" 
ON public.consolidation_metadata 
FOR UPDATE 
USING (auth.uid() = (
  SELECT user_id FROM credit_reports WHERE id = consolidation_metadata.report_id
));

CREATE POLICY "Users can delete their own consolidation metadata" 
ON public.consolidation_metadata 
FOR DELETE 
USING (auth.uid() = (
  SELECT user_id FROM credit_reports WHERE id = consolidation_metadata.report_id
));

-- Add consolidation status to credit_reports table
ALTER TABLE public.credit_reports ADD COLUMN consolidation_status TEXT DEFAULT 'pending';
ALTER TABLE public.credit_reports ADD COLUMN consolidation_confidence DECIMAL(3,2);
ALTER TABLE public.credit_reports ADD COLUMN primary_extraction_method TEXT;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_extraction_results_updated_at
BEFORE UPDATE ON public.extraction_results
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();