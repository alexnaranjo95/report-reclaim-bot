import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Paperclip, Upload, X, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
  onAdminFilesChange
}) => {
  const [storedExampleDocs, setStoredExampleDocs] = useState<AdminExampleDoc[]>([]);
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});

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

  const handleToggleChange = (key: keyof DocumentAppendSettings) => {
    onSettingsChange({
      ...settings,
      [key]: !settings[key]
    });
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

    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id={`include-${category}`}
            checked={settings[settingKey]}
            onChange={() => handleToggleChange(settingKey)}
            className="rounded border-border"
          />
          <div className="flex-1">
            <Label htmlFor={`include-${category}`} className="font-medium">
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
      </CardContent>
    </Card>
  );
};

export default ClientDocAppend;