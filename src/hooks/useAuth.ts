import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { secureStorage } from '@/utils/SecureStorage';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Initialize secure storage for authenticated users
        if (session?.user?.id) {
          secureStorage.initializeKey(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          // Clear secure storage on logout
          secureStorage.clearAll();
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Initialize secure storage for existing session
      if (session?.user?.id) {
        secureStorage.initializeKey(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Clear secure storage before signing out
    if (user?.id) {
      secureStorage.clearUserData(user.id);
    }
    
    const { error } = await supabase.auth.signOut();
    
    // Ensure all storage is cleared after signout
    secureStorage.clearAll();
    
    return { error };
  };

  return {
    user,
    session,
    loading,
    signOut,
  };
};