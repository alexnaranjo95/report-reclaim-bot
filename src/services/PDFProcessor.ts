import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export class PDFProcessor {
  static async extractTextFromPDF(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error('Failed to process PDF file. Please ensure it\'s a valid credit report.');
    }
  }

  static detectBureauType(text: string): string[] {
    const bureaus = [];
    
    if (text.toLowerCase().includes('experian') || text.toLowerCase().includes('exp ')) {
      bureaus.push('Experian');
    }
    if (text.toLowerCase().includes('equifax') || text.toLowerCase().includes('efx')) {
      bureaus.push('Equifax');
    }
    if (text.toLowerCase().includes('transunion') || text.toLowerCase().includes('tu ')) {
      bureaus.push('TransUnion');
    }
    
    return bureaus.length > 0 ? bureaus : ['Unknown'];
  }

  static cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }
}