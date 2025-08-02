-- Create function to get user statistics with real data
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS TABLE(
  user_id uuid,
  display_name text,
  email text,
  total_sessions integer,
  total_letters integer,
  letters_sent integer,
  last_activity timestamp with time zone,
  status text,
  active_rounds integer,
  user_created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    p.user_id,
    p.display_name,
    p.email,
    COALESCE(s.session_count, 0)::integer as total_sessions,
    COALESCE(l.letter_count, 0)::integer as total_letters,
    COALESCE(l.sent_count, 0)::integer as letters_sent,
    COALESCE(GREATEST(s.last_session, l.last_letter, r.last_round), p.created_at) as last_activity,
    CASE 
      WHEN COALESCE(GREATEST(s.last_session, l.last_letter, r.last_round), p.created_at) > (now() - interval '7 days') THEN 'active'
      WHEN COALESCE(GREATEST(s.last_session, l.last_letter, r.last_round), p.created_at) > (now() - interval '30 days') THEN 'inactive'
      ELSE 'dormant'
    END as status,
    COALESCE(r.active_count, 0)::integer as active_rounds,
    p.created_at as user_created_at
  FROM public.profiles p
  LEFT JOIN (
    SELECT 
      user_id, 
      COUNT(*) as session_count,
      MAX(created_at) as last_session
    FROM public.sessions 
    GROUP BY user_id
  ) s ON p.user_id = s.user_id
  LEFT JOIN (
    SELECT 
      user_id, 
      COUNT(*) as letter_count,
      COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
      MAX(created_at) as last_letter
    FROM public.letters 
    GROUP BY user_id
  ) l ON p.user_id = l.user_id
  LEFT JOIN (
    SELECT 
      user_id, 
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
      MAX(created_at) as last_round
    FROM public.rounds 
    GROUP BY user_id
  ) r ON p.user_id = r.user_id
  ORDER BY p.created_at DESC;
$$;