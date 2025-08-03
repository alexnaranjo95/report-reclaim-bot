import { PDFDocument, rgb } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';

export interface DocumentToMerge {
  content: string; // HTML content or file path
  type: 'html' | 'pdf';
}

class PDFMergeService {
  async createPDFFromHTML(htmlContent: string): Promise<Uint8Array> {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard US Letter size
    
    // Simple HTML to PDF conversion (basic implementation)
    const cleanText = this.extractTextFromHTML(htmlContent);
    const lines = this.wrapText(cleanText, 500); // Wrap text to fit page width
    
    const fontSize = 12;
    const lineHeight = 15;
    let yPosition = 750; // Start near top of page
    
    for (const line of lines) {
      if (yPosition < 50) {
        // Add new page if we're near the bottom
        const newPage = pdfDoc.addPage([612, 792]);
        yPosition = 750;
        newPage.drawText(line, {
          x: 50,
          y: yPosition,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
      } else {
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
      }
      yPosition -= lineHeight;
    }
    
    return await pdfDoc.save();
  }

  async mergePDFs(documents: DocumentToMerge[], identificationDocs?: File[]): Promise<Uint8Array> {
    const mergedPdf = await PDFDocument.create();
    
    // Process main documents
    for (const doc of documents) {
      if (doc.type === 'html') {
        const pdfBytes = await this.createPDFFromHTML(doc.content);
        const pdf = await PDFDocument.load(pdfBytes);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
      } else if (doc.type === 'pdf') {
        // Handle existing PDF files
        try {
          const response = await fetch(doc.content);
          const pdfBytes = await response.arrayBuffer();
          const pdf = await PDFDocument.load(pdfBytes);
          const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          pages.forEach(page => mergedPdf.addPage(page));
        } catch (error) {
          console.error('Error loading PDF:', error);
        }
      }
    }
    
    // Add identification documents as trailing pages
    if (identificationDocs && identificationDocs.length > 0) {
      for (const idDoc of identificationDocs) {
        try {
          if (idDoc.type === 'application/pdf') {
            const pdfBytes = await idDoc.arrayBuffer();
            const pdf = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
          } else if (idDoc.type.startsWith('image/')) {
            // Convert image to PDF page
            await this.addImageToPDF(mergedPdf, idDoc);
          }
        } catch (error) {
          console.error('Error processing identification document:', error);
        }
      }
    }
    
    return await mergedPdf.save();
  }

  private async addImageToPDF(pdfDoc: PDFDocument, imageFile: File): Promise<void> {
    const imageBytes = await imageFile.arrayBuffer();
    let image;
    
    if (imageFile.type === 'image/jpeg' || imageFile.type === 'image/jpg') {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (imageFile.type === 'image/png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      console.warn('Unsupported image format:', imageFile.type);
      return;
    }
    
    const page = pdfDoc.addPage([612, 792]);
    const { width: imgWidth, height: imgHeight } = image.scale(1);
    
    // Calculate scaling to fit the page while maintaining aspect ratio
    const pageWidth = 562; // Page width minus margins
    const pageHeight = 742; // Page height minus margins
    const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
    
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;
    
    // Center the image on the page
    const x = (612 - scaledWidth) / 2;
    const y = (792 - scaledHeight) / 2;
    
    page.drawImage(image, {
      x,
      y,
      width: scaledWidth,
      height: scaledHeight,
    });
  }

  private extractTextFromHTML(html: string): string {
    // Remove HTML tags and decode entities
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      
      // Rough character width estimation
      if (testLine.length * 7 <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is too long, break it
          lines.push(word);
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  async uploadMergedPDF(pdfBytes: Uint8Array, fileName: string): Promise<string> {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const file = new File([blob], fileName, { type: 'application/pdf' });
    
    const { data, error } = await supabase.storage
      .from('verification-documents')
      .upload(`merged-letters/${fileName}`, file);
    
    if (error) {
      console.error('Error uploading merged PDF:', error);
      throw error;
    }
    
    return data.path;
  }
}

export const pdfMergeService = new PDFMergeService();