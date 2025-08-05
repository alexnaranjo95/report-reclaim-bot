import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Set up the PDF.js worker
GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@5.4.54/build/pdf.worker.min.mjs`;

/**
 * Service for converting PDF files to high-quality images
 * Optimized for Textract processing
 */
export class PDFToImageConverter {
  
  /**
   * Convert PDF file to high-quality images suitable for Textract
   */
  static async convertPDFToImages(file: File): Promise<Blob[]> {
    console.log('🖼️ Starting PDF to image conversion...');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument(arrayBuffer).promise;
      const images: Blob[] = [];
      
      console.log(`📄 PDF has ${pdf.numPages} pages`);
      
      // Convert each page to high-quality image
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log(`🔄 Converting page ${pageNum}/${pdf.numPages}`);
        
        const page = await pdf.getPage(pageNum);
        const image = await this.convertPageToImage(page, pageNum);
        images.push(image);
      }
      
      console.log(`✅ Successfully converted ${images.length} pages to images`);
      return images;
      
    } catch (error) {
      console.error('❌ PDF to image conversion failed:', error);
      throw new Error(`PDF conversion failed: ${error.message}`);
    }
  }
  
  /**
   * Convert a single PDF page to high-quality image
   */
  private static async convertPageToImage(page: any, pageNumber: number): Promise<Blob> {
    // High DPI scale for better OCR results (2x is optimal for Textract)
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not create canvas context');
    }
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Render page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
    
    // Convert canvas to high-quality image blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.log(`📷 Page ${pageNumber} converted to ${(blob.size / 1024 / 1024).toFixed(2)}MB image`);
            resolve(blob);
          } else {
            reject(new Error(`Failed to convert page ${pageNumber} to image`));
          }
        },
        'image/png', // PNG for best quality and text clarity
        1.0 // Maximum quality
      );
    });
  }
  
  /**
   * Merge multiple images into a single image for processing
   * Useful when PDF has multiple pages but you want single image processing
   */
  static async mergeImagesToSingle(images: Blob[]): Promise<Blob> {
    console.log('🔗 Merging images into single image...');
    
    if (images.length === 0) {
      throw new Error('No images to merge');
    }
    
    if (images.length === 1) {
      return images[0];
    }
    
    // Load all images
    const imageElements = await Promise.all(
      images.map(blob => this.loadImageFromBlob(blob))
    );
    
    // Calculate total height and max width
    let totalHeight = 0;
    let maxWidth = 0;
    
    imageElements.forEach(img => {
      totalHeight += img.height;
      maxWidth = Math.max(maxWidth, img.width);
    });
    
    // Create merged canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not create merge canvas context');
    }
    
    canvas.width = maxWidth;
    canvas.height = totalHeight;
    
    // Set white background
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw all images vertically
    let currentY = 0;
    imageElements.forEach(img => {
      context.drawImage(img, 0, currentY);
      currentY += img.height;
    });
    
    // Convert to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.log(`✅ Merged image created: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
            resolve(blob);
          } else {
            reject(new Error('Failed to create merged image'));
          }
        },
        'image/png',
        1.0
      );
    });
  }
  
  /**
   * Load image from blob
   */
  private static loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image'));
      };
      img.src = URL.createObjectURL(blob);
    });
  }
  
  /**
   * Validate image for Textract processing
   */
  static validateImageForTextract(blob: Blob): { isValid: boolean; reason?: string } {
    // Check size (AWS Textract limit is 10MB for synchronous operations)
    if (blob.size > 10 * 1024 * 1024) {
      return {
        isValid: false,
        reason: 'Image size exceeds 10MB limit for Textract'
      };
    }
    
    // Check minimum size (too small images don't process well)
    if (blob.size < 10 * 1024) {
      return {
        isValid: false,
        reason: 'Image is too small for reliable text extraction'
      };
    }
    
    return { isValid: true };
  }
}