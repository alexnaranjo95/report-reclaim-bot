import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Upload, FileText, AlertCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PDFValidationGuide } from './PDFValidationGuide';
import { PDFContentValidator } from '@/services/PDFContentValidator';
import { toast } from 'sonner';

interface UploadZoneProps {
  onFileUpload: (file: File) => void;
}

export const UploadZone = ({ onFileUpload }: UploadZoneProps) => {
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    
    // Validate file content before upload
    const validation = await PDFContentValidator.validateFile(file);
    
    if (!validation.isValid) {
      toast.error(`Upload Failed: ${validation.reason}`, {
        description: validation.suggestions?.join(' • ') || 'Please try a different file'
      });
      return;
    }
    
    // For PDFs, inform user about image conversion optimization
    if (file.type === 'application/pdf') {
      toast.success('PDF will be optimized for processing', {
        description: 'Converting to high-quality images for better text extraction'
      });
    } else {
      toast.success('File ready for processing', {
        description: validation.reason || 'File will be processed appropriately'
      });
    }
    
    onFileUpload(file);
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/html': ['.html', '.htm']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024 // 50MB to support images and documents
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
              Drag and drop your credit report file or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supports PDF, images, Word docs, and HTML files up to 50MB
            </p>
          </div>

          <div className="flex gap-2 justify-center">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Choose File
            </Button>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Requirements
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>PDF Upload Requirements</DialogTitle>
                </DialogHeader>
                <PDFValidationGuide />
              </DialogContent>
            </Dialog>
          </div>
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