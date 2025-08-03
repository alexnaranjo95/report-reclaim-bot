import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ProfileCompleteness {
  isComplete: boolean;
  missingFields: string[];
  profile: any | null;
}

export const useProfileCompleteness = () => {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<ProfileCompleteness>({
    isComplete: false,
    missingFields: [],
    profile: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkProfileCompleteness = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const { data: profile, error } = await supabase.rpc('get_user_profile', {
          profile_user_id: user.id
        });

        if (error) throw error;

        if (profile && profile.length > 0) {
          const userProfile = profile[0];
          
          // Check required fields for PostGrid
          const requiredFields = ['full_name', 'address_line1', 'city', 'state', 'postal_code'];
          const missingFields = requiredFields.filter(field => !userProfile[field]?.trim());
          
          setProfileData({
            isComplete: missingFields.length === 0,
            missingFields,
            profile: userProfile
          });
        } else {
          setProfileData({
            isComplete: false,
            missingFields: ['full_name', 'address_line1', 'city', 'state', 'postal_code'],
            profile: null
          });
        }
      } catch (error) {
        console.error('Error checking profile completeness:', error);
        setProfileData({
          isComplete: false,
          missingFields: ['full_name', 'address_line1', 'city', 'state', 'postal_code'],
          profile: null
        });
      } finally {
        setLoading(false);
      }
    };

    checkProfileCompleteness();
  }, [user?.id]);

  return { ...profileData, loading };
};