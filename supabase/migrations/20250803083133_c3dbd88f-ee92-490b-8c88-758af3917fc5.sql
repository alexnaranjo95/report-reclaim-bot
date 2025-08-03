-- Create credit report analysis system schema

-- Create storage bucket for credit reports
INSERT INTO storage.buckets (id, name, public) 
VALUES ('credit-reports', 'credit-reports', false);

-- Main credit reports table
CREATE TABLE public.credit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    bureau_name TEXT NOT NULL CHECK (bureau_name IN ('Equifax', 'Experian', 'TransUnion')),
    report_date DATE,
    file_path TEXT,
    file_name TEXT,
    raw_text TEXT,
    extraction_status TEXT DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
    processing_errors TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Personal information from reports
CREATE TABLE public.personal_information (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    full_name TEXT,
    ssn_partial TEXT, -- Last 4 digits only for security
    date_of_birth DATE,
    current_address JSONB,
    previous_addresses JSONB DEFAULT '[]'::jsonb,
    employer_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Individual credit accounts
CREATE TABLE public.credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    account_number TEXT,
    creditor_name TEXT NOT NULL,
    account_type TEXT,
    date_opened DATE,
    date_closed DATE,
    high_credit DECIMAL(12,2),
    credit_limit DECIMAL(12,2),
    current_balance DECIMAL(12,2),
    past_due_amount DECIMAL(12,2) DEFAULT 0,
    payment_status TEXT,
    account_status TEXT,
    payment_history JSONB DEFAULT '{}'::jsonb,
    is_negative BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Negative items tracking
CREATE TABLE public.negative_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.credit_accounts(id) ON DELETE SET NULL,
    negative_type TEXT NOT NULL,
    severity_score INTEGER CHECK (severity_score >= 1 AND severity_score <= 10),
    date_occurred DATE,
    amount DECIMAL(12,2),
    description TEXT,
    ai_confidence_score DECIMAL(3,2) CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 1),
    human_verified BOOLEAN DEFAULT false,
    dispute_eligible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Collections accounts
CREATE TABLE public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    collection_agency TEXT,
    original_creditor TEXT,
    account_number TEXT,
    amount DECIMAL(12,2),
    date_assigned DATE,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Public records (bankruptcies, liens, judgments)
CREATE TABLE public.public_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL CHECK (record_type IN ('bankruptcy', 'lien', 'judgment', 'other')),
    filing_date DATE,
    amount DECIMAL(12,2),
    court_name TEXT,
    case_number TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Credit inquiries
CREATE TABLE public.credit_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    inquirer_name TEXT NOT NULL,
    inquiry_date DATE,
    inquiry_type TEXT CHECK (inquiry_type IN ('hard', 'soft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- AI analysis results
CREATE TABLE public.ai_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    analysis_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
    model_version TEXT,
    total_negative_items INTEGER DEFAULT 0,
    analysis_summary JSONB DEFAULT '{}'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.credit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negative_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for credit_reports
CREATE POLICY "Users can view their own credit reports" 
ON public.credit_reports FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credit reports" 
ON public.credit_reports FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credit reports" 
ON public.credit_reports FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credit reports" 
ON public.credit_reports FOR DELETE 
USING (auth.uid() = user_id);

-- Create RLS policies for personal_information
CREATE POLICY "Users can view their own personal information" 
ON public.personal_information FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can insert their own personal information" 
ON public.personal_information FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can update their own personal information" 
ON public.personal_information FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can delete their own personal information" 
ON public.personal_information FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

-- Create RLS policies for credit_accounts
CREATE POLICY "Users can view their own credit accounts" 
ON public.credit_accounts FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can insert their own credit accounts" 
ON public.credit_accounts FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can update their own credit accounts" 
ON public.credit_accounts FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can delete their own credit accounts" 
ON public.credit_accounts FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

-- Create RLS policies for negative_items
CREATE POLICY "Users can view their own negative items" 
ON public.negative_items FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can insert their own negative items" 
ON public.negative_items FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can update their own negative items" 
ON public.negative_items FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can delete their own negative items" 
ON public.negative_items FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

-- Create RLS policies for collections
CREATE POLICY "Users can view their own collections" 
ON public.collections FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can insert their own collections" 
ON public.collections FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can update their own collections" 
ON public.collections FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can delete their own collections" 
ON public.collections FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

-- Create RLS policies for public_records
CREATE POLICY "Users can view their own public records" 
ON public.public_records FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can insert their own public records" 
ON public.public_records FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can update their own public records" 
ON public.public_records FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can delete their own public records" 
ON public.public_records FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

-- Create RLS policies for credit_inquiries
CREATE POLICY "Users can view their own credit inquiries" 
ON public.credit_inquiries FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can insert their own credit inquiries" 
ON public.credit_inquiries FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can update their own credit inquiries" 
ON public.credit_inquiries FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can delete their own credit inquiries" 
ON public.credit_inquiries FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

-- Create RLS policies for ai_analysis_results
CREATE POLICY "Users can view their own AI analysis results" 
ON public.ai_analysis_results FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can insert their own AI analysis results" 
ON public.ai_analysis_results FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can update their own AI analysis results" 
ON public.ai_analysis_results FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

CREATE POLICY "Users can delete their own AI analysis results" 
ON public.ai_analysis_results FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = report_id));

-- Create storage policies for credit-reports bucket
CREATE POLICY "Users can upload their own credit reports"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'credit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own credit reports"
ON storage.objects FOR SELECT
USING (bucket_id = 'credit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own credit reports"
ON storage.objects FOR UPDATE
USING (bucket_id = 'credit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own credit reports"
ON storage.objects FOR DELETE
USING (bucket_id = 'credit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add performance indexes
CREATE INDEX idx_credit_reports_user_id ON public.credit_reports(user_id);
CREATE INDEX idx_credit_reports_bureau_name ON public.credit_reports(bureau_name);
CREATE INDEX idx_credit_reports_extraction_status ON public.credit_reports(extraction_status);

CREATE INDEX idx_personal_information_report_id ON public.personal_information(report_id);

CREATE INDEX idx_credit_accounts_report_id ON public.credit_accounts(report_id);
CREATE INDEX idx_credit_accounts_creditor_name ON public.credit_accounts(creditor_name);
CREATE INDEX idx_credit_accounts_is_negative ON public.credit_accounts(is_negative);

CREATE INDEX idx_negative_items_report_id ON public.negative_items(report_id);
CREATE INDEX idx_negative_items_account_id ON public.negative_items(account_id);
CREATE INDEX idx_negative_items_severity_score ON public.negative_items(severity_score);
CREATE INDEX idx_negative_items_dispute_eligible ON public.negative_items(dispute_eligible);

CREATE INDEX idx_collections_report_id ON public.collections(report_id);

CREATE INDEX idx_public_records_report_id ON public.public_records(report_id);
CREATE INDEX idx_public_records_record_type ON public.public_records(record_type);

CREATE INDEX idx_credit_inquiries_report_id ON public.credit_inquiries(report_id);
CREATE INDEX idx_credit_inquiries_inquiry_type ON public.credit_inquiries(inquiry_type);

CREATE INDEX idx_ai_analysis_results_report_id ON public.ai_analysis_results(report_id);

-- Add triggers for updated_at timestamps
CREATE TRIGGER update_credit_reports_updated_at
    BEFORE UPDATE ON public.credit_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_personal_information_updated_at
    BEFORE UPDATE ON public.personal_information
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_accounts_updated_at
    BEFORE UPDATE ON public.credit_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_negative_items_updated_at
    BEFORE UPDATE ON public.negative_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON public.collections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_public_records_updated_at
    BEFORE UPDATE ON public.public_records
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_inquiries_updated_at
    BEFORE UPDATE ON public.credit_inquiries
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_analysis_results_updated_at
    BEFORE UPDATE ON public.ai_analysis_results
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();