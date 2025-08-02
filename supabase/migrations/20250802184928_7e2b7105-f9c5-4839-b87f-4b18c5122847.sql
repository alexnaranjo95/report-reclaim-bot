-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'superadmin');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Superadmins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin'))
USING (public.has_role(auth.uid(), 'superadmin'));

-- Create trigger for updated_at
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create admin metrics tables for analytics
CREATE TABLE public.platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    letters_sent INTEGER NOT NULL DEFAULT 0,
    postage_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    disputes_drafted INTEGER NOT NULL DEFAULT 0,
    disputes_resolved INTEGER NOT NULL DEFAULT 0,
    active_users INTEGER NOT NULL DEFAULT 0,
    total_revenue DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(date)
);

-- Enable RLS for platform_metrics
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;

-- Only superadmins can access platform metrics
CREATE POLICY "Superadmins can manage platform metrics"
ON public.platform_metrics
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Create trigger for updated_at
CREATE TRIGGER update_platform_metrics_updated_at
BEFORE UPDATE ON public.platform_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get user roles
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS TABLE(role app_role)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT user_roles.role
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- Create admin tenant analytics view
CREATE OR REPLACE VIEW public.admin_tenant_analytics AS
SELECT 
    p.user_id,
    p.display_name,
    p.email,
    p.created_at as user_created_at,
    COUNT(DISTINCT s.id) as total_sessions,
    COUNT(DISTINCT l.id) as total_letters,
    COALESCE(SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END), 0) as letters_sent,
    MAX(s.updated_at) as last_activity,
    CASE 
        WHEN MAX(s.updated_at) > NOW() - INTERVAL '7 days' THEN 'active'
        WHEN MAX(s.updated_at) > NOW() - INTERVAL '30 days' THEN 'inactive'
        ELSE 'dormant'
    END as status,
    COALESCE(COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END), 0) as active_rounds
FROM public.profiles p
LEFT JOIN public.sessions s ON p.user_id = s.user_id
LEFT JOIN public.rounds r ON s.id = r.session_id
LEFT JOIN public.letters l ON r.id = l.round_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = p.user_id 
    AND ur.role IN ('admin', 'superadmin')
)
GROUP BY p.user_id, p.display_name, p.email, p.created_at;