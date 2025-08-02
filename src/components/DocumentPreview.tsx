import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface VerificationDocument {
  id: string;
  name: string;
  type: string;
  url: string;
  uploadedAt: string;
}

interface DocumentPreviewProps {
  document: VerificationDocument;
}

export const DocumentPreview = ({ document }: DocumentPreviewProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePreview = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('verification-documents')
        .createSignedUrl(document.url, 3600); // 1 hour expiry

      if (error) throw error;
      
      setPreviewUrl(data.signedUrl);
      setIsOpen(true);
    } catch (error) {
      console.error('Error getting preview URL:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderPreview = () => {
    if (!previewUrl) return null;

    if (document.type.startsWith('image/')) {
      return (
        <img 
          src={previewUrl} 
          alt={document.name}
          className="max-w-full max-h-[70vh] object-contain mx-auto"
        />
      );
    } else if (document.type === 'application/pdf') {
      return (
        <iframe 
          src={previewUrl} 
          className="w-full h-[70vh] border-0"
          title={document.name}
        />
      );
    } else {
      return (
        <div className="text-center p-8">
          <p className="text-muted-foreground">Preview not available for this file type</p>
          <Button 
            onClick={() => window.open(previewUrl, '_blank')}
            className="mt-4"
          >
            Download to View
          </Button>
        </div>
      );
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePreview}
        disabled={isLoading}
        className="h-8 w-8 p-0"
      >
        <Eye className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{document.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto">
            {renderPreview()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};