import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onFileUpload: (file: File) => void;
}

export const UploadZone = ({ onFileUpload }: UploadZoneProps) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileUpload(acceptedFiles[0]);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024 // 10MB
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300",
          "hover:border-primary hover:bg-primary/5",
          isDragActive ? "border-primary bg-primary/10 shadow-glow" : "border-border",
          "animate-fade-in"
        )}
      >
        <input {...getInputProps()} />
        <div className="space-y-4">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            {isDragActive ? (
              <Upload className="h-6 w-6 text-primary animate-bounce" />
            ) : (
              <FileText className="h-6 w-6 text-primary" />
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">
              {isDragActive ? "Drop your credit report here" : "Upload Credit Report"}
            </h3>
            <p className="text-muted-foreground">
              Drag and drop your PDF credit report or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supports PDF files up to 10MB
            </p>
          </div>

          <Button variant="outline" className="mt-4">
            <Upload className="h-4 w-4 mr-2" />
            Choose File
          </Button>
        </div>
      </div>

      {fileRejections.length > 0 && (
        <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span>
            {fileRejections[0].errors[0].code === 'file-too-large' 
              ? 'File is too large. Please select a file under 10MB.'
              : 'Invalid file type. Please select a PDF file.'
            }
          </span>
        </div>
      )}
    </div>
  );
};