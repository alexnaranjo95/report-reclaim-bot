-- Allow nullable fields for incomplete address data
ALTER TABLE public.creditor_addresses 
ALTER COLUMN bureau DROP NOT NULL,
ALTER COLUMN street DROP NOT NULL,
ALTER COLUMN city DROP NOT NULL,
ALTER COLUMN state DROP NOT NULL,
ALTER COLUMN zip DROP NOT NULL;