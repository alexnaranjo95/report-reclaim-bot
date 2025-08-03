import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, Edit3, RotateCcw, FileText, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AdminExampleDoc {
  id: string;
  category: 'gov_id' | 'proof_of_address' | 'ssn';
  file_url: string;
  file_name: string;
}

interface DocumentPreviewModalProps {
  document: AdminExampleDoc | null;
  isOpen: boolean;
  onClose: () => void;
  onDocumentUpdated?: () => void;
}

interface ImageDimensions {
  width: number;
  height: number;
  scale: number;
  aspectRatio: number;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  document,
  isOpen,
  onClose,
  onDocumentUpdated
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [dimensions, setDimensions] = useState<ImageDimensions>({
    width: 0,
    height: 0,
    scale: 100,
    aspectRatio: 1
  });
  const [originalDimensions, setOriginalDimensions] = useState<ImageDimensions>({
    width: 0,
    height: 0,
    scale: 100,
    aspectRatio: 1
  });
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isImage = document?.file_url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);

  const handleImageLoad = () => {
    if (imgRef.current) {
      const { naturalWidth, naturalHeight } = imgRef.current;
      const aspectRatio = naturalWidth / naturalHeight;
      const initialDimensions = {
        width: naturalWidth,
        height: naturalHeight,
        scale: 100,
        aspectRatio
      };
      setDimensions(initialDimensions);
      setOriginalDimensions(initialDimensions);
    }
  };

  const updateDimensions = (field: 'width' | 'height' | 'scale', value: number) => {
    const newDimensions = { ...dimensions };

    if (field === 'scale') {
      newDimensions.scale = value;
      newDimensions.width = Math.round((originalDimensions.width * value) / 100);
      newDimensions.height = Math.round((originalDimensions.height * value) / 100);
    } else if (field === 'width') {
      newDimensions.width = value;
      if (maintainAspectRatio) {
        newDimensions.height = Math.round(value / originalDimensions.aspectRatio);
      }
      newDimensions.scale = Math.round((value / originalDimensions.width) * 100);
    } else if (field === 'height') {
      newDimensions.height = value;
      if (maintainAspectRatio) {
        newDimensions.width = Math.round(value * originalDimensions.aspectRatio);
      }
      newDimensions.scale = Math.round((value / originalDimensions.height) * 100);
    }

    setDimensions(newDimensions);
  };

  const resetToOriginal = () => {
    setDimensions({ ...originalDimensions });
  };

  const fitToWidth = () => {
    const targetWidth = 680; // Standard letter width
    updateDimensions('width', targetWidth);
  };

  const setQuickScale = (scale: number) => {
    updateDimensions('scale', scale);
  };

  const saveResizedImage = async () => {
    if (!document || !imgRef.current || !canvasRef.current) return;

    setIsSaving(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot get canvas context');

      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      // Create a new image element with CORS enabled
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(void 0);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = document.file_url;
      });

      // Draw the resized image
      ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.9);
      });

      // Generate new filename with dimensions
      const fileExt = document.file_name.split('.').pop();
      const baseName = document.file_name.replace(/\.[^/.]+$/, '').replace(/_\d+x\d+$/, ''); // Remove existing dimensions
      const newFileName = `${baseName}_${dimensions.width}x${dimensions.height}.${fileExt}`;
      const filePath = `examples/${newFileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('admin-examples')
        .upload(filePath, blob, { upsert: true });

      if (uploadError) throw uploadError;

      // Get new public URL
      const { data: urlData } = supabase.storage
        .from('admin-examples')
        .getPublicUrl(filePath);

      // Update database record with new URL and filename
      const { error: dbError } = await supabase
        .from('admin_example_documents')
        .update({
          file_url: urlData.publicUrl,
          file_name: newFileName
        })
        .eq('category', document.category);

      if (dbError) throw dbError;

      toast.success('Image resized and saved successfully');
      setIsEditing(false);
      onDocumentUpdated?.();
    } catch (error) {
      console.error('Error saving resized image:', error);
      toast.error('Failed to save resized image');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setDimensions({ ...originalDimensions });
  };

  if (!document) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Document Preview: {document.file_name}</span>
            {isImage && !isEditing && (
              <Button
                onClick={startEditing}
                variant="outline"
                size="sm"
                className="mr-12"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Resize Image
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-auto">
          {isEditing && isImage ? (
            // Image editing mode
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Image preview */}
              <div className="lg:col-span-2">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <img
                    ref={imgRef}
                    src={document.file_url}
                    alt={document.file_name}
                    onLoad={handleImageLoad}
                    className="max-w-full h-auto"
                    style={{
                      width: `${dimensions.width}px`,
                      height: `${dimensions.height}px`,
                      maxWidth: '100%'
                    }}
                  />
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              </div>

              {/* Controls */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Dimensions</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <Label htmlFor="width" className="text-xs">Width</Label>
                      <Input
                        id="width"
                        type="number"
                        value={dimensions.width}
                        onChange={(e) => updateDimensions('width', parseInt(e.target.value) || 0)}
                        min="1"
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label htmlFor="height" className="text-xs">Height</Label>
                      <Input
                        id="height"
                        type="number"
                        value={dimensions.height}
                        onChange={(e) => updateDimensions('height', parseInt(e.target.value) || 0)}
                        min="1"
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    <input
                      type="checkbox"
                      id="maintain-aspect"
                      checked={maintainAspectRatio}
                      onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                      className="h-3 w-3"
                    />
                    <Label htmlFor="maintain-aspect" className="text-xs">
                      Lock aspect ratio
                    </Label>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Scale</Label>
                  <div className="mt-2">
                    <Input
                      type="number"
                      value={dimensions.scale}
                      onChange={(e) => updateDimensions('scale', parseInt(e.target.value) || 0)}
                      min="1"
                      max="500"
                      className="h-8"
                      placeholder="100"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Quick Scale</Label>
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    <Button variant="outline" size="sm" onClick={() => setQuickScale(25)}>
                      25%
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setQuickScale(50)}>
                      50%
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setQuickScale(75)}>
                      75%
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setQuickScale(100)}>
                      100%
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={fitToWidth} className="w-full mt-1">
                    Fit to Width
                  </Button>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <Button
                    onClick={saveResizedImage}
                    disabled={isSaving}
                    className="w-full"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Apply Changes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetToOriginal}
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Original
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={cancelEditing}
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // Normal preview mode
            <div className="flex items-center justify-center min-h-[400px]">
              {isImage ? (
                <img
                  src={document.file_url}
                  alt={document.file_name}
                  className="max-w-full max-h-[70vh] object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  <FileText className="w-16 h-16 mx-auto mb-4" />
                  <p className="font-medium mb-2">PDF Document</p>
                  <p className="text-sm mb-4">{document.file_name}</p>
                  <Button
                    onClick={() => window.open(document.file_url, '_blank')}
                    variant="outline"
                  >
                    Open in New Tab
                  </Button>
                </div>
              )}
              <div className="hidden text-center text-muted-foreground p-8">
                <FileText className="w-16 h-16 mx-auto mb-4" />
                <p>Failed to load preview</p>
                <Button
                  onClick={() => window.open(document?.file_url, '_blank')}
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
  );
};