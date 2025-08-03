import * as pdfjsLib from 'pdfjs-dist';

// Use jsdelivr CDN as backup for PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export class PDFProcessor {
  static async extractTextFromPDF(file: File): Promise<string> {
    try {
      console.log('Starting enhanced PDF text extraction...');
      const arrayBuffer = await file.arrayBuffer();
      
      // Try PDF.js first for modern PDFs
      try {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          fullText += pageText + ' ';
        }
        
        // Validate extraction quality
        if (fullText.length > 100 && this.isValidCreditReportText(fullText)) {
          console.log('PDF.js extraction successful, length:', fullText.length);
          return this.cleanText(fullText);
        }
      } catch (pdfjsError) {
        console.warn('PDF.js extraction failed:', pdfjsError.message);
      }
      
      // Fallback: Manual extraction for problematic PDFs
      console.log('Using fallback manual extraction...');
      const manualText = await this.extractManually(arrayBuffer);
      
      if (manualText.length > 50) {
        return this.cleanText(manualText);
      }
      
      throw new Error('No readable text found in PDF');
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error('Failed to process PDF file. Please ensure it\'s a valid credit report.');
    }
  }

  static async extractManually(arrayBuffer: ArrayBuffer): Promise<string> {
    const uint8Array = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder('utf-8');
    const content = textDecoder.decode(uint8Array);
    
    let extractedText = '';
    
    // Extract text from PDF text objects
    const textObjects = content.match(/BT\s+[\s\S]*?ET/g) || [];
    
    for (const textObj of textObjects) {
      const patterns = [
        /\(([^)]+)\)\s*Tj/g,
        /\[([^\]]+)\]\s*TJ/g,
        /"([^"]+)"/g
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(textObj)) !== null) {
          let text = match[1];
          text = text
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\');
          
          if (text.trim().length > 1) {
            extractedText += text + ' ';
          }
        }
      }
    }
    
    return extractedText.trim();
  }

  static isValidCreditReportText(text: string): boolean {
    if (!text || text.length < 100) return false;
    
    const creditKeywords = [
      'credit', 'account', 'balance', 'payment', 'name', 'address',
      'phone', 'ssn', 'date of birth', 'experian', 'equifax', 'transunion'
    ];
    
    const lowerText = text.toLowerCase();
    const foundKeywords = creditKeywords.filter(keyword => lowerText.includes(keyword));
    
    return foundKeywords.length >= 3;
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