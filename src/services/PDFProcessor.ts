import * as pdfjsLib from 'pdfjs-dist';

// Use jsdelivr CDN as backup for PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export class PDFProcessor {
  static async extractTextFromPDF(file: File): Promise<string> {
    try {
      console.log('🚀 Starting enhanced PDF text extraction...');
      const arrayBuffer = await file.arrayBuffer();
      
      // Primary method: Try PDF.js with improved configuration
      try {
        console.log('📄 Attempting PDF.js extraction...');
        
        // Configure PDF.js with better options
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          verbosity: 0, // Reduce console output
          isEvalSupported: false,
          disableFontFace: true,
          useSystemFonts: true
        });
        
        const pdf = await loadingTask.promise;
        let fullText = '';
        
        console.log(`📖 Processing ${pdf.numPages} pages...`);
        
        for (let i = 1; i <= pdf.numPages; i++) {
          try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            const pageText = textContent.items
              .map((item: any) => {
                if (item.str && item.str.trim()) {
                  return item.str;
                }
                return '';
              })
              .filter(text => text.length > 0)
              .join(' ');
            
            if (pageText.trim()) {
              fullText += pageText + ' ';
              console.log(`✅ Page ${i}: extracted ${pageText.length} characters`);
            } else {
              console.log(`⚠️  Page ${i}: no text content found`);
            }
          } catch (pageError) {
            console.warn(`❌ Error processing page ${i}:`, pageError.message);
            continue;
          }
        }
        
        // Validate extraction quality
        if (fullText.length > 100 && this.isValidCreditReportText(fullText)) {
          console.log('✅ PDF.js extraction successful, length:', fullText.length);
          return this.cleanText(fullText);
        } else {
          throw new Error(`PDF.js extraction insufficient: ${fullText.length} characters`);
        }
      } catch (pdfjsError) {
        console.warn('❌ PDF.js extraction failed:', pdfjsError.message);
      }
      
      // Fallback: Enhanced manual extraction for problematic PDFs
      console.log('🔧 Using enhanced manual extraction...');
      const manualText = await this.extractManually(arrayBuffer);
      
      if (manualText.length > 50) {
        console.log('✅ Manual extraction successful, length:', manualText.length);
        return this.cleanText(manualText);
      }
      
      throw new Error('❌ No readable text found in PDF - document may be image-based and require OCR');
    } catch (error) {
      console.error('💥 Error extracting text from PDF:', error);
      throw new Error('Failed to process PDF file. Document may be image-based or corrupted.');
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