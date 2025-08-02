
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Bell, Mail, Phone, Save, Upload, File, X, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [textNotifications, setTextNotifications] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [intakeDocuments, setIntakeDocuments] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);

  const requiredDocuments = [
    { 
      type: "Photo ID", 
      description: "Driver's license, state ID, or passport",
      accepted: [".jpg", ".jpeg", ".png", ".pdf"]
    },
    { 
      type: "Proof of SSN", 
      description: "SSN card, W-2, 1099, pay stub showing last 4",
      accepted: [".jpg", ".jpeg", ".png", ".pdf"]
    },
    { 
      type: "Proof of Address", 
      description: "Utility bill, bank/credit card statement, lease/mortgage statement, car registration/insurance (dated within ~60 days)",
      accepted: [".jpg", ".jpeg", ".png", ".pdf"]
    }
  ];

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
          
        if (error && error.code !== 'PGRST116') {
          console.error('Error loading profile:', error);
          return;
        }
        
        if (data) {
          setEmailNotifications(data.email_notifications ?? true);
          setTextNotifications(data.text_notifications ?? false);
          setEmail(data.email || user.email || '');
          setPhone(data.phone || '');
          // Note: Documents would need separate storage/table for files
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    
    try {
      const profileData = {
        user_id: user.id,
        email,
        phone,
        email_notifications: emailNotifications,
        text_notifications: textNotifications,
        first_name: user.user_metadata?.first_name || '',
        last_name: user.user_metadata?.last_name || '',
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(profileData);

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "Your notification preferences have been updated.",
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save your settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth');
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });
    } catch (error) {
      toast({
        title: "Sign Out Failed",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (files: FileList | null, documentType: string) => {
    if (!files) return;
    
    const newFiles = Array.from(files).map(file => {
      // Add document type to file for tracking
      const fileWithType = Object.assign(file, { documentType });
      return fileWithType;
    });
    
    setIntakeDocuments(prev => [...prev, ...newFiles]);
    
    toast({
      title: "Document uploaded",
      description: `${files.length} file(s) uploaded for ${documentType}`,
    });
  };

  const removeDocument = (index: number) => {
    setIntakeDocuments(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "Document removed",
      description: "Document has been removed from intake.",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="h-6 w-px bg-border" />
              <div>
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Settings
                </h1>
                <p className="text-muted-foreground">Manage your preferences</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSignOut}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
          {/* Notification Settings */}
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how you want to be notified about your credit repair progress
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Email Notifications */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <Label htmlFor="email-notifications" className="font-medium">
                        Email Notifications
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Receive updates about dispute letter responses and progress
                    </p>
                  </div>
                  <Switch
                    id="email-notifications"
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                  />
                </div>
                
                {emailNotifications && (
                  <div className="ml-6 space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Text Notifications */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" />
                      <Label htmlFor="text-notifications" className="font-medium">
                        Text Notifications
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Get SMS alerts for important updates and deadlines
                    </p>
                  </div>
                  <Switch
                    id="text-notifications"
                    checked={textNotifications}
                    onCheckedChange={setTextNotifications}
                  />
                </div>
                
                {textNotifications && (
                  <div className="ml-6 space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSave} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Intake Documents */}
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <File className="h-5 w-5 text-primary" />
                Intake Documents
              </CardTitle>
              <CardDescription>
                Upload required documents for dispute processing. These will be included when sending letters via Postgrid.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {requiredDocuments.map((docType, index) => (
                <div key={index} className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">{docType.type}</Label>
                    <p className="text-xs text-muted-foreground mt-1">{docType.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Accepted formats: {docType.accepted.join(", ")}
                    </p>
                  </div>
                  
                  <div className="relative border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground mb-2">
                      Click to upload or drag and drop
                    </div>
                    <input
                      type="file"
                      multiple
                      accept={docType.accepted.join(",")}
                      onChange={(e) => handleFileUpload(e.target.files, docType.type)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" size="sm">
                      Choose Files
                    </Button>
                  </div>
                </div>
              ))}

              {intakeDocuments.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Uploaded Documents ({intakeDocuments.length})</Label>
                  <div className="space-y-2">
                    {intakeDocuments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <File className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {(file as any).documentType}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDocument(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
