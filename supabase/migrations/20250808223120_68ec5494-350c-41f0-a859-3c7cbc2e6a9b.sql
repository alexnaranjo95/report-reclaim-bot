
-- Store Browse.ai Workspace ID, Robot ID, and Robot Parameter keys in admin_settings
-- We replace any existing keys to keep the values current.

DELETE FROM public.admin_settings
WHERE setting_key IN (
  'browseai.workspace_id',
  'browseai.robot_id',
  'browseai.robot_parameters'
);

INSERT INTO public.admin_settings (setting_key, setting_value, description, is_encrypted)
VALUES
  (
    'browseai.workspace_id',
    to_jsonb('a56bc2d0-1b7c-4d35-94a5-8b8f830fec67'::text),
    'Browse.ai Workspace (Team) ID for SmartCredit robot runs',
    false
  ),
  (
    'browseai.robot_id',
    to_jsonb('01988b08-e269-77c6-afaa-c7b3f31aa3d1'::text),
    'Default Browse.ai SmartCredit Robot ID',
    false
  ),
  (
    'browseai.robot_parameters',
    '[
      "originUrl",
      "email",
      "password",
      "credit_scores_limit",
      "credit_report_details_limit",
      "credit_report_details_transunion_limit",
      "credit_report_details-experian_limit",
      "credit_report_details-equifax_limit",
      "credit_bureaus_comments_limit"
    ]'::jsonb,
    'List of input parameters expected by the SmartCredit robot (stored as provided)',
    false
  );
