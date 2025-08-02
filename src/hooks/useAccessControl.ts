import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export const useAccessControl = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [isAccessAllowed, setIsAccessAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUserAccess = async () => {
      if (!user?.id) {
        setIsAccessAllowed(true); // Allow unauthenticated access to login page
        setLoading(false);
        return;
      }

      try {
        // Check user status in profiles table
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('status')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking user access:', error);
          setIsAccessAllowed(true); // Default to allow if we can't check
          setLoading(false);
          return;
        }

        // If user has no profile, allow access (they can create one)
        if (!profile) {
          setIsAccessAllowed(true);
          setLoading(false);
          return;
        }

        // Check if user is suspended
        if (profile.status === 'suspended' || profile.status === 'inactive') {
          setIsAccessAllowed(false);
          
          // Show notification and sign out suspended users
          toast({
            title: "Account Suspended",
            description: "Your account has been suspended. Please contact support for assistance.",
            variant: "destructive",
          });

          // Sign out the suspended user
          await signOut();
          
          setLoading(false);
          return;
        }

        // User is active, allow access
        setIsAccessAllowed(true);
        setLoading(false);

      } catch (error) {
        console.error('Error in access control check:', error);
        setIsAccessAllowed(true); // Default to allow if there's an error
        setLoading(false);
      }
    };

    checkUserAccess();
  }, [user?.id, signOut, toast]);

  return {
    isAccessAllowed,
    loading
  };
};