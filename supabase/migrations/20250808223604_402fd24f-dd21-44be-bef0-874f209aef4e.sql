-- Upsert Browse.ai settings for SmartCredit imports
BEGIN;

DELETE FROM public.admin_settings
WHERE setting_key IN (
  'browseai.workspace_id',
  'browseai.robot_id',
  'browseai.robot_parameters'
);

INSERT INTO public.admin_settings (setting_key, setting_value, description, is_encrypted)
VALUES
  ('browseai.workspace_id', '"a56bc2d0-1b7c-4d35-94a5-8b8f830fec67"'::jsonb, 'Browse.ai Workspace ID (Team ID)', false),
  ('browseai.robot_id', '"01988b08-e269-77c6-afaa-c7b3f31aa3d1"'::jsonb, 'Default Browse.ai Robot ID for SmartCredit import', false),
  ('browseai.robot_parameters', '["originUrl","email","password","credit_scores_limit","credit_report_details_limit","credit_report_details_transunion_limit","credit_report_details-experian_limit","credit_report_details-equifax_limit","credit_bureaus_comments_limit"]'::jsonb, 'Accepted Browse.ai robot input parameters for SmartCredit import', false);

COMMIT;