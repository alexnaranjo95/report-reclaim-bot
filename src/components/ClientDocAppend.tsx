import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Paperclip, Upload, X, FileText, Loader2, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { DocumentAppendService } from '@/services/DocumentAppendService';

interface DocumentAppendSettings {
  includeGovId: boolean;
  includeProofOfAddress: boolean;
  includeSSN: boolean;
}

interface ClientDocAppendProps {
  settings: DocumentAppendSettings;
  onSettingsChange: (settings: DocumentAppendSettings) => void;
  isAdmin?: boolean;
  onAdminFilesChange?: (files: File[]) => void;
  roundId?: string; // For auto-save functionality
}

interface AdminExampleDoc {
  id: string;
  category: 'gov_id' | 'proof_of_address' | 'ssn';
  file_url: string;
  file_name: string;
}

const ClientDocAppend: React.FC<ClientDocAppendProps> = ({
  settings,
  onSettingsChange,
  isAdmin = false,
  onAdminFilesChange,
  roundId
}) => {
  const [storedExampleDocs, setStoredExampleDocs] = useState<AdminExampleDoc[]>([]);
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [previewDoc, setPreviewDoc] = useState<AdminExampleDoc | null>(null);

  // Load stored example documents on mount
  useEffect(() => {
    if (isAdmin) {
      loadStoredExampleDocs();
    }
  }, [isAdmin]);

  const loadStoredExampleDocs = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_example_documents')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setStoredExampleDocs((data as AdminExampleDoc[]) || []);
    } catch (error) {
      console.error('Error loading stored example docs:', error);
    }
  };

  const uploadFile = async (file: File, category: string) => {
    setIsUploading(prev => ({ ...prev, [category]: true }));
    
    try {
      // Validate file type
      const isValidType = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'].includes(file.type);
      if (!isValidType) {
        toast.error(`Invalid file type. Only PNG, JPG, and PDF files are allowed.`);
        return;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${category}.${fileExt}`;
      const filePath = `examples/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('admin-examples')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('admin-examples')
        .getPublicUrl(filePath);

      // Save to database
      const { error: dbError } = await supabase
        .from('admin_example_documents')
        .upsert({
          category,
          file_url: data.publicUrl,
          file_name: file.name
        }, { onConflict: 'category' });

      if (dbError) throw dbError;

      await loadStoredExampleDocs();
      toast.success(`Uploaded ${getCategoryLabel(category)} example`);
      
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(prev => ({ ...prev, [category]: false }));
    }
  };

  const removeStoredDoc = async (category: string) => {
    try {
      // Delete from database
      const { error: dbError } = await supabase
        .from('admin_example_documents')
        .delete()
        .eq('category', category);

      if (dbError) throw dbError;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('admin-examples')
        .remove([`examples/${category}.png`, `examples/${category}.jpg`, `examples/${category}.pdf`]);

      // Don't throw on storage error as file might not exist
      if (storageError) console.warn('Storage deletion error:', storageError);

      await loadStoredExampleDocs();
      toast.success(`${getCategoryLabel(category)} example removed`);
    } catch (error) {
      console.error('Error removing document:', error);
      toast.error('Failed to remove document');
    }
  };

  const handleToggleChange = async (key: keyof DocumentAppendSettings) => {
    const previousValue = settings[key];
    const newValue = !previousValue;
    
    // Update local state immediately for responsive UI
    const newSettings = {
      ...settings,
      [key]: newValue
    };
    onSettingsChange(newSettings);

    // Auto-save to database if roundId is provided
    if (roundId) {
      setIsSaving(prev => ({ ...prev, [key]: true }));
      
      try {
        await DocumentAppendService.saveRoundAppendSettings(roundId, newSettings);
        toast.success(`Document setting saved`, { duration: 2000 });
      } catch (error) {
        // Revert the change on error
        onSettingsChange({
          ...settings,
          [key]: previousValue
        });
        console.error('Error saving document settings:', error);
        toast.error('Failed to save document setting. Please try again.');
      } finally {
        setIsSaving(prev => ({ ...prev, [key]: false }));
      }
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'gov_id': return 'Government ID';
      case 'proof_of_address': return 'Proof of Address';
      case 'ssn': return 'Social Security';
      default: return category;
    }
  };

  const getStoredDoc = (category: string) => {
    return storedExampleDocs.find(doc => doc.category === category);
  };

  const handleFileUpload = (category: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg,.pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        uploadFile(file, category);
      }
    };
    input.click();
  };

  const previewDocument = (doc: AdminExampleDoc) => {
    setPreviewDoc(doc);
  };

  const DocumentRow = ({ 
    category, 
    settingKey, 
    label, 
    description 
  }: { 
    category: string;
    settingKey: keyof DocumentAppendSettings;
    label: string;
    description: string;
  }) => {
    const storedDoc = getStoredDoc(category);
    const uploading = isUploading[category];
    const saving = isSaving[settingKey];

    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`include-${category}`}
              checked={settings[settingKey]}
              onCheckedChange={() => handleToggleChange(settingKey)}
              disabled={saving}
            />
            {saving && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <Label htmlFor={`include-${category}`} className="font-medium cursor-pointer">
              {label}
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {description}
              </Badge>
              {isAdmin && storedDoc && (
                <div className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-green-600" />
                  <span className="text-xs text-green-600">{storedDoc.file_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {isAdmin && (
          <div className="flex items-center gap-2">
            {storedDoc && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => previewDocument(storedDoc)}
                className="h-8 w-8 p-0"
                title="Preview document"
              >
                <Eye className="w-3 h-3 text-blue-500" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFileUpload(category)}
              disabled={uploading}
              className="h-8"
            >
              <Upload className="w-3 h-3 mr-1" />
              {uploading ? 'Uploading...' : storedDoc ? 'Replace' : 'Upload'}
            </Button>
            {storedDoc && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeStoredDoc(category)}
                className="h-8 w-8 p-0 hover:bg-red-50"
              >
                <X className="w-3 h-3 text-red-500" />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="w-5 h-5" />
          Append Client Documents
        </CardTitle>
        <CardDescription>
          Configure which client documents will be appended to the final letter
          {isAdmin && " and upload example documents for preview"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <DocumentRow
            category="gov_id"
            settingKey="includeGovId"
            label="Government ID"
            description="Driver's License, State ID, Passport"
          />
          
          <DocumentRow
            category="proof_of_address"
            settingKey="includeProofOfAddress"
            label="Proof of Address"
            description="Utility Bill, Bank Statement, Lease"
          />
          
          <DocumentRow
            category="ssn"
            settingKey="includeSSN"
            label="Social Security Number"
            description="SSN Card, W-2, Tax Document"
          />
        </div>

        {(settings.includeGovId || settings.includeProofOfAddress || settings.includeSSN) && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> Documents will be appended to the final PDF in the order listed above. 
              {!isAdmin && " Ensure clients have uploaded the required documents in their profile settings."}
              {isAdmin && " Example documents uploaded here will be used for template previews."}
            </p>
          </div>
        )}

        {/* Document Preview Modal */}
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Document Preview: {previewDoc?.file_name}</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              {previewDoc && (
                <div className="flex items-center justify-center bg-gray-50 border rounded-lg min-h-[400px]">
                  {previewDoc.file_url.toLowerCase().includes('.pdf') ? (
                    <div className="text-center text-muted-foreground p-8">
                      <FileText className="w-16 h-16 mx-auto mb-4" />
                      <p className="font-medium mb-2">PDF Document</p>
                      <p className="text-sm mb-4">{previewDoc.file_name}</p>
                      <Button 
                        onClick={() => window.open(previewDoc.file_url, '_blank')} 
                        variant="outline"
                      >
                        Open in New Tab
                      </Button>
                    </div>
                  ) : (
                    <img 
                      src={previewDoc.file_url} 
                      alt={`Preview of ${previewDoc.file_name}`}
                      className="max-w-full max-h-[600px] object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  )}
                  <div className="hidden text-center text-muted-foreground p-8">
                    <FileText className="w-16 h-16 mx-auto mb-4" />
                    <p>Failed to load preview</p>
                    <Button 
                      onClick={() => window.open(previewDoc?.file_url, '_blank')} 
                      variant="outline"
                      className="mt-2"
                    >
                      Open in New Tab
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default ClientDocAppend;