-- Create tables for storing raw table data extracted from credit reports
CREATE TABLE public.credit_report_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  table_index INTEGER NOT NULL,
  table_type TEXT, -- 'account_summary', 'payment_history', 'inquiries', 'personal_info', 'unknown'
  row_count INTEGER NOT NULL DEFAULT 0,
  column_count INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC(5,4), -- AWS Textract confidence score
  bounding_box JSONB, -- Table bounding box coordinates
  raw_table_data JSONB NOT NULL DEFAULT '{}', -- Raw table structure from Textract
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_report_table_cells (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID NOT NULL REFERENCES public.credit_report_tables(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  cell_text TEXT,
  confidence_score NUMERIC(5,4), -- Cell confidence score
  is_header BOOLEAN DEFAULT false,
  bounding_box JSONB, -- Cell bounding box coordinates
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.credit_report_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_report_table_cells ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for credit_report_tables
CREATE POLICY "Users can view their own credit report tables" 
ON public.credit_report_tables 
FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM credit_reports WHERE id = credit_report_tables.report_id));

CREATE POLICY "Users can insert their own credit report tables" 
ON public.credit_report_tables 
FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM credit_reports WHERE id = credit_report_tables.report_id));

CREATE POLICY "Users can update their own credit report tables" 
ON public.credit_report_tables 
FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM credit_reports WHERE id = credit_report_tables.report_id));

CREATE POLICY "Users can delete their own credit report tables" 
ON public.credit_report_tables 
FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM credit_reports WHERE id = credit_report_tables.report_id));

-- Create RLS policies for credit_report_table_cells
CREATE POLICY "Users can view their own credit report table cells" 
ON public.credit_report_table_cells 
FOR SELECT 
USING (auth.uid() = (
  SELECT cr.user_id 
  FROM credit_reports cr 
  JOIN credit_report_tables crt ON cr.id = crt.report_id 
  WHERE crt.id = credit_report_table_cells.table_id
));

CREATE POLICY "Users can insert their own credit report table cells" 
ON public.credit_report_table_cells 
FOR INSERT 
WITH CHECK (auth.uid() = (
  SELECT cr.user_id 
  FROM credit_reports cr 
  JOIN credit_report_tables crt ON cr.id = crt.report_id 
  WHERE crt.id = credit_report_table_cells.table_id
));

CREATE POLICY "Users can update their own credit report table cells" 
ON public.credit_report_table_cells 
FOR UPDATE 
USING (auth.uid() = (
  SELECT cr.user_id 
  FROM credit_reports cr 
  JOIN credit_report_tables crt ON cr.id = crt.report_id 
  WHERE crt.id = credit_report_table_cells.table_id
));

CREATE POLICY "Users can delete their own credit report table cells" 
ON public.credit_report_table_cells 
FOR DELETE 
USING (auth.uid() = (
  SELECT cr.user_id 
  FROM credit_reports cr 
  JOIN credit_report_tables crt ON cr.id = crt.report_id 
  WHERE crt.id = credit_report_table_cells.table_id
));

-- Create indexes for better performance
CREATE INDEX idx_credit_report_tables_report_id ON public.credit_report_tables(report_id);
CREATE INDEX idx_credit_report_table_cells_table_id ON public.credit_report_table_cells(table_id);
CREATE INDEX idx_credit_report_table_cells_position ON public.credit_report_table_cells(table_id, row_index, column_index);

-- Add triggers for updated_at
CREATE TRIGGER update_credit_report_tables_updated_at
  BEFORE UPDATE ON public.credit_report_tables
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add column to credit_reports to track table extraction status
ALTER TABLE public.credit_reports 
ADD COLUMN IF NOT EXISTS table_extraction_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS tables_extracted_count INTEGER DEFAULT 0;