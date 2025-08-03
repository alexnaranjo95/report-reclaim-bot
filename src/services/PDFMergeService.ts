import { PDFDocument, rgb } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';

export interface DocumentToMerge {
  content: string;
  type: 'html' | 'pdf';
}

class PDFMergeService {
  /**
   * Convert HTML content to PDF bytes using html2pdf.js
   */
  async createPDFFromHTML(htmlContent: string): Promise<Uint8Array> {
    // This would be implemented using html2pdf.js in the browser
    // For now, we'll create a basic PDF with the text content
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // 8.5" x 11" (Letter size)
    
    // Extract text from HTML
    const textContent = this.extractTextFromHTML(htmlContent);
    
    // Add text to PDF with basic formatting
    const fontSize = 12;
    const margin = 72; // 1 inch margins
    const maxWidth = 612 - (margin * 2);
    const lineHeight = fontSize * 1.6;
    
    const lines = this.wrapText(textContent, maxWidth / 6); // Rough character width estimation
    let yPosition = 792 - margin;
    
    for (const line of lines) {
      if (yPosition < margin) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([612, 792]);
        yPosition = 792 - margin;
        newPage.drawText(line, {
          x: margin,
          y: yPosition,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
      } else {
        page.drawText(line, {
          x: margin,
          y: yPosition,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
      }
      yPosition -= lineHeight;
    }
    
    const pdfBytes = await pdfDoc.save();
    return new Uint8Array(pdfBytes);
  }

  /**
   * Merge multiple documents (HTML, PDF) and identification documents into a single PDF
   */
  async mergePDFs(
    documents: DocumentToMerge[],
    identificationDocs?: File[]
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    
    // Process main documents
    for (const doc of documents) {
      if (doc.type === 'html') {
        const htmlPdfBytes = await this.createPDFFromHTML(doc.content);
        const htmlPdf = await PDFDocument.load(htmlPdfBytes);
        const pages = await pdfDoc.copyPages(htmlPdf, htmlPdf.getPageIndices());
        pages.forEach(page => pdfDoc.addPage(page));
      } else if (doc.type === 'pdf') {
        // Handle PDF content (base64 or bytes)
        try {
          const pdfBytes = new Uint8Array(Buffer.from(doc.content, 'base64'));
          const sourcePdf = await PDFDocument.load(pdfBytes);
          const pages = await pdfDoc.copyPages(sourcePdf, sourcePdf.getPageIndices());
          pages.forEach(page => pdfDoc.addPage(page));
        } catch (error) {
          console.error('Error loading PDF document:', error);
        }
      }
    }

    // Append identification documents if provided
    if (identificationDocs && identificationDocs.length > 0) {
      for (const file of identificationDocs) {
        try {
          if (file.type === 'application/pdf') {
            const fileArrayBuffer = await file.arrayBuffer();
            const filePdf = await PDFDocument.load(fileArrayBuffer);
            const pages = await pdfDoc.copyPages(filePdf, filePdf.getPageIndices());
            pages.forEach(page => pdfDoc.addPage(page));
          } else if (file.type.startsWith('image/')) {
            await this.addImageToPDF(pdfDoc, file);
          }
        } catch (error) {
          console.error(`Error processing identification document ${file.name}:`, error);
        }
      }
    }

    const finalPdfBytes = await pdfDoc.save();
    return new Uint8Array(finalPdfBytes);
  }

  /**
   * Add an image file to the PDF as a new page
   */
  private async addImageToPDF(pdfDoc: PDFDocument, imageFile: File): Promise<void> {
    const imageArrayBuffer = await imageFile.arrayBuffer();
    let image;

    try {
      if (imageFile.type === 'image/png') {
        image = await pdfDoc.embedPng(imageArrayBuffer);
      } else if (imageFile.type === 'image/jpeg' || imageFile.type === 'image/jpg') {
        image = await pdfDoc.embedJpg(imageArrayBuffer);
      } else {
        throw new Error(`Unsupported image type: ${imageFile.type}`);
      }

      // Calculate dimensions to fit the image on a letter-size page with margins
      const pageWidth = 612; // 8.5" at 72 DPI
      const pageHeight = 792; // 11" at 72 DPI
      const margin = 72; // 1" margins
      const maxWidth = pageWidth - (margin * 2);
      const maxHeight = pageHeight - (margin * 2);

      let { width, height } = image.scale(1);
      
      // Scale image to fit within margins while maintaining aspect ratio
      const widthRatio = maxWidth / width;
      const heightRatio = maxHeight / height;
      const scaleFactor = Math.min(widthRatio, heightRatio, 1); // Don't scale up

      width *= scaleFactor;
      height *= scaleFactor;

      // Center the image on the page
      const x = (pageWidth - width) / 2;
      const y = (pageHeight - height) / 2;

      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(image, {
        x,
        y,
        width,
        height,
      });
    } catch (error) {
      console.error(`Error embedding image ${imageFile.name}:`, error);
      
      // Create a placeholder page with error message
      const page = pdfDoc.addPage([612, 792]);
      page.drawText(`Error loading image: ${imageFile.name}`, {
        x: 72,
        y: 720,
        size: 12,
        color: rgb(1, 0, 0),
      });
    }
  }

  /**
   * Extract text content from HTML string
   */
  private extractTextFromHTML(html: string): string {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Get text content and clean it up
    let textContent = tempDiv.textContent || tempDiv.innerText || '';
    
    // Decode HTML entities
    const textArea = document.createElement('textarea');
    textArea.innerHTML = textContent;
    textContent = textArea.value;
    
    // Clean up whitespace
    textContent = textContent.replace(/\s+/g, ' ').trim();
    
    return textContent;
  }

  /**
   * Wrap text to fit within a specified width
   */
  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      
      if (testLine.length <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is longer than max width, split it
          lines.push(word.substring(0, maxWidth));
          currentLine = word.substring(maxWidth);
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  /**
   * Upload the merged PDF to Supabase storage
   */
  async uploadMergedPDF(pdfBytes: Uint8Array, fileName: string): Promise<string> {
    try {
      const { data, error } = await supabase.storage
        .from('verification-documents')
        .upload(`merged-pdfs/${fileName}`, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (error) {
        throw error;
      }

      // Get the public URL for the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from('verification-documents')
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading merged PDF:', error);
      throw error;
    }
  }
}

export const pdfMergeService = new PDFMergeService();