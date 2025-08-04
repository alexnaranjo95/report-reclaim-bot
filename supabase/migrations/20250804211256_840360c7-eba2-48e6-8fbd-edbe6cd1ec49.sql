-- Create comprehensive credit report parsing database schema

-- Credit reports table (main table)
CREATE TABLE IF NOT EXISTS public.credit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  bureau_name TEXT NOT NULL CHECK (bureau_name IN ('Experian', 'Equifax', 'TransUnion')),
  file_name TEXT NOT NULL,
  file_path TEXT,
  report_date DATE,
  raw_text TEXT,
  extraction_status TEXT DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_errors TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Personal information extracted from reports
CREATE TABLE IF NOT EXISTS public.personal_information (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  full_name TEXT,
  date_of_birth DATE,
  ssn_partial TEXT, -- Last 4 digits only
  current_address JSONB, -- {street, city, state, zip}
  previous_addresses JSONB DEFAULT '[]'::jsonb, -- Array of address objects
  phone_numbers JSONB DEFAULT '[]'::jsonb, -- Array of phone numbers
  employer_info JSONB, -- {name, address, position}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit accounts from reports
CREATE TABLE IF NOT EXISTS public.credit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  creditor_name TEXT NOT NULL,
  account_number TEXT,
  account_type TEXT, -- Credit Card, Auto Loan, Mortgage, etc.
  account_status TEXT, -- Open, Closed, etc.
  payment_status TEXT, -- Current, Late, etc.
  date_opened DATE,
  date_closed DATE,
  credit_limit DECIMAL(12,2),
  high_credit DECIMAL(12,2),
  current_balance DECIMAL(12,2),
  past_due_amount DECIMAL(12,2) DEFAULT 0,
  monthly_payment DECIMAL(12,2),
  payment_history JSONB DEFAULT '{}'::jsonb, -- Monthly payment history
  terms TEXT, -- Payment terms
  responsibility TEXT, -- Individual, Joint, etc.
  is_negative BOOLEAN DEFAULT false,
  bureau_reporting TEXT[], -- Which bureaus report this account
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit inquiries
CREATE TABLE IF NOT EXISTS public.credit_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  inquirer_name TEXT NOT NULL,
  inquiry_date DATE,
  inquiry_type TEXT DEFAULT 'hard' CHECK (inquiry_type IN ('hard', 'soft')),
  purpose TEXT, -- Auto, Credit Card, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Negative items (collections, bankruptcies, etc.)
CREATE TABLE IF NOT EXISTS public.negative_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  negative_type TEXT NOT NULL, -- Collection, Bankruptcy, Tax Lien, etc.
  creditor_name TEXT,
  original_creditor TEXT,
  account_number TEXT,
  amount DECIMAL(12,2),
  date_occurred DATE,
  date_reported DATE,
  status TEXT,
  description TEXT,
  dispute_eligible BOOLEAN DEFAULT true,
  severity_score INTEGER CHECK (severity_score BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit scores from reports
CREATE TABLE IF NOT EXISTS public.credit_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  bureau TEXT NOT NULL,
  score INTEGER CHECK (score BETWEEN 300 AND 850),
  score_date DATE,
  score_model TEXT, -- FICO, VantageScore, etc.
  factors JSONB DEFAULT '[]'::jsonb, -- Array of score factors
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public records (bankruptcies, liens, judgments)
CREATE TABLE IF NOT EXISTS public.public_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL, -- Bankruptcy, Tax Lien, Judgment, etc.
  filing_date DATE,
  court_name TEXT,
  case_number TEXT,
  amount DECIMAL(12,2),
  status TEXT,
  liability TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI analysis results
CREATE TABLE IF NOT EXISTS public.ai_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
  analysis_summary JSONB DEFAULT '{}'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  total_negative_items INTEGER DEFAULT 0,
  estimated_score_impact INTEGER,
  processing_quality_score DECIMAL(3,2), -- 0.00 to 1.00
  model_version TEXT,
  analysis_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.credit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negative_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credit_reports
CREATE POLICY "Users can view own credit reports" ON public.credit_reports
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credit reports" ON public.credit_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credit reports" ON public.credit_reports
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own credit reports" ON public.credit_reports
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for related tables (using report ownership)
CREATE POLICY "Users can view own personal info" ON public.personal_information
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can insert own personal info" ON public.personal_information
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can update own personal info" ON public.personal_information
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can delete own personal info" ON public.personal_information
  FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can view own credit accounts" ON public.credit_accounts
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can insert own credit accounts" ON public.credit_accounts
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can update own credit accounts" ON public.credit_accounts
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can delete own credit accounts" ON public.credit_accounts
  FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can view own credit inquiries" ON public.credit_inquiries
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can insert own credit inquiries" ON public.credit_inquiries
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can update own credit inquiries" ON public.credit_inquiries
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can delete own credit inquiries" ON public.credit_inquiries
  FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can view own negative items" ON public.negative_items
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can insert own negative items" ON public.negative_items
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can update own negative items" ON public.negative_items
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can delete own negative items" ON public.negative_items
  FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can view own credit scores" ON public.credit_scores
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can insert own credit scores" ON public.credit_scores
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can update own credit scores" ON public.credit_scores
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can delete own credit scores" ON public.credit_scores
  FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can view own public records" ON public.public_records
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can insert own public records" ON public.public_records
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can update own public records" ON public.public_records
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can delete own public records" ON public.public_records
  FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can view own AI analysis" ON public.ai_analysis_results
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can insert own AI analysis" ON public.ai_analysis_results
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can update own AI analysis" ON public.ai_analysis_results
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));
CREATE POLICY "Users can delete own AI analysis" ON public.ai_analysis_results
  FOR DELETE USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

-- Indexes for performance
CREATE INDEX idx_credit_reports_user_id ON public.credit_reports(user_id);
CREATE INDEX idx_credit_reports_status ON public.credit_reports(extraction_status);
CREATE INDEX idx_personal_info_report_id ON public.personal_information(report_id);
CREATE INDEX idx_credit_accounts_report_id ON public.credit_accounts(report_id);
CREATE INDEX idx_credit_inquiries_report_id ON public.credit_inquiries(report_id);
CREATE INDEX idx_negative_items_report_id ON public.negative_items(report_id);
CREATE INDEX idx_credit_scores_report_id ON public.credit_scores(report_id);
CREATE INDEX idx_public_records_report_id ON public.public_records(report_id);
CREATE INDEX idx_ai_analysis_report_id ON public.ai_analysis_results(report_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_credit_reports_updated_at 
  BEFORE UPDATE ON public.credit_reports 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_personal_information_updated_at 
  BEFORE UPDATE ON public.personal_information 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_accounts_updated_at 
  BEFORE UPDATE ON public.credit_accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_inquiries_updated_at 
  BEFORE UPDATE ON public.credit_inquiries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_negative_items_updated_at 
  BEFORE UPDATE ON public.negative_items 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_scores_updated_at 
  BEFORE UPDATE ON public.credit_scores 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_public_records_updated_at 
  BEFORE UPDATE ON public.public_records 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_analysis_results_updated_at 
  BEFORE UPDATE ON public.ai_analysis_results 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();