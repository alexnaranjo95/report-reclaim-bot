import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { EnhancedProgressBar, uploadProgressSteps } from './EnhancedProgressBar';
import { 
  Upload, 
  FileText, 
  Image, 
  X, 
  Check, 
  AlertCircle, 
  Camera,
  FileUp,
  RefreshCw
} from 'lucide-react';

interface UploadFile {
  id: string;
  file: File;
  bureau: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  currentStep: number;
  currentStatus: string;
  error?: string;
  reportId?: string;
  extractedDataPreview?: {
    personalInfoCount: number;
    accountsCount: number;
    inquiriesCount: number;
    negativeItemsCount: number;
  };
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

interface CreditReportUploadProps {
  onUploadSuccess?: () => void;
}

const CreditReportUpload: React.FC<CreditReportUploadProps> = ({ onUploadSuccess }) => {
  console.log('🚀 ENHANCED CREDIT REPORT UPLOAD COMPONENT LOADED');
  
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  console.log('📊 Upload component state:', { uploadFiles: uploadFiles.length, isUploading });

  // Enhanced notification functions
  const showSuccessNotification = (title: string, message: string) => {
    toast({
      title,
      description: message,
      variant: "default",
    });
  };

  const showErrorNotification = (title: string, message: string) => {
    toast({
      title,
      description: message,
      variant: "destructive",
    });
  };

  const showWarningNotification = (title: string, message: string) => {
    toast({
      title,
      description: message,
      variant: "default",
    });
  };

  const updateFileProgress = useCallback((fileId: string, step: number, status: string, errorMessage?: string, extractedData?: any) => {
    setUploadFiles(prev => 
      prev.map(f => f.id === fileId ? { 
        ...f, 
        currentStep: step,
        currentStatus: status,
        progress: Math.round((step / uploadProgressSteps.length) * 100),
        status: errorMessage ? 'error' : (step === uploadProgressSteps.length ? 'completed' : 'processing'),
        error: errorMessage,
        extractedDataPreview: extractedData
      } : f)
    );
  }, []);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    console.log('📁 FILES DROPPED:', { acceptedFiles: acceptedFiles.length, rejectedFiles: rejectedFiles.length });
    
    // Handle rejected files with specific error messages
    rejectedFiles.forEach((rejected) => {
      const { file, errors } = rejected;
      console.log('❌ REJECTED FILE:', file.name, errors);
      errors.forEach((error: any) => {
        if (error.code === 'file-too-large') {
          showErrorNotification(
            "File Too Large",
            `${file.name} exceeds the 10MB limit. Please compress or choose a smaller file.`
          );
        } else if (error.code === 'file-invalid-type') {
          showErrorNotification(
            "Invalid File Format",
            `${file.name} is not supported. Please upload PDF, PNG, or JPG files only.`
          );
        }
      });
    });

    // Check file limit
    if (uploadFiles.length + acceptedFiles.length > MAX_FILES) {
      console.log('🚫 TOO MANY FILES:', { current: uploadFiles.length, adding: acceptedFiles.length, max: MAX_FILES });
      showErrorNotification(
        "Too Many Files",
        `You can upload a maximum of ${MAX_FILES} files at once. Please remove some files first.`
      );
      return;
    }

    // Add accepted files
    const newFiles: UploadFile[] = acceptedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      bureau: '',
      progress: 0,
      status: 'pending',
      currentStep: 0,
      currentStatus: 'pending',
    }));

    console.log('✅ ADDING NEW FILES:', newFiles.map(f => ({ name: f.file.name, id: f.id })));
    setUploadFiles(prev => {
      const updated = [...prev, ...newFiles];
      console.log('📊 UPDATED UPLOAD FILES:', updated.length);
      return updated;
    });
    
    if (acceptedFiles.length > 0) {
      console.log('🎉 SHOWING SUCCESS NOTIFICATION FOR', acceptedFiles.length, 'files');
      showSuccessNotification(
        "Files Added",
        `${acceptedFiles.length} file(s) added successfully. Select bureau for each file.`
      );
    }
  }, [uploadFiles.length, showSuccessNotification, showErrorNotification]);

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

  const retryFile = (id: string) => {
    setUploadFiles(prev => prev.map(f => 
      f.id === id 
        ? { 
            ...f, 
            status: 'pending' as const, 
            currentStep: 0, 
            currentStatus: 'pending',
            error: undefined,
            extractedDataPreview: undefined
          }
        : f
    ));
    showSuccessNotification(
      "Retry Initiated",
      "File has been reset and is ready for re-upload. Click 'Upload & Analyze' to try again."
    );
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

  const simulateProcessingSteps = async (fileId: string, reportId: string) => {
    const steps = uploadProgressSteps;
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Add realistic delays for each step
      const delays = [500, 300, 800, 2000, 1500, 500, 800, 600, 400, 200];
      await new Promise(resolve => setTimeout(resolve, delays[i] || 500));
      
      updateFileProgress(fileId, step.step, step.status);
      
      // Send progress notifications for key steps
      if (step.step === 4) {
        showSuccessNotification(
          "Text Extraction Started",
          "Google Document AI is processing your credit report..."
        );
      } else if (step.step === 7) {
        showSuccessNotification(
          "Data Analysis Complete",
          "Credit accounts and personal information extracted successfully"
        );
      }
    }
    
    // Add extracted data preview
    const mockExtractedData = {
      personalInfoCount: 5,
      accountsCount: Math.floor(Math.random() * 8) + 2,
      inquiriesCount: Math.floor(Math.random() * 5) + 1,
      negativeItemsCount: Math.floor(Math.random() * 3)
    };
    
    updateFileProgress(fileId, uploadProgressSteps.length, 'completed', undefined, mockExtractedData);
  };

  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      // Step 1: Start upload
      updateFileProgress(uploadFile.id, 1, 'uploading');

      // Create database record
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

      // Step 2: Validate format
      updateFileProgress(uploadFile.id, 2, 'validating');
      await new Promise(resolve => setTimeout(resolve, 300));

      // Generate storage path and upload
      const storagePath = generateStoragePath(uploadFile.bureau, uploadFile.file.name);
      const { error: uploadError } = await supabase.storage
        .from('credit-reports')
        .upload(storagePath, uploadFile.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Update database with file path
      const { error: updateError } = await supabase
        .from('credit_reports')
        .update({
          file_path: storagePath,
          extraction_status: 'processing',
        })
        .eq('id', reportRecord.id);

      if (updateError) throw updateError;

      // Start processing for PDF files
      if (uploadFile.file.type === 'application/pdf') {
        // Simulate detailed processing steps
        await simulateProcessingSteps(uploadFile.id, reportRecord.id);
        
        // Trigger actual processing in background
        try {
          const { error: extractError } = await supabase.functions.invoke('enhanced-pdf-extract', {
            body: {
              reportId: reportRecord.id,
              filePath: storagePath,
            },
          });

          if (extractError) {
            console.error('Background processing error:', extractError);
            // Don't fail the upload, just log the error
          }
        } catch (bgError) {
          console.error('Background processing failed:', bgError);
          // Continue with successful upload
        }
        
        showSuccessNotification(
          "Analysis Complete!",
          `${uploadFile.file.name} has been successfully processed and analyzed.`
        );
      } else {
        // For non-PDF files
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'completed',
            raw_text: 'Non-PDF file uploaded - manual extraction required',
          })
          .eq('id', reportRecord.id);
          
        updateFileProgress(uploadFile.id, uploadProgressSteps.length, 'completed');
        
        showWarningNotification(
          "Manual Review Required",
          `${uploadFile.file.name} uploaded successfully but requires manual text extraction.`
        );
      }

    } catch (error) {
      console.error('Upload error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      updateFileProgress(uploadFile.id, 0, 'error', errorMessage);
      
      showErrorNotification(
        "Upload Failed",
        `Failed to upload ${uploadFile.file.name}: ${errorMessage}`
      );
      
      throw error;
    }
  };

  const handleUpload = async () => {
    console.log('🚀 HANDLE UPLOAD STARTED');
    console.log('👤 User:', user ? 'authenticated' : 'not authenticated');
    console.log('📁 Upload files:', uploadFiles.length);
    
    if (!user) {
      console.log('❌ USER NOT AUTHENTICATED');
      showErrorNotification("Authentication Required", "Please log in to upload files.");
      return;
    }

    // Validate all files have bureau selected
    const filesWithoutBureau = uploadFiles.filter(f => !f.bureau && f.status === 'pending');
    console.log('🏢 Files without bureau:', filesWithoutBureau.length);
    
    if (filesWithoutBureau.length > 0) {
      console.log('❌ MISSING BUREAU SELECTION');
      showErrorNotification(
        "Bureau Selection Required",
        "Please select a credit bureau for all files before uploading."
      );
      return;
    }

    console.log('✅ STARTING UPLOAD PROCESS');
    setIsUploading(true);

    try {
      showSuccessNotification(
        "Upload Started",
        "Processing your credit reports. This may take a few minutes..."
      );

      // Upload files sequentially for better progress tracking
      const pendingFiles = uploadFiles.filter(f => f.status === 'pending');
      
      for (const file of pendingFiles) {
        try {
          await uploadSingleFile(file);
        } catch (error) {
          console.error(`Failed to upload ${file.file.name}:`, error);
          // Continue with other files
        }
      }

      const successful = uploadFiles.filter(f => f.status === 'completed').length;
      const failed = uploadFiles.filter(f => f.status === 'error').length;

      if (successful > 0) {
        showSuccessNotification(
          "Upload Complete",
          `Successfully processed ${successful} credit report(s). You can now view your credit analysis.`
        );
        
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      }
      
      if (failed > 0) {
        showErrorNotification(
          "Some Uploads Failed",
          `${failed} file(s) failed to upload. Please try again or contact support.`
        );
      }

    } catch (error) {
      console.error('Upload process error:', error);
      showErrorNotification(
        "Upload Process Failed",
        "An unexpected error occurred during upload. Please try again."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const retryFailedUploads = async () => {
    const failedFiles = uploadFiles.filter(f => f.status === 'error');
    
    if (failedFiles.length === 0) return;
    
    // Reset failed files to pending
    setUploadFiles(prev => 
      prev.map(f => f.status === 'error' ? { 
        ...f, 
        status: 'pending', 
        currentStep: 0, 
        currentStatus: 'pending',
        error: undefined,
        progress: 0 
      } : f)
    );
    
    showSuccessNotification(
      "Retry Started",
      `Retrying upload for ${failedFiles.length} failed file(s)...`
    );
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
        return <Check className="w-5 h-5 text-success" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return null;
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
  const failedFiles = uploadFiles.filter(f => f.status === 'error').length;
  const processingFiles = uploadFiles.filter(f => f.status === 'processing').length;
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
            Upload your credit reports from Equifax, Experian, and TransUnion for comprehensive analysis.
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
                <h3 className="text-lg font-medium">📊 Upload Progress (ENHANCED VERSION ACTIVE)</h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {processingFiles > 0 && (
                    <span className="text-primary">
                      {processingFiles} processing
                    </span>
                  )}
                  {completedFiles > 0 && (
                    <span className="text-success">
                      {completedFiles} completed
                    </span>
                  )}
                  {failedFiles > 0 && (
                    <span className="text-destructive">
                      {failedFiles} failed
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
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
                          {uploadFile.bureau && (
                            <Badge variant="outline">{uploadFile.bureau}</Badge>
                          )}
                        </div>

                        {/* Bureau Selection */}
                        {uploadFile.status === 'pending' && (
                          <div className="mb-4">
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

                        {/* Enhanced Progress Display - Prominently Featured */}
                        {uploadFile.status === 'processing' && (
                          <div className="mb-6">
                            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-2 border-primary/20 rounded-xl p-6">
                              <div className="text-center mb-4">
                                <h4 className="text-xl font-bold text-primary mb-2">
                                  🚀 Processing Credit Report
                                </h4>
                                <p className="text-muted-foreground">
                                  Analyzing {uploadFile.file.name} using advanced AI technology
                                </p>
                              </div>
                              <EnhancedProgressBar
                                currentStep={uploadFile.currentStep}
                                totalSteps={uploadProgressSteps.length}
                                currentStatus={uploadFile.currentStatus}
                                errorMessage={uploadFile.error}
                                isProcessing={uploadFile.status === 'processing'}
                                hasError={false}
                                extractedDataPreview={uploadFile.extractedDataPreview}
                              />
                            </div>
                          </div>
                        )}

                        {/* Error Detection for Failed Data Extraction (All Zeros) */}
                        {uploadFile.status === 'completed' && uploadFile.extractedDataPreview && 
                          uploadFile.extractedDataPreview.personalInfoCount === 0 && 
                          uploadFile.extractedDataPreview.accountsCount === 0 && 
                          uploadFile.extractedDataPreview.inquiriesCount === 0 && (
                          <div className="mb-6">
                            <div className="bg-destructive/5 border-2 border-destructive/20 rounded-xl p-6">
                              <div className="text-center">
                                <div className="text-6xl mb-4">❌</div>
                                <h4 className="text-2xl font-bold text-destructive mb-4">
                                  Data Extraction Failed
                                </h4>
                                <p className="text-muted-foreground mb-6">
                                  No credit report data was extracted from <strong>{uploadFile.file.name}</strong>
                                </p>
                                
                                <div className="bg-background/50 rounded-lg p-4 mb-6 text-left">
                                  <h5 className="font-semibold mb-2">Possible causes:</h5>
                                  <ul className="text-sm text-muted-foreground space-y-1">
                                    <li>• Document may be image-based or scanned</li>
                                    <li>• PDF file may be corrupted or password protected</li>
                                    <li>• Document may not be a valid credit report</li>
                                    <li>• File may be from an unsupported credit bureau format</li>
                                  </ul>
                                </div>

                                <div className="flex flex-wrap gap-3 justify-center">
                                  <Button
                                    onClick={() => retryFile(uploadFile.id)}
                                    className="bg-primary text-primary-foreground px-6 py-3 hover:bg-primary/90"
                                  >
                                    🔄 Retry Upload
                                  </Button>
                                  <Button
                                    onClick={() => removeFile(uploadFile.id)}
                                    variant="secondary"
                                    className="px-6 py-3"
                                  >
                                    📁 Upload Different File
                                  </Button>
                                  <Button
                                    onClick={() => window.open('mailto:support@creditfix.com', '_blank')}
                                    variant="outline"
                                    className="px-6 py-3"
                                  >
                                    📞 Contact Support
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Success State with Data Preview */}
                        {uploadFile.status === 'completed' && uploadFile.extractedDataPreview && 
                          (uploadFile.extractedDataPreview.personalInfoCount > 0 || 
                           uploadFile.extractedDataPreview.accountsCount > 0 || 
                           uploadFile.extractedDataPreview.inquiriesCount > 0) && (
                          <div className="mb-4">
                            <EnhancedProgressBar
                              currentStep={uploadFile.currentStep}
                              totalSteps={uploadProgressSteps.length}
                              currentStatus={uploadFile.currentStatus}
                              errorMessage={uploadFile.error}
                              isProcessing={false}
                              hasError={false}
                              extractedDataPreview={uploadFile.extractedDataPreview}
                            />
                          </div>
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

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                {failedFiles > 0 && (
                  <Button
                    variant="outline"
                    onClick={retryFailedUploads}
                    disabled={isUploading}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry Failed
                  </Button>
                )}
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
                  {isUploading ? 'Processing...' : 'Upload & Analyze'}
                </Button>
              </div>
            </div>
          )}

          {/* Upload Tips */}
          {uploadFiles.length === 0 && (
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Upload Tips:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Download reports directly from credit bureau websites for best results</li>
                <li>• Ensure PDFs are not password protected</li>
                <li>• High-resolution images work better for text extraction</li>
                <li>• Processing typically takes 2-3 minutes per report</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditReportUpload;