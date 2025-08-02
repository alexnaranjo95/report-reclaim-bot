-- Assign superadmin role to the current user
INSERT INTO public.user_roles (user_id, role) 
VALUES ('0d7e61b3-fdc3-418d-9832-e744364a48b2', 'superadmin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;