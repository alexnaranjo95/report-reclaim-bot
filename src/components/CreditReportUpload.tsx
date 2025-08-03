import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  Upload, 
  FileText, 
  Image, 
  X, 
  Check, 
  AlertCircle, 
  Camera,
  FileUp
} from 'lucide-react';

interface UploadFile {
  id: string;
  file: File;
  bureau: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  recordId?: string;
}

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 3;

const bureauOptions = [
  { value: 'Equifax', label: 'Equifax' },
  { value: 'Experian', label: 'Experian' },
  { value: 'TransUnion', label: 'TransUnion' },
];

const CreditReportUpload: React.FC = () => {
  const { user } = useAuth();
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    // Handle rejected files
    rejectedFiles.forEach((rejected) => {
      const { file, errors } = rejected;
      errors.forEach((error: any) => {
        if (error.code === 'file-too-large') {
          toast.error(`${file.name} is too large. Maximum size is 10MB.`);
        } else if (error.code === 'file-invalid-type') {
          toast.error(`${file.name} is not a supported file type. Please upload PDF or image files.`);
        }
      });
    });

    // Check if adding files would exceed limit
    if (uploadFiles.length + acceptedFiles.length > MAX_FILES) {
      toast.error(`You can only upload up to ${MAX_FILES} files at once.`);
      return;
    }

    // Add accepted files
    const newFiles: UploadFile[] = acceptedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      bureau: '', // Will be set by user
      progress: 0,
      status: 'pending',
    }));

    setUploadFiles(prev => [...prev, ...newFiles]);
  }, [uploadFiles.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    disabled: uploadFiles.length >= MAX_FILES || isUploading,
  });

  const removeFile = (fileId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const updateFileBureau = (fileId: string, bureau: string) => {
    setUploadFiles(prev => 
      prev.map(f => f.id === fileId ? { ...f, bureau } : f)
    );
  };

  const generateStoragePath = (bureau: string, fileName: string): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const timestamp = now.getTime();
    const extension = fileName.split('.').pop();
    
    return `${user?.id}/${year}/${month}/${bureau}_${timestamp}.${extension}`;
  };

  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Update status to uploading
    setUploadFiles(prev => 
      prev.map(f => f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0 } : f)
    );

    try {
      // Create database record first
      const { data: reportRecord, error: dbError } = await supabase
        .from('credit_reports')
        .insert({
          user_id: user.id,
          bureau_name: uploadFile.bureau,
          file_name: uploadFile.file.name,
          extraction_status: 'pending',
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Update with record ID
      setUploadFiles(prev => 
        prev.map(f => f.id === uploadFile.id ? { ...f, recordId: reportRecord.id } : f)
      );

      // Generate storage path
      const storagePath = generateStoragePath(uploadFile.bureau, uploadFile.file.name);

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('credit-reports')
        .upload(storagePath, uploadFile.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Update database record with file path
      const { error: updateError } = await supabase
        .from('credit_reports')
        .update({
          file_path: storagePath,
          extraction_status: 'processing', // Set to processing for Adobe extraction
        })
        .eq('id', reportRecord.id);

      if (updateError) throw updateError;

      // Trigger Adobe PDF extraction for PDF files
      if (uploadFile.file.type === 'application/pdf') {
        try {
          const { error: extractError } = await supabase.functions.invoke('adobe-pdf-extract', {
            body: {
              reportId: reportRecord.id,
              filePath: storagePath,
            },
          });

          if (extractError) {
            console.error('Adobe extraction error:', extractError);
            // Don't fail the upload, just log the error
          }
        } catch (extractError) {
          console.error('Failed to trigger Adobe extraction:', extractError);
          // Don't fail the upload, extraction can be retried later
        }
      }

      // Update status to completed
      setUploadFiles(prev => 
        prev.map(f => f.id === uploadFile.id ? { ...f, status: 'completed', progress: 100 } : f)
      );

    } catch (error) {
      console.error('Upload error:', error);
      
      // Update status to error
      setUploadFiles(prev => 
        prev.map(f => f.id === uploadFile.id ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Upload failed'
        } : f)
      );

      throw error;
    }
  };

  const handleUpload = async () => {
    if (!user) {
      toast.error('Please log in to upload files.');
      return;
    }

    // Validate all files have bureau selected
    const filesWithoutBureau = uploadFiles.filter(f => !f.bureau && f.status === 'pending');
    if (filesWithoutBureau.length > 0) {
      toast.error('Please select a bureau for all files before uploading.');
      return;
    }

    setIsUploading(true);

    try {
      // Upload files in parallel
      const pendingFiles = uploadFiles.filter(f => f.status === 'pending');
      await Promise.allSettled(
        pendingFiles.map(file => uploadSingleFile(file))
      );

      const successful = uploadFiles.filter(f => f.status === 'completed').length;
      const failed = uploadFiles.filter(f => f.status === 'error').length;

      if (successful > 0) {
        toast.success(`Successfully uploaded ${successful} file(s)`);
      }
      if (failed > 0) {
        toast.error(`Failed to upload ${failed} file(s)`);
      }

    } catch (error) {
      console.error('Upload process error:', error);
      toast.error('Upload process failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') {
      return <FileText className="w-8 h-8 text-red-500" />;
    }
    return <Image className="w-8 h-8 text-blue-500" />;
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'completed':
        return <Check className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'uploading':
        return <Badge variant="default">Uploading</Badge>;
      case 'processing':
        return (
          <Badge variant="default" className="bg-blue-500">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Extracting Text...
            </div>
          </Badge>
        );
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Ready for Analysis</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const completedFiles = uploadFiles.filter(f => f.status === 'completed').length;
  const totalFiles = uploadFiles.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="w-6 h-6" />
            Upload Credit Reports
          </CardTitle>
          <CardDescription>
            Upload your credit reports from Equifax, Experian, and TransUnion for analysis.
            Supported formats: PDF, PNG, JPG (max 10MB each)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Area */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
              ${isDragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
              }
              ${uploadFiles.length >= MAX_FILES || isUploading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <Camera className="w-10 h-10 text-muted-foreground md:hidden" />
              </div>
              <div>
                <p className="text-lg font-medium">
                  {isDragActive 
                    ? 'Drop files here...' 
                    : 'Drop credit reports here or click to browse'
                  }
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  PDF, PNG, JPG up to 10MB • Maximum {MAX_FILES} files
                </p>
                <p className="text-xs text-muted-foreground mt-1 md:hidden">
                  Tap to access camera or files
                </p>
              </div>
            </div>
          </div>

          {/* File List */}
          {uploadFiles.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Selected Files</h3>
                <div className="text-sm text-muted-foreground">
                  {completedFiles} of {totalFiles} files ready
                </div>
              </div>

              <div className="space-y-3">
                {uploadFiles.map((uploadFile) => (
                  <Card key={uploadFile.id} className="p-4">
                    <div className="flex items-start gap-4">
                      {getFileIcon(uploadFile.file.name)}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium truncate">{uploadFile.file.name}</p>
                          {getStatusIcon(uploadFile.status)}
                        </div>
                        
                        <div className="flex items-center gap-4 mb-3">
                          <span className="text-sm text-muted-foreground">
                            {formatFileSize(uploadFile.file.size)}
                          </span>
                          {getStatusBadge(uploadFile.status)}
                        </div>

                        {/* Bureau Selection */}
                        {uploadFile.status === 'pending' && (
                          <div className="mb-3">
                            <Select
                              value={uploadFile.bureau}
                              onValueChange={(value) => updateFileBureau(uploadFile.id, value)}
                            >
                              <SelectTrigger className="w-full max-w-48">
                                <SelectValue placeholder="Select Bureau" />
                              </SelectTrigger>
                              <SelectContent>
                                {bureauOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Bureau Display for non-pending files */}
                        {uploadFile.status !== 'pending' && uploadFile.bureau && (
                          <div className="mb-3">
                            <Badge variant="outline">{uploadFile.bureau}</Badge>
                          </div>
                        )}

                        {/* Progress Bar */}
                        {(uploadFile.status === 'uploading' || uploadFile.status === 'processing') && (
                          <Progress value={uploadFile.progress} className="mb-2" />
                        )}

                        {/* Error Message */}
                        {uploadFile.status === 'error' && uploadFile.error && (
                          <Alert className="mb-2">
                            <AlertCircle className="w-4 h-4" />
                            <AlertDescription>{uploadFile.error}</AlertDescription>
                          </Alert>
                        )}
                      </div>

                      {/* Remove Button */}
                      {uploadFile.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeFile(uploadFile.id)}
                          className="shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {/* Upload Button */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setUploadFiles([])}
                  disabled={isUploading}
                >
                  Clear All
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={
                    isUploading || 
                    uploadFiles.length === 0 || 
                    uploadFiles.some(f => f.status === 'pending' && !f.bureau)
                  }
                >
                  {isUploading ? 'Uploading...' : `Upload ${uploadFiles.filter(f => f.status === 'pending').length} Files`}
                </Button>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Tips for best results:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Upload clear, high-quality scans or photos</li>
              <li>• Ensure all text is readable and not cut off</li>
              <li>• Include all pages of multi-page reports</li>
              <li>• You can upload up to 3 reports (one per bureau)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditReportUpload;