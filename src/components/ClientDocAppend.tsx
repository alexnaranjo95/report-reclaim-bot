import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Paperclip, Upload, X, FileImage, FileText, Settings } from 'lucide-react';
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
  const [adminFiles, setAdminFiles] = useState<File[]>([]);
  const [storedExampleDocs, setStoredExampleDocs] = useState<AdminExampleDoc[]>([]);
  const [isUploading, setIsUploading] = useState(false);

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

  const uploadFileToStorage = async (file: File, category: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${category}.${fileExt}`;
    const filePath = `examples/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('admin-examples')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('admin-examples')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const saveExampleDocToDB = async (file: File, category: string, fileUrl: string) => {
    const { error } = await supabase
      .from('admin_example_documents')
      .upsert({
        category,
        file_url: fileUrl,
        file_name: file.name
      }, { onConflict: 'category' });

    if (error) throw error;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!isAdmin) return;
    
    // Validate file types
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'].includes(file.type);
      if (!isValidType) {
        toast.error(`Invalid file type: ${file.name}. Only PNG, JPG, and PDF files are allowed.`);
      }
      return isValidType;
    });

    if (validFiles.length === 0) return;

    setIsUploading(true);
    
    try {
      // For now, we'll determine category based on file name or ask user
      // Simplified: assign first file as gov_id, second as proof_of_address, third as ssn
      const categories = ['gov_id', 'proof_of_address', 'ssn'];
      
      for (let i = 0; i < validFiles.length && i < categories.length; i++) {
        const file = validFiles[i];
        const category = categories[i];
        
        const fileUrl = await uploadFileToStorage(file, category);
        await saveExampleDocToDB(file, category, fileUrl);
        
        toast.success(`Uploaded ${file.name} as ${category.replace('_', ' ')}`);
      }
      
      await loadStoredExampleDocs();
      setAdminFiles(prev => [...prev, ...validFiles]);
      onAdminFilesChange?.(adminFiles.concat(validFiles));
      
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error('Failed to upload files');
    } finally {
      setIsUploading(false);
    }
  }, [isAdmin, adminFiles, onAdminFilesChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'application/pdf': ['.pdf']
    },
    disabled: !isAdmin || isUploading
  });

  const removeAdminFile = (index: number) => {
    const newFiles = adminFiles.filter((_, i) => i !== index);
    setAdminFiles(newFiles);
    onAdminFilesChange?.(newFiles);
  };

  const removeStoredDoc = async (docId: string, category: string) => {
    try {
      // Delete from database
      const { error: dbError } = await supabase
        .from('admin_example_documents')
        .delete()
        .eq('id', docId);

      if (dbError) throw dbError;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('admin-examples')
        .remove([`examples/${category}.png`, `examples/${category}.jpg`, `examples/${category}.pdf`]);

      // Don't throw on storage error as file might not exist
      if (storageError) console.warn('Storage deletion error:', storageError);

      await loadStoredExampleDocs();
      toast.success('Example document removed');
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

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <FileImage className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'gov_id': return 'Government ID';
      case 'proof_of_address': return 'Proof of Address';
      case 'ssn': return 'Social Security';
      default: return category;
    }
  };

  return (
    <div className="space-y-6">
      {/* Client Document Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="w-5 h-5" />
            Append Client Documents
          </CardTitle>
          <CardDescription>
            Configure which client documents will be appended to the final letter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="include-gov-id"
                  checked={settings.includeGovId}
                  onChange={() => handleToggleChange('includeGovId')}
                  className="rounded border-border"
                />
                <Label htmlFor="include-gov-id" className="font-medium">
                  Government ID
                </Label>
              </div>
              <Badge variant="outline" className="text-xs">
                Driver's License, State ID, Passport
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="include-proof-address"
                  checked={settings.includeProofOfAddress}
                  onChange={() => handleToggleChange('includeProofOfAddress')}
                  className="rounded border-border"
                />
                <Label htmlFor="include-proof-address" className="font-medium">
                  Proof of Address
                </Label>
              </div>
              <Badge variant="outline" className="text-xs">
                Utility Bill, Bank Statement, Lease
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="include-ssn"
                  checked={settings.includeSSN}
                  onChange={() => handleToggleChange('includeSSN')}
                  className="rounded border-border"
                />
                <Label htmlFor="include-ssn" className="font-medium">
                  Social Security Number
                </Label>
              </div>
              <Badge variant="outline" className="text-xs">
                SSN Card, W-2, Tax Document
              </Badge>
            </div>
          </div>

          {(settings.includeGovId || settings.includeProofOfAddress || settings.includeSSN) && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> Documents will be appended to the final PDF in the order listed above. 
                Ensure clients have uploaded the required documents in their profile settings.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin Preview Documents */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Example ID Documents (Preview Only)
            </CardTitle>
            <CardDescription>
              Upload sample documents to test layout and print margins in preview mode
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload Zone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {isDragActive
                  ? 'Drop files here...'
                  : 'Drag & drop files here, or click to select'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports PNG, JPG, PDF files
              </p>
            </div>

            {/* Stored Example Documents */}
            {storedExampleDocs.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Stored Example Documents:</Label>
                <div className="space-y-2">
                  {storedExampleDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-800">
                          {getCategoryLabel(doc.category)}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {doc.file_name}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStoredDoc(doc.id, doc.category)}
                        className="h-6 w-6 p-0 hover:bg-red-50"
                      >
                        <X className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Temporary Upload Files */}
            {adminFiles.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Recent Uploads:</Label>
                <div className="space-y-2">
                  {adminFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded border"
                    >
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.type)}
                        <span className="text-sm truncate max-w-[200px]">
                          {file.name}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {(file.size / 1024 / 1024).toFixed(1)} MB
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAdminFile(index)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Persistent Storage:</strong> Uploaded files are stored permanently and used across all template previews. 
                These example documents help visualize how client documents will appear when appended to letters.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientDocAppend;