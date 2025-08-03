import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Building, Save } from 'lucide-react';

interface AdminProfile {
  id?: string;
  user_id: string;
  display_name: string;
  email: string;
  phone_number: string;
  full_name: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  organization_id?: string;
  organization_name: string;
}

interface Organization {
  id: string;
  name: string;
  status: string;
}

export const AdminSettings = () => {
  const { user } = useAuth();
  const { isSuperAdmin, isAdmin } = useRole();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<AdminProfile>({
    user_id: user?.id || '',
    display_name: '',
    email: user?.email || '',
    phone_number: '',
    full_name: '',
    address_line1: '',
    city: '',
    state: '',
    postal_code: '',
    organization_name: ''
  });
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchProfile();
      if (isSuperAdmin) {
        fetchOrganizations();
      }
    }
  }, [user?.id, isSuperAdmin]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_profile', {
        profile_user_id: user!.id
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const userProfile = data[0];
        setProfile({
          id: userProfile.id,
          user_id: userProfile.user_id,
          display_name: userProfile.display_name || '',
          email: userProfile.email || user?.email || '',
          phone_number: userProfile.phone_number || '',
          full_name: userProfile.full_name || '',
          address_line1: userProfile.address_line1 || '',
          city: userProfile.city || '',
          state: userProfile.state || '',
          postal_code: userProfile.postal_code || '',
          organization_id: (userProfile as any).organization_id,
          organization_name: (userProfile as any).organization_name || ''
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error",
        description: "Failed to load profile information.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error('Error fetching organizations:', error);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('upsert_user_profile', {
        profile_user_id: user.id,
        profile_email: profile.email,
        profile_phone_number: profile.phone_number,
        profile_email_notifications: true,
        profile_text_notifications: false,
        profile_display_name: profile.display_name,
        profile_full_name: profile.full_name,
        profile_address_line1: profile.address_line1,
        profile_city: profile.city,
        profile_state: profile.state,
        profile_postal_code: profile.postal_code,
        profile_organization_id: profile.organization_id || null,
        profile_organization_name: profile.organization_name
      });

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "Your profile has been updated successfully."
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: "Failed to save profile. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!profile.organization_name.trim()) {
      toast({
        title: "Error",
        description: "Please enter an organization name.",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .insert({
          name: profile.organization_name.trim(),
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;

      setProfile(prev => ({ ...prev, organization_id: data.id }));
      setOrganizations(prev => [...prev, data]);
      
      toast({
        title: "Organization Created",
        description: `${data.name} has been created successfully.`
      });
    } catch (error) {
      console.error('Error creating organization:', error);
      toast({
        title: "Error",
        description: "Failed to create organization.",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-card/50 rounded-lg animate-pulse" />
        <div className="h-96 bg-card/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-card shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Admin Profile Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={profile.display_name}
                onChange={(e) => setProfile(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="Your display name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={profile.full_name}
                onChange={(e) => setProfile(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="Your full legal name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                placeholder="your.email@company.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={profile.phone_number}
                onChange={(e) => setProfile(prev => ({ ...prev, phone_number: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Address Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={profile.address_line1}
                  onChange={(e) => setProfile(prev => ({ ...prev, address_line1: e.target.value }))}
                  placeholder="123 Main Street"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={profile.city}
                  onChange={(e) => setProfile(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={profile.state}
                  onChange={(e) => setProfile(prev => ({ ...prev, state: e.target.value }))}
                  placeholder="State"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="postal">Postal Code</Label>
                <Input
                  id="postal"
                  value={profile.postal_code}
                  onChange={(e) => setProfile(prev => ({ ...prev, postal_code: e.target.value }))}
                  placeholder="12345"
                />
              </div>
            </div>
          </div>

          {/* Organization Management */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Building className="h-5 w-5" />
              Organization
            </h3>
            
            {isSuperAdmin ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="organization">Select Organization</Label>
                  <Select
                    value={profile.organization_id || ''}
                    onValueChange={(value) => {
                      const org = organizations.find(o => o.id === value);
                      setProfile(prev => ({
                        ...prev,
                        organization_id: value,
                        organization_name: org?.name || ''
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="new_org">Or Create New Organization</Label>
                  <div className="flex gap-2">
                    <Input
                      id="new_org"
                      value={profile.organization_name}
                      onChange={(e) => setProfile(prev => ({ ...prev, organization_name: e.target.value }))}
                      placeholder="New organization name"
                    />
                    <Button onClick={handleCreateOrganization} variant="outline">
                      Create
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="org_name">Organization Name</Label>
                <Input
                  id="org_name"
                  value={profile.organization_name}
                  onChange={(e) => setProfile(prev => ({ ...prev, organization_name: e.target.value }))}
                  placeholder="Your organization name"
                />
              </div>
            )}
          </div>

          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="w-full md:w-auto"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};