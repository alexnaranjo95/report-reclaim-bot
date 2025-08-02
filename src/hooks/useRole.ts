import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type AppRole = 'user' | 'admin' | 'superadmin';

export const useRole = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoles = async () => {
      if (!user) {
        setRoles([]);
        setLoading(false);
        return;
      }

      try {
        // Add a small delay to ensure user data is fully loaded
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const { data, error } = await supabase.rpc('get_user_roles', {
          _user_id: user.id
        });

        if (error) {
          console.error('Error fetching roles:', error);
          setRoles(['user']); // Default role
        } else {
          const fetchedRoles = data?.map((item: any) => item.role) || ['user'];
          console.log('Fetched roles for user:', user.email, fetchedRoles);
          setRoles(fetchedRoles);
        }
      } catch (error) {
        console.error('Error fetching roles:', error);
        setRoles(['user']); // Default role
      } finally {
        setLoading(false);
      }
    };

    // Reset loading state when user changes
    setLoading(true);
    fetchRoles();
  }, [user]);

  const hasRole = (role: AppRole): boolean => {
    return roles.includes(role);
  };

  const isSuperAdmin = hasRole('superadmin');
  const isAdmin = hasRole('admin') || isSuperAdmin;

  return {
    roles,
    loading,
    hasRole,
    isSuperAdmin,
    isAdmin
  };
};