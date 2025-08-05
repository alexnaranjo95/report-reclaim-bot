-- Credit Report Data Parsing & Structuring Schema
-- This implements the comprehensive bureau-specific credit report structure

-- Create enum types for consistent data
CREATE TYPE bureau_enum AS ENUM ('TransUnion', 'Experian', 'Equifax');
CREATE TYPE account_type_enum AS ENUM ('Revolving', 'Installment', 'Mortgage');
CREATE TYPE account_status_enum AS ENUM ('Open', 'Closed', 'Derogatory');
CREATE TYPE address_type_enum AS ENUM ('current', 'previous');
CREATE TYPE inquiry_type_enum AS ENUM ('hard', 'soft');
CREATE TYPE payment_status_enum AS ENUM ('OK', '30', '60', '90', '120', 'CO', 'NA');

-- 1. Update credit_reports table to include reference number
ALTER TABLE public.credit_reports 
ADD COLUMN IF NOT EXISTS reference_number TEXT,
ADD COLUMN IF NOT EXISTS report_date DATE;

-- 2. Credit Alerts Table
CREATE TABLE IF NOT EXISTS public.credit_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    bureau bureau_enum NOT NULL,
    alert_type TEXT NOT NULL,
    alert_text TEXT,
    contact_phone TEXT,
    alert_date DATE,
    expiry_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Update personal_information to be bureau-specific
ALTER TABLE public.personal_information 
ADD COLUMN IF NOT EXISTS bureau bureau_enum,
ADD COLUMN IF NOT EXISTS also_known_as JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ssn_last_four TEXT;

-- Update existing personal_information records to have a default bureau
UPDATE public.personal_information SET bureau = 'TransUnion' WHERE bureau IS NULL;

-- Make bureau NOT NULL after setting defaults
ALTER TABLE public.personal_information ALTER COLUMN bureau SET NOT NULL;

-- 4. Addresses Table (separate from personal_information)
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    bureau bureau_enum NOT NULL,
    address_type address_type_enum NOT NULL,
    street_address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    date_reported DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Credit Scores Table
CREATE TABLE IF NOT EXISTS public.credit_scores (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    bureau bureau_enum NOT NULL,
    score INTEGER,
    score_rank TEXT,
    score_scale_min INTEGER DEFAULT 300,
    score_scale_max INTEGER DEFAULT 850,
    risk_factors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(report_id, bureau)
);

-- 6. Account Summary Table
CREATE TABLE IF NOT EXISTS public.account_summary (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    bureau bureau_enum NOT NULL,
    total_accounts INTEGER DEFAULT 0,
    open_accounts INTEGER DEFAULT 0,
    closed_accounts INTEGER DEFAULT 0,
    delinquent_accounts INTEGER DEFAULT 0,
    derogatory_accounts INTEGER DEFAULT 0,
    collection_accounts INTEGER DEFAULT 0,
    total_balance DECIMAL(12,2),
    total_payments DECIMAL(12,2),
    public_records INTEGER DEFAULT 0,
    inquiries_2_years INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(report_id, bureau)
);

-- 7. Update credit_accounts to be more comprehensive and bureau-specific
ALTER TABLE public.credit_accounts 
ADD COLUMN IF NOT EXISTS bureau bureau_enum,
ADD COLUMN IF NOT EXISTS account_number_masked TEXT,
ADD COLUMN IF NOT EXISTS account_subtype TEXT,
ADD COLUMN IF NOT EXISTS monthly_payment DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS loan_term_months INTEGER,
ADD COLUMN IF NOT EXISTS last_active DATE,
ADD COLUMN IF NOT EXISTS comments TEXT,
ADD COLUMN IF NOT EXISTS dispute_flag BOOLEAN DEFAULT false;

-- Update existing credit_accounts records to have a default bureau
UPDATE public.credit_accounts SET bureau = 'TransUnion' WHERE bureau IS NULL;

-- Make bureau NOT NULL after setting defaults
ALTER TABLE public.credit_accounts ALTER COLUMN bureau SET NOT NULL;

-- 8. Payment History Table
CREATE TABLE IF NOT EXISTS public.payment_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.credit_accounts(id) ON DELETE CASCADE,
    bureau bureau_enum NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 1950 AND year <= 2050),
    status payment_status_enum,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(account_id, bureau, month, year)
);

-- 9. Update credit_inquiries to be bureau-specific
ALTER TABLE public.credit_inquiries 
ADD COLUMN IF NOT EXISTS bureau bureau_enum,
ADD COLUMN IF NOT EXISTS business_type TEXT,
ADD COLUMN IF NOT EXISTS inquiry_type inquiry_type_enum DEFAULT 'hard';

-- Update existing credit_inquiries records to have a default bureau
UPDATE public.credit_inquiries SET bureau = 'TransUnion' WHERE bureau IS NULL;

-- Make bureau NOT NULL after setting defaults
ALTER TABLE public.credit_inquiries ALTER COLUMN bureau SET NOT NULL;

-- 10. Creditor Contacts Table
CREATE TABLE IF NOT EXISTS public.creditor_contacts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    creditor_name TEXT NOT NULL,
    address TEXT,
    phone_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all new tables
ALTER TABLE public.credit_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creditor_contacts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for credit_alerts
CREATE POLICY "Users can view their own credit alerts" 
ON public.credit_alerts FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = credit_alerts.report_id));

CREATE POLICY "Users can insert their own credit alerts" 
ON public.credit_alerts FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = credit_alerts.report_id));

CREATE POLICY "Users can update their own credit alerts" 
ON public.credit_alerts FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = credit_alerts.report_id));

CREATE POLICY "Users can delete their own credit alerts" 
ON public.credit_alerts FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = credit_alerts.report_id));

-- Create RLS policies for addresses
CREATE POLICY "Users can view their own addresses" 
ON public.addresses FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = addresses.report_id));

CREATE POLICY "Users can insert their own addresses" 
ON public.addresses FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = addresses.report_id));

CREATE POLICY "Users can update their own addresses" 
ON public.addresses FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = addresses.report_id));

CREATE POLICY "Users can delete their own addresses" 
ON public.addresses FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = addresses.report_id));

-- Create RLS policies for credit_scores
CREATE POLICY "Users can view their own credit scores" 
ON public.credit_scores FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = credit_scores.report_id));

CREATE POLICY "Users can insert their own credit scores" 
ON public.credit_scores FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = credit_scores.report_id));

CREATE POLICY "Users can update their own credit scores" 
ON public.credit_scores FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = credit_scores.report_id));

CREATE POLICY "Users can delete their own credit scores" 
ON public.credit_scores FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = credit_scores.report_id));

-- Create RLS policies for account_summary
CREATE POLICY "Users can view their own account summary" 
ON public.account_summary FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = account_summary.report_id));

CREATE POLICY "Users can insert their own account summary" 
ON public.account_summary FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = account_summary.report_id));

CREATE POLICY "Users can update their own account summary" 
ON public.account_summary FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = account_summary.report_id));

CREATE POLICY "Users can delete their own account summary" 
ON public.account_summary FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = account_summary.report_id));

-- Create RLS policies for payment_history
CREATE POLICY "Users can view their own payment history" 
ON public.payment_history FOR SELECT 
USING (auth.uid() = (SELECT cr.user_id FROM public.credit_reports cr 
                     JOIN public.credit_accounts ca ON cr.id = ca.report_id 
                     WHERE ca.id = payment_history.account_id));

CREATE POLICY "Users can insert their own payment history" 
ON public.payment_history FOR INSERT 
WITH CHECK (auth.uid() = (SELECT cr.user_id FROM public.credit_reports cr 
                          JOIN public.credit_accounts ca ON cr.id = ca.report_id 
                          WHERE ca.id = payment_history.account_id));

CREATE POLICY "Users can update their own payment history" 
ON public.payment_history FOR UPDATE 
USING (auth.uid() = (SELECT cr.user_id FROM public.credit_reports cr 
                     JOIN public.credit_accounts ca ON cr.id = ca.report_id 
                     WHERE ca.id = payment_history.account_id));

CREATE POLICY "Users can delete their own payment history" 
ON public.payment_history FOR DELETE 
USING (auth.uid() = (SELECT cr.user_id FROM public.credit_reports cr 
                     JOIN public.credit_accounts ca ON cr.id = ca.report_id 
                     WHERE ca.id = payment_history.account_id));

-- Create RLS policies for creditor_contacts
CREATE POLICY "Users can view their own creditor contacts" 
ON public.creditor_contacts FOR SELECT 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = creditor_contacts.report_id));

CREATE POLICY "Users can insert their own creditor contacts" 
ON public.creditor_contacts FOR INSERT 
WITH CHECK (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = creditor_contacts.report_id));

CREATE POLICY "Users can update their own creditor contacts" 
ON public.creditor_contacts FOR UPDATE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = creditor_contacts.report_id));

CREATE POLICY "Users can delete their own creditor contacts" 
ON public.creditor_contacts FOR DELETE 
USING (auth.uid() = (SELECT user_id FROM public.credit_reports WHERE id = creditor_contacts.report_id));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_credit_alerts_report_id ON public.credit_alerts(report_id);
CREATE INDEX IF NOT EXISTS idx_credit_alerts_bureau ON public.credit_alerts(bureau);
CREATE INDEX IF NOT EXISTS idx_addresses_report_id ON public.addresses(report_id);
CREATE INDEX IF NOT EXISTS idx_addresses_bureau ON public.addresses(bureau);
CREATE INDEX IF NOT EXISTS idx_credit_scores_report_id ON public.credit_scores(report_id);
CREATE INDEX IF NOT EXISTS idx_credit_scores_bureau ON public.credit_scores(bureau);
CREATE INDEX IF NOT EXISTS idx_account_summary_report_id ON public.account_summary(report_id);
CREATE INDEX IF NOT EXISTS idx_account_summary_bureau ON public.account_summary(bureau);
CREATE INDEX IF NOT EXISTS idx_payment_history_account_id ON public.payment_history(account_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_bureau ON public.payment_history(bureau);
CREATE INDEX IF NOT EXISTS idx_payment_history_date ON public.payment_history(year, month);
CREATE INDEX IF NOT EXISTS idx_creditor_contacts_report_id ON public.creditor_contacts(report_id);
CREATE INDEX IF NOT EXISTS idx_personal_information_bureau ON public.personal_information(bureau);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_bureau ON public.credit_accounts(bureau);
CREATE INDEX IF NOT EXISTS idx_credit_inquiries_bureau ON public.credit_inquiries(bureau);

-- Add triggers for updated_at columns
CREATE TRIGGER update_credit_alerts_updated_at
    BEFORE UPDATE ON public.credit_alerts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_addresses_updated_at
    BEFORE UPDATE ON public.addresses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_scores_updated_at
    BEFORE UPDATE ON public.credit_scores
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_account_summary_updated_at
    BEFORE UPDATE ON public.account_summary
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_creditor_contacts_updated_at
    BEFORE UPDATE ON public.creditor_contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();