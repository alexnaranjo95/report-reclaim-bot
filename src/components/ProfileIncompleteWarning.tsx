import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  id?: string;
  user_id?: string;
  email?: string;
  phone_number?: string;
  email_notifications?: boolean;
  text_notifications?: boolean;
  display_name?: string;
  verification_documents?: any;
  created_at?: string;
  updated_at?: string;
  full_name?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}

export const ProfileIncompleteWarning = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchProfile();
    }
  }, [user?.id]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_user_profile', { profile_user_id: user?.id });

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      if (data && data.length > 0) {
        setProfile(data[0]);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMissingFields = () => {
    if (!profile) return [];
    
    const requiredFields = [
      { key: 'full_name', label: 'Full Name' },
      { key: 'address_line1', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'postal_code', label: 'Postal Code' }
    ];

    return requiredFields.filter(field => 
      !profile[field.key as keyof UserProfile] || 
      profile[field.key as keyof UserProfile]?.trim() === ''
    );
  };

  if (loading || !profile) {
    return null;
  }

  const missingFields = getMissingFields();

  if (missingFields.length === 0) {
    return null;
  }

  return (
    <Alert className="bg-yellow-50 border-yellow-200 text-yellow-800 mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        <strong>⚠️ Profile Incomplete</strong>
        <p className="mt-1">
          Please complete your profile information in{' '}
          <a 
            href="/settings" 
            className="underline font-semibold hover:text-yellow-900"
          >
            Settings
          </a>{' '}
          to activate key features like letter sending.
        </p>
        <p className="text-sm mt-1">
          Missing: {missingFields.map(f => f.label).join(', ')}
        </p>
      </AlertDescription>
    </Alert>
  );
};