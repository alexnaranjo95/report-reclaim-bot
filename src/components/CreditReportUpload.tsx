import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface CreditReportUploadProps {
  onUploadComplete?: (reportId: string) => void;
}

export const CreditReportUpload = ({ onUploadComplete }: CreditReportUploadProps) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user || acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploadedFile(file);
    setUploading(true);
    setProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Upload file to Supabase Storage
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('credit-reports')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      setProgress(100);
      clearInterval(progressInterval);

      // Create credit report record
      const { data: reportData, error: reportError } = await supabase
        .from('credit_reports')
        .insert({
          user_id: user.id,
          bureau_name: 'Unknown', // Will be detected during processing
          file_path: uploadData.path,
          file_name: file.name,
          extraction_status: 'pending'
        })
        .select()
        .single();

      if (reportError) throw reportError;

      setUploading(false);
      setProcessing(true);

      // Start PDF processing
      await processPDF(reportData.id, uploadData.path);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
      setUploading(false);
      setProgress(0);
    }
  }, [user]);

  const processPDF = async (reportId: string, filePath: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('pdf-extract', {
        body: { reportId, filePath }
      });

      if (error) throw error;

      setProcessing(false);
      toast.success('Credit report processed successfully!');
      onUploadComplete?.(reportId);

    } catch (error) {
      console.error('Processing error:', error);
      setProcessing(false);
      toast.error('Failed to process credit report');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    disabled: uploading || processing
  });

  const clearFile = () => {
    setUploadedFile(null);
    setProgress(0);
    setUploading(false);
    setProcessing(false);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Upload Credit Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!uploadedFile ? (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'
              }
            `}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              {isDragActive ? 'Drop your credit report here' : 'Upload Credit Report'}
            </h3>
            <p className="text-muted-foreground mb-4">
              Drag and drop your PDF credit report, or click to browse
            </p>
            <Button variant="outline">
              Choose File
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Supports PDF files up to 10MB. Your data is encrypted and secure.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-card-elevated rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">{uploadedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              {!uploading && !processing && (
                <Button variant="ghost" size="sm" onClick={clearFile}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Uploading...</span>
                  <span className="text-sm text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}

            {processing && (
              <div className="flex items-center gap-2 p-4 bg-primary/5 rounded-lg">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                <span className="text-sm font-medium">Processing credit report...</span>
              </div>
            )}

            {!uploading && !processing && (
              <div className="flex items-center gap-2 p-4 bg-success/5 rounded-lg">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">Upload complete</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};