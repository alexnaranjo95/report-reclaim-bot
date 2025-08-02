import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Save, RotateCcw, Image as ImageIcon, Settings } from 'lucide-react';

interface ImageEditorProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onSave: (editedImageBlob: Blob, fileName: string) => void;
  fileName: string;
}

export const ImageEditor = ({ isOpen, onClose, imageSrc, onSave, fileName }: ImageEditorProps) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  
  // Filter states
  const [brightness, setBrightness] = useState([100]);
  const [contrast, setContrast] = useState([100]);
  const [saturation, setSaturation] = useState([100]);
  const [isBlackAndWhite, setIsBlackAndWhite] = useState(false);
  const [sepia, setSepia] = useState(false);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const crop = centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        1,
        width,
        height
      ),
      width,
      height
    );
    setCrop(crop);
  }, []);

  const applyFilters = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Apply CSS filters to canvas context
    const filters = [
      `brightness(${brightness[0]}%)`,
      `contrast(${contrast[0]}%)`,
      `saturate(${saturation[0]}%)`,
      isBlackAndWhite ? 'grayscale(100%)' : '',
      sepia ? 'sepia(100%)' : ''
    ].filter(Boolean).join(' ');

    ctx.filter = filters;
    ctx.drawImage(img, 0, 0);
  }, [brightness, contrast, saturation, isBlackAndWhite, sepia]);

  const getCroppedImg = useCallback(() => {
    if (!imgRef.current || !canvasRef.current || !completedCrop) return null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;

    // Apply filters
    const filters = [
      `brightness(${brightness[0]}%)`,
      `contrast(${contrast[0]}%)`,
      `saturate(${saturation[0]}%)`,
      isBlackAndWhite ? 'grayscale(100%)' : '',
      sepia ? 'sepia(100%)' : ''
    ].filter(Boolean).join(' ');

    ctx.filter = filters;

    ctx.drawImage(
      img,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height
    );

    return canvas;
  }, [completedCrop, brightness, contrast, saturation, isBlackAndWhite, sepia]);

  const handleSave = async () => {
    const croppedCanvas = getCroppedImg();
    if (!croppedCanvas) return;

    croppedCanvas.toBlob(
      (blob) => {
        if (blob) {
          onSave(blob, fileName);
          onClose();
        }
      },
      'image/jpeg',
      0.9
    );
  };

  const resetFilters = () => {
    setBrightness([100]);
    setContrast([100]);
    setSaturation([100]);
    setIsBlackAndWhite(false);
    setSepia(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Edit Image - {fileName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[70vh]">
          {/* Image Preview */}
          <div className="lg:col-span-2 overflow-auto">
            <div className="space-y-4">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={undefined}
                className="max-w-full"
              >
                <img
                  ref={imgRef}
                  alt="Crop preview"
                  src={imageSrc}
                  onLoad={onImageLoad}
                  style={{
                    filter: [
                      `brightness(${brightness[0]}%)`,
                      `contrast(${contrast[0]}%)`,
                      `saturate(${saturation[0]}%)`,
                      isBlackAndWhite ? 'grayscale(100%)' : '',
                      sepia ? 'sepia(100%)' : ''
                    ].filter(Boolean).join(' ')
                  }}
                  className="max-w-full h-auto"
                />
              </ReactCrop>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4 overflow-auto">
            <Tabs defaultValue="filters" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="filters">Filters</TabsTrigger>
                <TabsTrigger value="presets">Presets</TabsTrigger>
              </TabsList>
              
              <TabsContent value="filters" className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Brightness</Label>
                    <Slider
                      value={brightness}
                      onValueChange={setBrightness}
                      max={200}
                      min={0}
                      step={1}
                      className="mt-2"
                    />
                    <span className="text-xs text-muted-foreground">{brightness[0]}%</span>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Contrast</Label>
                    <Slider
                      value={contrast}
                      onValueChange={setContrast}
                      max={200}
                      min={0}
                      step={1}
                      className="mt-2"
                    />
                    <span className="text-xs text-muted-foreground">{contrast[0]}%</span>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Saturation</Label>
                    <Slider
                      value={saturation}
                      onValueChange={setSaturation}
                      max={200}
                      min={0}
                      step={1}
                      className="mt-2"
                    />
                    <span className="text-xs text-muted-foreground">{saturation[0]}%</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="presets" className="space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant={isBlackAndWhite ? "default" : "outline"}
                    onClick={() => setIsBlackAndWhite(!isBlackAndWhite)}
                    size="sm"
                  >
                    Black & White
                  </Button>
                  
                  <Button
                    variant={sepia ? "default" : "outline"}
                    onClick={() => setSepia(!sepia)}
                    size="sm"
                  >
                    Sepia
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setContrast([150]);
                      setBrightness([110]);
                      setSaturation([80]);
                    }}
                    size="sm"
                  >
                    High Contrast
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setContrast([120]);
                      setBrightness([105]);
                      setSaturation([110]);
                    }}
                    size="sm"
                  >
                    Vivid
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-4 border-t">
              <Button onClick={handleSave} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
              
              <Button variant="outline" onClick={resetFilters} className="w-full">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Filters
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};