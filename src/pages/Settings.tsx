
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Bell, Mail, Phone, Save, Upload, File, X, LogOut, Trash2, Edit3, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DocumentPreview } from '@/components/DocumentPreview';
import { ImageEditor } from '@/components/ImageEditor';
import { Alert, AlertDescription } from '@/components/ui/alert';

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [textNotifications, setTextNotifications] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Format phone number with +1 prefix
  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // If it's 10 digits, add +1 prefix
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    
    // If it already has +1 prefix and 11 digits total, keep as is
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    // Return original value if it doesn't match expected patterns
    return value;
  };
  const [fullName, setFullName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [verificationDocuments, setVerificationDocuments] = useState<VerificationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<{ src: string; fileName: string; documentType: string } | null>(null);

  interface VerificationDocument {
    id: string;
    name: string;
    type: string;
    url: string;
    uploadedAt: string;
    documentType: string;
  }

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

  // Check if all required documents are uploaded
  const getUploadedDocumentTypes = () => {
    return verificationDocuments.map(doc => doc.documentType);
  };

  const getMissingDocumentTypes = () => {
    const uploadedTypes = getUploadedDocumentTypes();
    return requiredDocuments.map(doc => doc.type).filter(type => !uploadedTypes.includes(type));
  };

  const areAllDocumentsUploaded = () => {
    return getMissingDocumentTypes().length === 0;
  };


  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      
      try {
        // Use raw query to bypass TypeScript type checking temporarily
        const { data, error } = await supabase.rpc('get_user_profile', { 
          profile_user_id: user.id 
        }) as { data: any, error: any };
          
        if (error && error.code !== 'PGRST116') {
          console.error('Error loading profile:', error);
          // Set defaults if no profile exists yet
          setEmail(user.email || '');
          setLoading(false);
          return;
        }
        
        if (data && data.length > 0) {
          const profile = data[0];
          setEmailNotifications(profile.email_notifications ?? true);
          setTextNotifications(profile.text_notifications ?? false);
          setEmail(profile.email || user.email || '');
          setPhone(profile.phone_number || '');
          setFullName(profile.full_name || '');
          setAddressLine1(profile.address_line1 || '');
          setCity(profile.city || '');
          setState(profile.state || '');
          setPostalCode(profile.postal_code || '');
          setVerificationDocuments(profile.verification_documents || []);
        } else {
          // Set defaults if no profile exists yet
          setEmail(user.email || '');
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        // Set defaults on error
        setEmail(user.email || '');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    
    try {
      // Format phone number before saving
      const formattedPhone = formatPhoneNumber(phone);
      
      // Use the simpler upsert_user_profile function
      const { error } = await supabase.rpc('upsert_user_profile', {
        profile_user_id: user.id,
        profile_email: email,
        profile_phone_number: formattedPhone,
        profile_email_notifications: emailNotifications,
        profile_text_notifications: textNotifications,
        profile_display_name: fullName || user.user_metadata?.display_name || user.email || '',
        profile_verification_documents: JSON.parse(JSON.stringify(verificationDocuments)),
        profile_full_name: fullName,
        profile_address_line1: addressLine1,
        profile_city: city,
        profile_state: state,
        profile_postal_code: postalCode
      });

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

  const handleFileUpload = async (files: FileList | null, documentType: string) => {
    if (!files || !user) return;
    
    setUploading(true);
    try {
      const uploadedDocuments: VerificationDocument[] = [];
      
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${documentType}-${Date.now()}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('verification-documents')
          .upload(fileName, file);
          
        if (error) throw error;
        
        const newDoc: VerificationDocument = {
          id: data.path,
          name: file.name,
          type: file.type,
          url: data.path,
          uploadedAt: new Date().toISOString(),
          documentType
        };
        
        uploadedDocuments.push(newDoc);
      }
      
      const updatedDocs = [...verificationDocuments, ...uploadedDocuments];
      setVerificationDocuments(updatedDocs);
      
      // Save to profile with updated documents
      await supabase.rpc('upsert_user_profile', {
        profile_user_id: user.id,
        profile_email: email,
        profile_phone_number: phone,
        profile_email_notifications: emailNotifications,
        profile_text_notifications: textNotifications,
        profile_display_name: user.user_metadata?.display_name || user.email || '',
        profile_verification_documents: updatedDocs as any
      });
      
      toast({
        title: "Document uploaded",
        description: `${files.length} file(s) uploaded for ${documentType}`,
      });
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload documents. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async (docId: string) => {
    if (!user) return;
    
    try {
      // Remove from storage
      const { error: storageError } = await supabase.storage
        .from('verification-documents')
        .remove([docId]);
        
      if (storageError) throw storageError;
      
      // Update state
      const updatedDocs = verificationDocuments.filter(doc => doc.id !== docId);
      setVerificationDocuments(updatedDocs);
      
      // Save to profile with updated documents
      await supabase.rpc('upsert_user_profile', {
        profile_user_id: user.id,
        profile_email: email,
        profile_phone_number: phone,
        profile_email_notifications: emailNotifications,
        profile_text_notifications: textNotifications,
        profile_display_name: user.user_metadata?.display_name || user.email || '',
        profile_verification_documents: updatedDocs as any
      });
      
      toast({
        title: "Document removed",
        description: "Document has been removed successfully.",
      });
    } catch (error) {
      console.error('Error removing document:', error);
      toast({
        title: "Remove Failed",
        description: "Failed to remove document. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditImage = async (doc: VerificationDocument) => {
    try {
      // Use public URL instead of signed URL to avoid CORS issues
      const { data } = supabase.storage
        .from('verification-documents')
        .getPublicUrl(doc.url);

      setEditingImage({
        src: data.publicUrl,
        fileName: doc.name,
        documentType: doc.documentType
      });
      setImageEditorOpen(true);
    } catch (error) {
      console.error('Error getting image for editing:', error);
      toast({
        title: "Edit Failed",
        description: "Failed to load image for editing.",
        variant: "destructive",
      });
    }
  };

  const handleSaveEditedImage = async (editedImageBlob: Blob, fileName: string) => {
    if (!user || !editingImage) return;

    try {
      setUploading(true);
      
      // Find the original document to replace
      const originalDoc = verificationDocuments.find(doc => 
        doc.documentType === editingImage.documentType
      );
      
      if (!originalDoc) {
        throw new Error('Original document not found');
      }

      // Delete the old file from storage
      await supabase.storage
        .from('verification-documents')
        .remove([originalDoc.url]);
      
      // Upload the edited image with the same path structure
      const fileExt = fileName.split('.').pop() || 'jpg';
      const newFileName = `${user.id}/${editingImage.documentType}-${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('verification-documents')
        .upload(newFileName, editedImageBlob);
        
      if (error) throw error;
      
      // Update the existing document in the array instead of creating a new one
      const updatedDocs = verificationDocuments.map(doc => 
        doc.id === originalDoc.id 
          ? {
              ...doc,
              name: fileName,
              url: data.path,
              type: editedImageBlob.type,
              uploadedAt: new Date().toISOString()
            }
          : doc
      );
      
      setVerificationDocuments(updatedDocs);
      
      // Update profile with the new document info
      await supabase.rpc('upsert_user_profile', {
        profile_user_id: user.id,
        profile_email: email,
        profile_phone_number: phone,
        profile_email_notifications: emailNotifications,
        profile_text_notifications: textNotifications,
        profile_display_name: user.user_metadata?.display_name || user.email || '',
        profile_verification_documents: updatedDocs as any
      });
      
      // Don't show success message here - it's already shown by ImageEditor
    } catch (error) {
      console.error('Error saving edited image:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save the edited image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setImageEditorOpen(false);
      setEditingImage(null);
    }
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

          {/* Required Profile Information */}
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <File className="h-5 w-5 text-primary" />
                Required Profile Information
              </CardTitle>
              <CardDescription>
                Complete your profile information. All fields marked with <span className="text-red-500">*</span> are required for letter sending.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full-name">
                    Full Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="full-name"
                    type="text"
                    placeholder="Your full legal name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address-line1">
                    Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="address-line1"
                    type="text"
                    placeholder="Street address"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="city">
                    City <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="state">
                    State <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="state"
                    type="text"
                    placeholder="State/Province"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="postal-code">
                    Postal Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="postal-code"
                    type="text"
                    placeholder="ZIP/Postal code"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={handleSave} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Save Profile
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
                <strong className="text-primary"> All three document types are mandatory to create dispute letters.</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Document Requirements Status */}
              {!areAllDocumentsUploaded() && (
                <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Required Documents Status:</strong>
                    <div className="mt-2 space-y-1">
                      {requiredDocuments.map((docType) => {
                        const isUploaded = getUploadedDocumentTypes().includes(docType.type);
                        return (
                          <div key={docType.type} className="flex items-center gap-2">
                            {isUploaded ? (
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            ) : (
                              <X className="h-3 w-3 text-red-600" />
                            )}
                            <span className={isUploaded ? "text-green-700" : "text-red-700"}>
                              {docType.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {getMissingDocumentTypes().length > 0 && (
                      <p className="mt-2 text-sm text-amber-700">
                        Missing: {getMissingDocumentTypes().join(', ')}
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {requiredDocuments.map((docType, index) => (
                <div key={index} className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">{docType.type}</Label>
                    <p className="text-xs text-muted-foreground mt-1">{docType.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Accepted formats: {docType.accepted.join(", ")}
                    </p>
                  </div>
                  
                  <div className={`relative border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center hover:border-primary/50 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground mb-2">
                      {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                    </div>
                    <input
                      type="file"
                      multiple
                      accept={docType.accepted.join(",")}
                      onChange={(e) => handleFileUpload(e.target.files, docType.type)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading}
                    />
                    <Button variant="outline" size="sm" disabled={uploading}>
                      {uploading ? 'Uploading...' : 'Choose Files'}
                    </Button>
                  </div>
                </div>
              ))}

              {verificationDocuments.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Uploaded Documents ({verificationDocuments.length})</Label>
                  <div className="space-y-2">
                    {verificationDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <File className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{doc.name}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {doc.documentType}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(doc.uploadedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <DocumentPreview document={doc} onEdit={handleEditImage} />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeDocument(doc.id)}
                            className="text-destructive hover:text-destructive h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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

      {/* Image Editor */}
      {editingImage && (
        <ImageEditor
          isOpen={imageEditorOpen}
          onClose={() => {
            setImageEditorOpen(false);
            setEditingImage(null);
          }}
          imageSrc={editingImage.src}
          fileName={editingImage.fileName}
          onSave={handleSaveEditedImage}
        />
      )}
    </div>
  );
};

export default Settings;
