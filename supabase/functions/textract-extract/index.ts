import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { getDocument, GlobalWorkerOptions } from 'https://esm.sh/pdfjs-dist@5.4.54';
import { basicPDFExtraction, assessTextQuality, validateExtractedContent } from './helpers.ts';

// Set up the PDF.js worker
GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.54/build/pdf.worker.min.mjs`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * PDF to Image Converter for Edge Functions
 * Optimized for Textract processing
 */
class PDFToImageConverter {
  static async convertPDFToImages(pdfBytes: Uint8Array): Promise<Uint8Array[]> {
    console.log('🖼️ Converting PDF to images for better Textract processing...');
    
    try {
      const pdf = await getDocument(pdfBytes).promise;
      const images: Uint8Array[] = [];
      
      console.log(`📄 PDF has ${pdf.numPages} pages`);
      
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
  
  private static async convertPageToImage(page: any, pageNumber: number): Promise<Uint8Array> {
    // High DPI scale for better OCR results (2x optimal for Textract)
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    // Create canvas using OffscreenCanvas for Edge Functions
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not create canvas context');
    }
    
    // Render page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
    
    // Convert to PNG blob then to Uint8Array
    const blob = await canvas.convertToBlob({ type: 'image/png', quality: 1.0 });
    const arrayBuffer = await blob.arrayBuffer();
    const imageBytes = new Uint8Array(arrayBuffer);
    
    console.log(`📷 Page ${pageNumber} converted to ${(imageBytes.length / 1024 / 1024).toFixed(2)}MB image`);
    return imageBytes;
  }
  
  static async mergeImagesToSingle(images: Uint8Array[]): Promise<Uint8Array> {
    console.log('🔗 Merging images into single image...');
    
    if (images.length === 0) {
      throw new Error('No images to merge');
    }
    
    if (images.length === 1) {
      return images[0];
    }
    
    // Load all images as ImageBitmaps
    const imageBitmaps = await Promise.all(
      images.map(async (imageBytes) => {
        const blob = new Blob([imageBytes], { type: 'image/png' });
        return await createImageBitmap(blob);
      })
    );
    
    // Calculate total height and max width
    let totalHeight = 0;
    let maxWidth = 0;
    
    imageBitmaps.forEach(bitmap => {
      totalHeight += bitmap.height;
      maxWidth = Math.max(maxWidth, bitmap.width);
    });
    
    // Create merged canvas
    const canvas = new OffscreenCanvas(maxWidth, totalHeight);
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not create merge canvas context');
    }
    
    // Set white background
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw all images vertically
    let currentY = 0;
    imageBitmaps.forEach(bitmap => {
      context.drawImage(bitmap, 0, currentY);
      currentY += bitmap.height;
    });
    
    // Convert to PNG
    const blob = await canvas.convertToBlob({ type: 'image/png', quality: 1.0 });
    const arrayBuffer = await blob.arrayBuffer();
    const mergedBytes = new Uint8Array(arrayBuffer);
    
    console.log(`✅ Merged image created: ${(mergedBytes.length / 1024 / 1024).toFixed(2)}MB`);
    return mergedBytes;
  }
}

// AWS Textract client interface with enhanced error handling
class TextractClient {
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;
  private maxRetries: number = 3;
  private timeout: number = 30000; // 30 seconds

  constructor(accessKeyId: string, secretAccessKey: string, region: string) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
  }

  async detectDocumentText(document: Uint8Array): Promise<string> {
    // Validate document size (AWS Textract limit is 10MB)
    if (document.byteLength > 10 * 1024 * 1024) {
      throw new Error('Document size exceeds AWS Textract limit of 10MB');
    }

    console.log(`📄 Processing document of size: ${(document.byteLength / 1024 / 1024).toFixed(2)}MB`);
    
    // Convert PDF to image format for better processing
    const processedDocument = await PDFImageConverter.convertPDFToImage(document);

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 AWS Textract attempt ${attempt}/${this.maxRetries}`);
        
        const result = await this.makeTextractRequest(processedDocument);
        
        // Extract text from the response
        let extractedText = '';
        if (result.Blocks) {
          const lineBlocks = result.Blocks.filter(block => block.BlockType === 'LINE');
          console.log(`📝 Found ${lineBlocks.length} text lines in Textract response`);
          
          for (const block of lineBlocks) {
            if (block.Text) {
              extractedText += block.Text + '\n';
            }
          }
        }

        if (extractedText.length < 100) {
          throw new Error('Insufficient text extracted from document - may be an image or corrupted file');
        }

        console.log(`✅ AWS Textract extracted ${extractedText.length} characters`);
        return extractedText;

      } catch (error) {
        console.error(`❌ AWS Textract attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('AWS Textract failed after all retry attempts');
  }

  async analyzeDocument(document: Uint8Array): Promise<{ text: string; tables: any[] }> {
    // Validate document size (AWS Textract limit is 10MB)
    if (document.byteLength > 10 * 1024 * 1024) {
      throw new Error('Document size exceeds AWS Textract limit of 10MB');
    }

    console.log(`📄 Processing document for table analysis of size: ${(document.byteLength / 1024 / 1024).toFixed(2)}MB`);
    
    // Convert PDF to image format for better processing
    const processedDocument = await PDFImageConverter.convertPDFToImage(document);

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 AWS Textract table analysis attempt ${attempt}/${this.maxRetries}`);
        
        const result = await this.makeAnalyzeDocumentRequest(processedDocument);
        
        // Extract text from the response
        let extractedText = '';
        const tables: any[] = [];
        
        if (result.Blocks) {
          console.log(`📊 Found ${result.Blocks.length} blocks in document`);
          
          // Extract text from LINE blocks
          const lineBlocks = result.Blocks.filter(block => block.BlockType === 'LINE');
          console.log(`📝 Found ${lineBlocks.length} text lines in response`);
          
          for (const block of lineBlocks) {
            if (block.Text) {
              extractedText += block.Text + '\n';
            }
          }

          // Extract tables
          const extractedTables = this.extractTables(result.Blocks);
          tables.push(...extractedTables);
          console.log(`📋 Extracted ${extractedTables.length} tables from document`);
        }

        if (extractedText.length < 100) {
          throw new Error('Insufficient text extracted from document - may be an image or corrupted file');
        }

        console.log(`✅ AWS Textract table analysis extracted ${extractedText.length} characters and ${tables.length} tables`);
        return {
          text: extractedText,
          tables: tables
        };

      } catch (error) {
        console.error(`❌ AWS Textract table analysis attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('AWS Textract table analysis failed after all retry attempts');
  }

  private async makeTextractRequest(document: Uint8Array): Promise<any> {
    const host = `textract.${this.region}.amazonaws.com`;
    const endpoint = `https://${host}/`;
    
    const payload = {
      Document: {
        Bytes: this.encodeBase64Chunked(document)
      },
      FeatureTypes: []
    };

    const body = JSON.stringify(payload);
    const headers = await this.createAWSHeaders('DetectDocumentText', body);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new Error(`Rate limited: ${errorText}`);
        }
        throw new Error(`Textract API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private encodeBase64Chunked(data: Uint8Array): string {
    try {
      // Process in chunks to avoid memory issues with large files
      const chunkSize = 8192;
      let binary = '';
      
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.subarray(i, i + chunkSize);
        const chunkBinary = Array.from(chunk).map(byte => String.fromCharCode(byte)).join('');
        binary += chunkBinary;
      }
      
      return btoa(binary);
    } catch (error) {
      console.error('Base64 encoding failed:', error);
      throw new Error('Failed to encode document for AWS Textract');
    }
  }

  private async createAWSHeaders(action: string, payload: string): Promise<Record<string, string>> {
    const host = `textract.${this.region}.amazonaws.com`;
    const now = new Date();
    const isoDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const date = isoDate.substring(0, 8);

    // Create canonical request
    const canonicalHeaders = [
      `content-type:application/x-amz-json-1.1`,
      `host:${host}`,
      `x-amz-date:${isoDate}`,
      `x-amz-target:Textract.${action}`
    ].join('\n') + '\n';
    
    const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
    const payloadHash = await this.sha256(payload);
    
    const canonicalRequest = [
      'POST',
      '/',
      '', // query string
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${date}/${this.region}/textract/aws4_request`;
    const stringToSign = [
      algorithm,
      isoDate,
      credentialScope,
      await this.sha256(canonicalRequest)
    ].join('\n');

    // Calculate signature
    const signingKey = await this.getSigningKey(this.secretAccessKey, date, this.region, 'textract');
    const signature = await this.hmacSha256(signingKey, stringToSign);

    const authorizationHeader = `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `Textract.${action}`,
      'X-Amz-Date': isoDate,
      'Host': host,
      'Authorization': authorizationHeader
    };
  }

  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async hmacSha256(key: Uint8Array, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyObject = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', keyObject, encoder.encode(message));
    const signatureArray = Array.from(new Uint8Array(signature));
    return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async getSigningKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const kDate = await this.hmacSha256Raw(encoder.encode('AWS4' + key), dateStamp);
    const kRegion = await this.hmacSha256Raw(kDate, regionName);
    const kService = await this.hmacSha256Raw(kRegion, serviceName);
    const kSigning = await this.hmacSha256Raw(kService, 'aws4_request');
    return kSigning;
  }

  private async hmacSha256Raw(key: Uint8Array, message: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const keyObject = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', keyObject, encoder.encode(message));
    return new Uint8Array(signature);
  }

  private async makeAnalyzeDocumentRequest(document: Uint8Array): Promise<any> {
    const host = `textract.${this.region}.amazonaws.com`;
    const endpoint = `https://${host}/`;
    
    const payload = {
      Document: {
        Bytes: this.encodeBase64Chunked(document)
      },
      FeatureTypes: ["TABLES"]
    };

    const body = JSON.stringify(payload);
    const headers = await this.createAWSHeaders('AnalyzeDocument', body);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new Error(`Rate limited: ${errorText}`);
        }
        throw new Error(`Textract API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private extractTables(blocks: any[]): any[] {
    const tables: any[] = [];
    const tableBlocks = blocks.filter(block => block.BlockType === 'TABLE');
    
    for (const tableBlock of tableBlocks) {
      const table = {
        id: tableBlock.Id,
        confidence: tableBlock.Confidence,
        rowCount: 0,
        columnCount: 0,
        cells: [] as any[],
        boundingBox: tableBlock.Geometry?.BoundingBox
      };

      // Find all cells that belong to this table
      const cellBlocks = blocks.filter(block => 
        block.BlockType === 'CELL' && 
        tableBlock.Relationships?.some((rel: any) => 
          rel.Type === 'CHILD' && rel.Ids?.includes(block.Id)
        )
      );

      // Process cells
      for (const cellBlock of cellBlocks) {
        const cell = {
          rowIndex: cellBlock.RowIndex || 0,
          columnIndex: cellBlock.ColumnIndex || 0,
          text: this.getCellText(cellBlock, blocks),
          confidence: cellBlock.Confidence,
          isHeader: cellBlock.EntityTypes?.includes('COLUMN_HEADER') || false,
          boundingBox: cellBlock.Geometry?.BoundingBox
        };

        table.cells.push(cell);
        
        // Update table dimensions
        table.rowCount = Math.max(table.rowCount, cell.rowIndex);
        table.columnCount = Math.max(table.columnCount, cell.columnIndex);
      }

      // Adjust for 0-based indexing
      table.rowCount += 1;
      table.columnCount += 1;

      tables.push(table);
    }

    return tables;
  }

  private getCellText(cellBlock: any, blocks: any[]): string {
    if (!cellBlock.Relationships) {
      return '';
    }

    const childRelationship = cellBlock.Relationships.find((rel: any) => rel.Type === 'CHILD');
    if (!childRelationship || !childRelationship.Ids) {
      return '';
    }

    const words = childRelationship.Ids
      .map((id: string) => blocks.find(block => block.Id === id))
      .filter(block => block && block.BlockType === 'WORD')
      .map((block: any) => block.Text)
      .filter(Boolean);

    return words.join(' ');
  }

  private classifyTableType(cells: any[]): string {
    if (!cells || cells.length === 0) return 'unknown';
    
    const cellTexts = cells.map(cell => cell.text?.toLowerCase() || '').join(' ');
    
    // Look for patterns to classify table type
    if (cellTexts.includes('account') && (cellTexts.includes('balance') || cellTexts.includes('payment'))) {
      return 'account_summary';
    }
    if (cellTexts.includes('payment') && cellTexts.includes('history')) {
      return 'payment_history';
    }
    if (cellTexts.includes('inquiry') || cellTexts.includes('inquiries')) {
      return 'inquiries';
    }
    if (cellTexts.includes('address') || cellTexts.includes('personal')) {
      return 'personal_info';
    }
    if (cellTexts.includes('score') || cellTexts.includes('fico')) {
      return 'credit_score';
    }
    
    return 'unknown';
  }
}

// Enhanced PDF extraction with multiple approaches
async function enhancedPDFExtraction(bytes: Uint8Array): Promise<string> {
  console.log("=== ENHANCED PDF EXTRACTION ===");
  let extractedText = '';
  
  // Convert bytes to string for processing
  const pdfString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  
  // Method 1: Extract text objects using PDF structure
  console.log("🔍 Extracting text objects from PDF structure...");
  const textObjects = extractPDFTextObjects(pdfString);
  if (textObjects.length > 1000) {
    extractedText += textObjects + '\n';
    console.log(`📝 Found ${textObjects.length} characters from text objects`);
  }
  
  // Method 2: Extract readable strings from binary data
  console.log("🔍 Extracting readable strings from binary data...");
  const readableStrings = extractReadableStrings(pdfString);
  if (readableStrings.length > 1000) {
    extractedText += readableStrings + '\n';
    console.log(`📝 Found ${readableStrings.length} characters from binary strings`);
  }
  
  // Method 3: Advanced regex pattern matching for credit data
  console.log("🔍 Advanced pattern matching for credit report data...");
  const creditData = extractCreditPatterns(pdfString);
  if (creditData.length > 500) {
    extractedText += creditData + '\n';
    console.log(`📝 Found ${creditData.length} characters from credit patterns`);
  }
  
  console.log(`📊 Total extracted text length: ${extractedText.length}`);
  return extractedText;
}

// Extract text objects from PDF structure
function extractPDFTextObjects(pdfString: string): string {
  const textParts: string[] = [];
  
  // Look for text in parentheses (PDF text objects)
  const textMatches = pdfString.match(/\(([^)]+)\)/g);
  if (textMatches) {
    textMatches.forEach(match => {
      const text = match.slice(1, -1);
      if (text.length > 2 && /[a-zA-Z]/.test(text)) {
        // Clean and decode PDF text
        const cleaned = text
          .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\([\\()[\]])/g, '$1')
          .replace(/[^\x20-\x7E\n\r\t]/g, ' ');
        textParts.push(cleaned);
      }
    });
  }
  
  // Look for text in brackets (alternative PDF format)
  const bracketMatches = pdfString.match(/\[([^\]]+)\]/g);
  if (bracketMatches) {
    bracketMatches.forEach(match => {
      const text = match.slice(1, -1);
      if (text.length > 2 && /[a-zA-Z]/.test(text)) {
        textParts.push(text.replace(/[^\x20-\x7E]/g, ' '));
      }
    });
  }
  
  return textParts.join(' ');
}

// Extract readable ASCII strings from binary data
function extractReadableStrings(pdfString: string): string {
  const strings: string[] = [];
  let currentString = '';
  
  for (let i = 0; i < pdfString.length; i++) {
    const char = pdfString[i];
    const charCode = char.charCodeAt(0);
    
    // Check if character is printable ASCII
    if (charCode >= 32 && charCode <= 126) {
      currentString += char;
    } else {
      // End of readable string
      if (currentString.length > 5 && /[a-zA-Z]/.test(currentString)) {
        // Filter out obvious PDF metadata
        if (!isPDFMetadata(currentString)) {
          strings.push(currentString);
        }
      }
      currentString = '';
    }
  }
  
  // Add final string if valid
  if (currentString.length > 5 && /[a-zA-Z]/.test(currentString) && !isPDFMetadata(currentString)) {
    strings.push(currentString);
  }
  
  return strings.join(' ');
}

// Extract credit report specific patterns
function extractCreditPatterns(pdfString: string): string {
  const creditParts: string[] = [];
  
  // Look for specific credit report patterns
  const patterns = [
    /(?:Name|Consumer|Personal Information)[^a-z]{0,50}([A-Z][A-Za-z\s,]{10,100})/gi,
    /(?:Address|Current Address)[^a-z]{0,50}([A-Z0-9][A-Za-z0-9\s,.-]{10,150})/gi,
    /(?:SSN|Social Security)[^a-z]{0,20}([0-9-]{9,11})/gi,
    /(?:Date of Birth|DOB)[^a-z]{0,20}([0-9/.-]{8,12})/gi,
    /(?:Account|Acct)[^a-z]{0,20}([A-Z0-9]{6,20})/gi,
    /(?:Balance|Current Balance)[^a-z]{0,20}(\$?[0-9,]{1,10})/gi,
    /(?:Credit Limit|Limit)[^a-z]{0,20}(\$?[0-9,]{1,10})/gi,
    /(?:Creditor|Lender)[^a-z]{0,50}([A-Z][A-Za-z\s&]{5,50})/gi,
    /(?:Experian|Equifax|TransUnion|FICO|IdentityIQ)/gi
  ];
  
  patterns.forEach(pattern => {
    const matches = pdfString.match(pattern);
    if (matches) {
      matches.forEach(match => {
        if (match.length > 5) {
          creditParts.push(match.replace(/[^\x20-\x7E]/g, ' ').trim());
        }
      });
    }
  });
  
  return creditParts.join(' ');
}

// Check if text is PDF metadata (to filter out)
function isPDFMetadata(text: string): boolean {
  const metadataIndicators = [
    'endstream', 'endobj', 'stream', 'xref', 'trailer', 'startxref',
    'Filter', 'FlateDecode', 'Length', 'Type', 'Font', 'Pages',
    'Mozilla', 'Skia/PDF', 'webkit', 'chrome', 'safari'
  ];
  
  return metadataIndicators.some(indicator => 
    text.toLowerCase().includes(indicator.toLowerCase())
  );
}

// Enhanced text sanitization utilities
function sanitizeText(text: string): string {
  console.log("=== TEXT SANITIZATION ===");
  console.log("Original text length:", text.length);
  
  // Remove null characters and control characters
  let sanitized = text
    .replace(/\x00/g, '') // Remove null characters
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\uFFFD/g, '') // Remove replacement characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove additional control chars
    .trim();

  // Remove PDF metadata patterns
  sanitized = sanitized
    .replace(/Mozilla\/[\d.]+\s*\([^)]+\)[^D]*D:\d{14}[^']*'/g, '') // Remove Mozilla metadata
    .replace(/Filter\s*\/FlateDecode[^>]*>/g, '') // Remove Filter metadata
    .replace(/Length\s+\d+[^>]*>/g, '') // Remove Length metadata
    .replace(/endstream\s*endobj/g, '') // Remove PDF object endings
    .replace(/stream\s*[^a-zA-Z]{50,}/g, '') // Remove binary streams
    .replace(/xref\s*\d+[\s\d]*trailer/g, '') // Remove xref tables
    .replace(/startxref\s*\d+/g, ''); // Remove startxref

  // Clean up remaining artifacts
  sanitized = sanitized
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Replace non-printable with space
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^\s*[^a-zA-Z0-9]*\s*/g, '') // Remove leading junk
    .trim();
  
  console.log("Sanitized length:", sanitized.length);
  console.log("Characters removed:", text.length - sanitized.length);
  
  return sanitized;
}

// Enhanced PDF content validation
function validatePDFContent(text: string): {
  isValid: boolean;
  reason?: string;
  detectedType: 'credit_report' | 'image_based' | 'metadata_only' | 'corrupted_identityiq' | 'encrypted' | 'empty';
  creditKeywords: number;
  contentRatio: number;
} {
  console.log("=== ENHANCED PDF CONTENT VALIDATION ===");
  console.log("Text length:", text.length);
  
  if (!text || text.length < 50) {
    console.log("❌ Text too short - likely empty or corrupted PDF");
    return { 
      isValid: false, 
      reason: "PDF contains no readable text. Please upload a text-based credit report PDF from Experian, Equifax, or TransUnion.",
      detectedType: 'empty',
      creditKeywords: 0,
      contentRatio: 0
    };
  }
  
  // Enhanced detection for different PDF types
  const hasMetadata = text.includes('endstream') && text.includes('endobj') && text.includes('stream');
  const hasMozilla = text.includes('Mozilla') || text.includes('mozilla');
  const isIdentityIQ = text.toLowerCase().includes('identityiq') || 
                      text.toLowerCase().includes('identity iq') ||
                      text.toLowerCase().includes('experian consumer report');
  
  // Calculate content quality metrics
  const alphaNumericRatio = (text.match(/[a-zA-Z0-9]/g) || []).length / text.length;
  const alphabeticRatio = (text.match(/[a-zA-Z ]/g) || []).length / text.length;
  
// Enhanced credit report keywords with fuzzy matching for corrupted text
  const creditKeywords = [
    // Core identifiers (high priority)
    /credit\s*report|identityiq|identity\s*iq|consumer\s*report/gi,
    /experian|equifax|transunion|tri[\s-]*merge|3[\s-]*bureau/gi,
    
    // Account patterns (flexible matching)
    /account[\s#]*number|acct[\s#]*|account[\s#]*\d+/gi,
    /balance|payment[\s]*history|current[\s]*balance/gi,
    /creditor|lender|credit[\s]*card|loan/gi,
    
    // Credit activity
    /inquiry|inquiries|hard[\s]*pull|soft[\s]*pull/gi,
    /date[\s]*opened|date[\s]*of[\s]*birth|open[\s]*date/gi,
    /social[\s]*security|ssn|social/gi,
    
    // Credit scoring
    /fico|credit[\s]*score|score[\s]*\d+/gi,
    /tradeline|trade[\s]*line|credit[\s]*line/gi,
    
    // Personal information (flexible)
    /address|phone|employment|personal[\s]*info/gi,
    /dispute|collections|charge[\s-]*off|late[\s]*payment/gi,
    /credit[\s]*monitoring|monitoring[\s]*service/gi,
    /account[\s]*history|payment[\s]*status/gi,
    
    // Additional patterns for corrupted text
    /\b\w*credit\w*|\w*report\w*|\w*account\w*|\w*balance\w*/gi,
    /\d{3,4}[\s-]*\d{2,4}[\s-]*\d{4}/g, // SSN-like patterns
    /\$?\d{1,6}[\.,]?\d{0,2}/g, // Dollar amounts
    /\b[A-Z]{2,}[\s]*[A-Z]*\b/g // Uppercase words (company names)
  ].reduce((count, regex) => {
    const matches = text.match(regex) || [];
    return count + matches.length;
  }, 0);
  
  // Sample text for debugging (first 300 chars, cleaned)
  const sampleText = text.substring(0, 300).replace(/[^\x20-\x7E]/g, ' ').trim();
  
  console.log("Content metrics:");
  console.log("- Alphanumeric ratio:", alphaNumericRatio.toFixed(3));
  console.log("- Alphabetic ratio:", alphabeticRatio.toFixed(3));
  console.log("- Credit keywords found:", creditKeywords);
  console.log("- Has PDF metadata:", hasMetadata);
  console.log("- Has Mozilla markers:", hasMozilla);
  console.log("- Is IdentityIQ report:", isIdentityIQ);
  console.log("- Sample text:", sampleText.substring(0, 100) + '...');
  
  // IMPROVED VALIDATION LOGIC - More permissive for legitimate reports
  
  // Special handling for IdentityIQ reports (VERY permissive)
  if (isIdentityIQ && text.length > 10000) {
    // For IdentityIQ, we're very permissive since the text is often heavily corrupted
    // Accept if ANY of these conditions are met:
    // 1. Any credit keywords found
    // 2. Large document with decent alphabetic ratio
    // 3. Contains common PDF elements suggesting it's a real document
    const hasValidStructure = alphabeticRatio > 0.4 || alphaNumericRatio > 0.25;
    const hasSubstantialContent = text.length > 50000;
    
    if (creditKeywords >= 1 || hasValidStructure || hasSubstantialContent) {
      console.log("✅ IdentityIQ report validated with very relaxed criteria");
      console.log(`- Credit keywords: ${creditKeywords}`);
      console.log(`- Valid structure: ${hasValidStructure}`);
      console.log(`- Substantial content: ${hasSubstantialContent}`);
      return {
        isValid: true,
        detectedType: 'credit_report',
        creditKeywords,
        contentRatio: alphaNumericRatio
      };
    }
  }
  
  // Special handling for browser-generated PDFs with substantial content  
  if (hasMozilla && text.length > 30000) {
    // Very permissive for browser PDFs - they often have heavily corrupted text
    // Accept if document is large and has reasonable text content
    const hasReasonableContent = alphabeticRatio > 0.2 || alphaNumericRatio > 0.2;
    const isLargeDocument = text.length > 100000;
    
    if (creditKeywords >= 1 || hasReasonableContent || isLargeDocument) {
      console.log("✅ Browser-generated PDF validated with substantial content");
      console.log(`- Credit keywords: ${creditKeywords}`);
      console.log(`- Reasonable content: ${hasReasonableContent}`);
      console.log(`- Large document: ${isLargeDocument}`);
      return {
        isValid: true,
        detectedType: 'credit_report',
        creditKeywords,
        contentRatio: alphaNumericRatio
      };
    }
  }
  
  // Standard validation for other PDFs (more permissive than before)
  if (creditKeywords >= 1 && alphaNumericRatio > 0.2) {
    console.log("✅ Standard PDF validation passed");
    return {
      isValid: true,
      detectedType: 'credit_report',
      creditKeywords,
      contentRatio: alphaNumericRatio
    };
  }
  
  // Additional permissive check for heavily corrupted but potentially valid reports
  if (text.length > 30000 && (alphabeticRatio > 0.3 || alphaNumericRatio > 0.25)) {
    console.log("✅ Large document with reasonable text ratio - likely valid despite low keyword count");
    return {
      isValid: true,
      detectedType: 'credit_report',
      creditKeywords,
      contentRatio: alphaNumericRatio
    };
  }
  
  // Emergency fallback for very large documents that might be valid
  if (text.length > 100000 && alphaNumericRatio > 0.15) {
    console.log("✅ Very large document accepted with emergency fallback criteria");
    console.log("- This appears to be a substantial document despite text corruption");
    return {
      isValid: true,
      detectedType: 'credit_report',
      creditKeywords,
      contentRatio: alphaNumericRatio
    };
  }
  
  // REJECTION LOGIC - Enhanced with specific guidance
  
  if (hasMetadata && alphaNumericRatio < 0.3 && creditKeywords === 0) {
    let reason = "PDF contains mostly metadata with no readable credit data.";
    if (isIdentityIQ) {
      reason += " This IdentityIQ report appears to be browser-generated. Try downloading the report directly from IdentityIQ instead of printing to PDF.";
    } else if (hasMozilla) {
      reason += " This appears to be a browser-generated PDF. Try downloading the original report directly from the credit bureau.";
    } else {
      reason += " Please upload a text-based credit report PDF from Experian, Equifax, TransUnion, or a credit monitoring service.";
    }
    
    return {
      isValid: false,
      reason,
      detectedType: 'metadata_only',
      creditKeywords,
      contentRatio: alphaNumericRatio
    };
  }
  
  if (creditKeywords === 0 && alphaNumericRatio < 0.2) {
    let reason = "PDF contains no recognizable credit report data.";
    if (isIdentityIQ || hasMozilla) {
      reason += " This appears to be a browser-generated credit report with severely corrupted text. For IdentityIQ reports, download the PDF directly from IdentityIQ instead of using 'Print to PDF' in your browser.";
    } else {
      reason += " Please ensure you're uploading a credit report from Experian, Equifax, TransUnion, or a credit monitoring service. Avoid image-based or scanned PDFs if possible.";
    }
    
    return {
      isValid: false,
      reason,
      detectedType: isIdentityIQ ? 'corrupted_identityiq' : 'image_based',
      creditKeywords,
      contentRatio: alphaNumericRatio
    };
  }
  
  // If we get here, the file has some credit keywords or decent content quality
  console.log("✅ PDF content validation passed with permissive criteria");
  return {
    isValid: true,
    detectedType: 'credit_report',
    creditKeywords,
    contentRatio: alphaNumericRatio
  };
}

function validateExtractedText(text: string): boolean {
  const validation = validatePDFContent(text);
  return validation.isValid;
}

/**
 * Determine file type and PDF generation method with detailed analysis
 */
function determineFileType(filePath: string, bytes: Uint8Array): { type: string; pdfType?: string; confidence: number; analysis?: any } {
  const fileName = filePath.toLowerCase();
  
  // Check by file extension first
  if (fileName.endsWith('.pdf')) {
    const pdfAnalysis = analyzePDFType(bytes);
    return { 
      type: 'pdf', 
      pdfType: pdfAnalysis.type, 
      confidence: pdfAnalysis.confidence,
      analysis: pdfAnalysis.details
    };
  }
  
  if (fileName.match(/\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/)) return { type: 'image', confidence: 0.9 };
  if (fileName.match(/\.(doc|docx)$/)) return { type: 'word', confidence: 0.8 };
  if (fileName.match(/\.(html|htm)$/)) return { type: 'html', confidence: 0.7 };
  
  // Check by content signature
  const header = Array.from(bytes.slice(0, 10)).map(b => String.fromCharCode(b)).join('');
  if (header.startsWith('%PDF-')) {
    const pdfAnalysis = analyzePDFType(bytes);
    return { 
      type: 'pdf', 
      pdfType: pdfAnalysis.type, 
      confidence: pdfAnalysis.confidence,
      analysis: pdfAnalysis.details
    };
  }
  
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return { type: 'image', confidence: 0.9 }; // JPEG
  if (header.startsWith('\x89PNG')) return { type: 'image', confidence: 0.9 };
  if (header.startsWith('GIF8')) return { type: 'image', confidence: 0.9 };
  if (header.includes('<!DOCTYPE') || header.includes('<html')) return { type: 'html', confidence: 0.7 };
  
  return { type: 'unknown', confidence: 0.1 };
}

/**
 * Analyzes PDF type and generation method for better processing decisions
 */
function analyzePDFType(fileData: Uint8Array): { type: string; confidence: number; details: any } {
  const textContent = new TextDecoder('utf-8', { fatal: false }).decode(fileData);
  
  const analysis = {
    hasMozillaMarkers: /Mozilla\/\d+\.\d+/.test(textContent),
    hasChromiumMarkers: /Chromium|Chrome/.test(textContent),
    hasSafariMarkers: /Safari|WebKit/.test(textContent),
    hasSkiaMarkers: /Skia\/PDF/.test(textContent),
    hasIdentityIQMarkers: /IdentityIQ|Identity\s*IQ/i.test(textContent),
    hasExperian: /Experian/i.test(textContent),
    hasEquifax: /Equifax/i.test(textContent),
    hasTransUnion: /TransUnion|Trans\s*Union/i.test(textContent),
    hasNativeTextObjects: /\/Text\s/.test(textContent),
    hasImageObjects: /\/Image\s/.test(textContent),
    hasFormObjects: /\/Form\s/.test(textContent),
    streamObjectCount: (textContent.match(/stream\n/g) || []).length,
    endstreamCount: (textContent.match(/endstream/g) || []).length,
    textObjectCount: (textContent.match(/BT\s/g) || []).length,
    metadataRatio: calculateMetadataRatio(textContent),
    fileSize: fileData.length
  };
  
  console.log("📊 PDF Analysis:", JSON.stringify(analysis, null, 2));
  
  // Determine PDF type based on analysis
  if (analysis.hasMozillaMarkers || analysis.hasChromiumMarkers || analysis.hasSkiaMarkers) {
    if (analysis.hasIdentityIQMarkers) {
      return {
        type: 'browser_generated_identityiq',
        confidence: 0.95,
        details: analysis
      };
    }
    return {
      type: 'browser_generated_credit_report',
      confidence: 0.9,
      details: analysis
    };
  }
  
  if (analysis.metadataRatio > 0.8 && analysis.textObjectCount < 5) {
    return {
      type: 'corrupted_metadata_only',
      confidence: 0.85,
      details: analysis
    };
  }
  
  if (analysis.hasNativeTextObjects && analysis.textObjectCount > 10) {
    return {
      type: 'native_text_pdf',
      confidence: 0.8,
      details: analysis
    };
  }
  
  if (analysis.hasImageObjects && !analysis.hasNativeTextObjects) {
    return {
      type: 'image_based_pdf',
      confidence: 0.75,
      details: analysis
    };
  }
  
  return {
    type: 'unknown_pdf',
    confidence: 0.3,
    details: analysis
  };
}

/**
 * Calculates ratio of PDF metadata vs actual content
 */
function calculateMetadataRatio(content: string): number {
  const totalLength = content.length;
  if (totalLength === 0) return 1.0;
  
  // Count PDF metadata patterns
  const metadataPatterns = [
    /\/Filter\s*\/\w+/g,
    /\/Length\s*\d+/g,
    /\/Type\s*\/\w+/g,
    /\/Subtype\s*\/\w+/g,
    /endobj/g,
    /endstream/g,
    /\/Pages\s*\d+/g,
    /\/Creator\s*\([^)]*\)/g,
    /\/Producer\s*\([^)]*\)/g
  ];
  
  let metadataLength = 0;
  metadataPatterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    metadataLength += matches.join('').length;
  });
  
  return metadataLength / totalLength;
}

/**
 * Process PDF files with enhanced image conversion and extraction
 */
async function processPDFFile(bytes: Uint8Array, reportId: string, supabase: any): Promise<string> {
  console.log('=== PROCESSING PDF FILE ===');
  
  const analysis = analyzePDFStructure(bytes);
  console.log('📊 PDF Analysis:', JSON.stringify(analysis, null, 2));
  
  const enhancedAnalysis = enhanceFileAnalysis(bytes);
  console.log('🔍 Enhanced File Analysis:', JSON.stringify(enhancedAnalysis, null, 2));
  console.log('🎯 Confidence:', enhancedAnalysis.confidence);
  console.log('📄 PDF Type:', enhancedAnalysis.pdfType);
  
  // Step 1: Convert PDF to high-quality images first
  console.log('=== STEP 1: CONVERTING PDF TO IMAGES ===');
  let imageBytes: Uint8Array;
  
  try {
    const images = await PDFToImageConverter.convertPDFToImages(bytes);
    console.log(`📸 Converted PDF to ${images.length} image(s)`);
    
    // For multi-page PDFs, merge into single image for better Textract processing
    if (images.length > 1) {
      imageBytes = await PDFToImageConverter.mergeImagesToSingle(images);
      console.log('🔗 Merged multiple pages into single image for processing');
    } else {
      imageBytes = images[0];
    }
    
    console.log(`✅ Image ready for Textract: ${(imageBytes.length / 1024 / 1024).toFixed(2)}MB`);
    
  } catch (error) {
    console.error('❌ PDF to image conversion failed:', error);
    console.log('⚠️ Falling back to direct PDF processing');
    imageBytes = bytes; // Fallback to original PDF
  }

  // Step 2: Try AWS Textract with the converted image
  console.log('=== STEP 2: ATTEMPTING AWS TEXTRACT WITH CONVERTED IMAGE ===');
  let extractedText = '';
  let extractionMethod = 'none';
  let tables: any[] = [];
  
  const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';

  if (awsAccessKeyId && awsSecretAccessKey) {
    try {
      console.log(`📄 Processing converted image of size: ${(imageBytes.length / 1024 / 1024).toFixed(2)}MB`);
      
      // Try table analysis first with converted image
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`🔄 AWS Textract table analysis attempt ${attempt}/3`);
          const textractClient = new TextractClient(awsAccessKeyId, awsSecretAccessKey, awsRegion);
          const result = await textractClient.analyzeDocument(imageBytes);
          
          if (result.text && result.text.length > 1000) {
            extractedText = result.text;
            tables = result.tables;
            extractionMethod = 'aws_textract_table_from_image';
            console.log(`✅ AWS Textract table analysis successful on attempt ${attempt}`);
            console.log(`📊 Extracted text length: ${extractedText.length} characters`);
            break;
          }
        } catch (error) {
          console.log(`❌ AWS Textract table analysis attempt ${attempt} failed: ${error.message}`);
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
      
      // If table analysis failed, try basic text extraction
      if (!extractedText) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`🔄 AWS Textract text extraction attempt ${attempt}/3`);
            const textractClient = new TextractClient(awsAccessKeyId, awsSecretAccessKey, awsRegion);
            const textResult = await textractClient.detectDocumentText(imageBytes);
            
            if (textResult && textResult.length > 500) {
              extractedText = textResult;
              extractionMethod = 'aws_textract_text_from_image';
              console.log(`✅ AWS Textract text extraction successful on attempt ${attempt}`);
              console.log(`📊 Extracted text length: ${extractedText.length} characters`);
              break;
            }
          } catch (error) {
            console.log(`❌ AWS Textract text extraction attempt ${attempt} failed: ${error.message}`);
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
          }
        }
      }
      
      // Store table data if found
      if (tables.length > 0) {
        await storeTableData(reportId, tables, supabase);
      }
      
    } catch (error) {
      console.error('❌ AWS Textract processing with converted image failed:', error);
    }
  }

  // Step 3: Enhanced fallback PDF extraction if Textract failed
  if (!extractedText) {
    console.log('=== STEP 3: ENHANCED PDF EXTRACTION FALLBACK ===');
    
    try {
      extractedText = await enhancedPDFExtraction(bytes);
      extractionMethod = 'enhanced_pdf_extraction';
      console.log('✅ Enhanced PDF extraction completed');
      console.log(`📊 Total extracted text length: ${extractedText.length}`);
    } catch (error) {
      console.error('❌ Enhanced PDF extraction failed:', error);
      
      // Step 4: Final fallback - try basic PDF.js extraction
      console.log('=== STEP 4: BASIC PDF.JS FALLBACK ===');
      try {
        const basicText = await basicPDFExtraction(bytes);
        if (basicText && basicText.length > 100) {
          extractedText = basicText;
          extractionMethod = 'basic_pdf_extraction';
          console.log('✅ Basic PDF extraction completed as last resort');
          console.log(`📊 Basic extracted text length: ${extractedText.length}`);
        } else {
          throw new Error('Basic PDF extraction also failed');
        }
      } catch (basicError) {
        console.error('❌ All extraction methods failed:', basicError);
        throw new Error(`All extraction methods failed. Textract: failed, Enhanced: ${error.message}, Basic: ${basicError.message}`);
      }
    }
  }

  // Step 5: Text quality assessment and validation
  console.log('=== STEP 5: TEXT QUALITY ASSESSMENT ===');
  
  const originalLength = extractedText.length;
  console.log(`Original extracted text length: ${originalLength}`);
  
  // Assess text quality before sanitization
  const qualityScore = assessTextQuality(extractedText);
  console.log(`📊 Text quality score: ${qualityScore}/100`);
  
  if (qualityScore < 30) {
    console.log('⚠️ Low quality text detected - may need alternative extraction method');
  }
  
  // Sanitize and clean the text
  extractedText = sanitizeExtractedText(extractedText);
  const sanitizedLength = extractedText.length;
  console.log(`Sanitized text length: ${sanitizedLength}`);
  console.log(`Characters removed during sanitization: ${originalLength - sanitizedLength}`);
  
  // Enhanced content validation
  const contentValidation = validateExtractedContent(extractedText, extractionMethod);
  
  console.log('=== TEXT VALIDATION RESULTS ===');
  console.log(`✅ Content validation details:`);
  console.log(`- Extraction method: ${extractionMethod}`);
  console.log(`- Quality score: ${qualityScore}/100`);
  console.log(`- Credit keywords found: ${contentValidation.creditKeywords}`);
  console.log(`- Content quality ratio: ${contentValidation.qualityRatio}`);
  console.log(`- Has reasonable content: ${contentValidation.hasReasonableContent}`);
  console.log(`- Detected type: ${contentValidation.detectedType}`);
  console.log(`- Is IdentityIQ report: ${contentValidation.isIdentityIQ}`);
  console.log(`- Has Mozilla markers: ${contentValidation.hasMozillaMarkers}`);
  console.log(`- Large document: ${contentValidation.isLargeDocument}`);
  console.log(`- Sample text: ${extractedText.substring(0, 100).replace(/\n/g, '\\n')}...`);
  
  if (!contentValidation.hasReasonableContent) {
    console.log('⚠️ Warning: Extracted text may not contain readable credit report data');
  }

  // Update database with extraction status
  await supabase
    .from('credit_reports')
    .update({
      table_extraction_status: tables.length > 0 ? 'completed' : 'no_tables',
      tables_extracted_count: tables.length,
      text_quality_score: qualityScore,
      extraction_method: extractionMethod
    })
    .eq('id', reportId);

  console.log(`Final text length: ${extractedText.length}`);
  console.log(`Final extraction method: ${extractionMethod}`);
  console.log('✅ Processing completed successfully');

  return extractedText;
}

/**
 * Store extracted table data in database
 */
async function storeTableData(reportId: string, tables: any[], supabase: any): Promise<void> {
  console.log(`=== STORING ${tables.length} TABLES IN DATABASE ===`);
  
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
    const table = tables[tableIndex];
    
    // Classify table type
    const tableType = classifyTableType(table.cells);
    
    // Insert table record
    const { data: tableRecord, error: tableError } = await supabase
      .from('credit_report_tables')
      .insert({
        report_id: reportId,
        table_index: tableIndex,
        table_type: tableType,
        row_count: table.rowCount,
        column_count: table.columnCount,
        confidence_score: table.confidence,
        bounding_box: table.boundingBox,
        raw_table_data: {
          id: table.id,
          cells: table.cells,
          extractedAt: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (tableError) {
      console.error(`Failed to insert table ${tableIndex}:`, tableError);
      continue;
    }

    console.log(`✅ Stored table ${tableIndex} (${tableType}) with ${table.cells.length} cells`);

    // Insert cell records
    for (const cell of table.cells) {
      const { error: cellError } = await supabase
        .from('credit_report_table_cells')
        .insert({
          table_id: tableRecord.id,
          row_index: cell.rowIndex,
          column_index: cell.columnIndex,
          cell_text: cell.text,
          confidence_score: cell.confidence,
          is_header: cell.isHeader,
          bounding_box: cell.boundingBox
        });

      if (cellError) {
        console.error(`Failed to insert cell at (${cell.rowIndex}, ${cell.columnIndex}):`, cellError);
      }
    }
  }
  
  console.log(`✅ Successfully stored all ${tables.length} tables`);
}

/**
 * Classify table type based on cell content
 */
function classifyTableType(cells: any[]): string {
  if (!cells || cells.length === 0) return 'unknown';
  
  const cellTexts = cells.map(cell => cell.text?.toLowerCase() || '').join(' ');
  
  // Look for patterns to classify table type
  if (cellTexts.includes('account') && (cellTexts.includes('balance') || cellTexts.includes('payment'))) {
    return 'account_summary';
  }
  if (cellTexts.includes('payment') && cellTexts.includes('history')) {
    return 'payment_history';
  }
  if (cellTexts.includes('inquiry') || cellTexts.includes('inquiries')) {
    return 'inquiries';
  }
  if (cellTexts.includes('address') || cellTexts.includes('personal')) {
    return 'personal_info';
  }
  if (cellTexts.includes('score') || cellTexts.includes('fico')) {
    return 'credit_score';
  }
  
  return 'unknown';
}

/**
 * Process image files using OCR
 */
async function processImageFile(bytes: Uint8Array): Promise<string> {
  // For image files, we'll use AWS Textract's OCR capabilities
  const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';

  if (!awsAccessKeyId || !awsSecretAccessKey) {
    throw new Error('AWS credentials required for image OCR processing');
  }

  try {
    console.log("=== PROCESSING IMAGE WITH OCR ===");
    const textractClient = new TextractClient(awsAccessKeyId, awsSecretAccessKey, awsRegion);
    const extractedText = await textractClient.detectDocumentText(bytes);
    console.log("✅ Image OCR processing completed");
    return extractedText;
  } catch (error) {
    console.error("❌ Image OCR processing failed:", error);
    throw new Error(`Image OCR failed: ${error.message}`);
  }
}

/**
 * Process Word documents by converting to text
 */
async function processWordDocument(bytes: Uint8Array): Promise<string> {
  // For Word documents, we'll extract what text we can from the binary format
  // This is a basic implementation - in production you'd want a proper Word parser
  console.log("=== CONVERTING WORD DOCUMENT ===");
  
  try {
    const docString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    
    // Extract readable ASCII text from Word document
    const textMatches = docString.match(/[A-Za-z][A-Za-z0-9\s,.:\-()]{10,}/g);
    if (textMatches) {
      const extractedText = textMatches
        .filter(text => text.length > 5)
        .filter(text => /[a-zA-Z].*[a-zA-Z]/.test(text)) // Must contain letters
        .join(' ')
        .replace(/[^\x20-\x7E]/g, ' ') // Remove non-printable chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      console.log("✅ Word document conversion completed");
      return extractedText;
    }
    
    throw new Error('No readable text found in Word document');
  } catch (error) {
    console.error("❌ Word document processing failed:", error);
    throw new Error(`Word document processing failed: ${error.message}`);
  }
}

/**
 * Process HTML files by extracting text content
 */
async function processHTMLFile(bytes: Uint8Array): Promise<string> {
  console.log("=== PROCESSING HTML FILE ===");
  
  try {
    const htmlContent = new TextDecoder().decode(bytes);
    
    // Basic HTML text extraction (remove tags)
    let extractedText = htmlContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (extractedText.length < 50) {
      throw new Error('Insufficient text content in HTML file');
    }
    
    console.log("✅ HTML processing completed");
    return extractedText;
  } catch (error) {
    console.error("❌ HTML processing failed:", error);
    throw new Error(`HTML processing failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  console.log("=== TEXTRACT FUNCTION START ===");
  console.log("Function called at:", new Date().toISOString());
  console.log("Request method:", req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("CORS preflight request handled");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== PARSING REQUEST ===");
    const body = await req.json();
    console.log("Request body keys:", Object.keys(body));
    console.log("Report ID:", body.reportId);
    console.log("File Path:", body.filePath);

    // Initialize Supabase client
    console.log("=== CREATING SUPABASE CLIENT ===");
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    console.log("Supabase URL exists:", !!supabaseUrl);
    console.log("Supabase Service Key exists:", !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check AWS credentials
    console.log("=== CHECKING AWS CREDENTIALS ===");
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';
    
    console.log("AWS Access Key ID exists:", !!awsAccessKeyId);
    console.log("AWS Secret Access Key exists:", !!awsSecretAccessKey);
    console.log("AWS Region:", awsRegion);

    // Download file
    console.log("=== DOWNLOADING FILE ===");
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-reports')
      .download(body.filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    console.log("File downloaded successfully, size:", bytes.length, "bytes");

    // Basic validation
    if (bytes.length === 0) {
      throw new Error("File is empty");
    }

    if (bytes.length > 50000000) { // 50MB limit for all file types
      throw new Error("File too large (max 50MB)");
    }

    // Determine file type and process accordingly with enhanced analysis
    const fileTypeAnalysis = determineFileType(body.filePath, bytes);
    console.log("🔍 Enhanced File Analysis:", JSON.stringify(fileTypeAnalysis, null, 2));

    let extractedText = '';
    let extractionMethod = '';

    // Handle browser-generated IdentityIQ PDFs specifically
    if (fileTypeAnalysis.type === 'pdf' && fileTypeAnalysis.pdfType === 'browser_generated_identityiq') {
      console.log("⚠️  DETECTED: Browser-generated IdentityIQ PDF");
      console.log("🚨 WARNING: This file type is known to have text extraction issues");
      console.log("📋 Analysis:", fileTypeAnalysis.analysis);
      
      // Add specific guidance for IdentityIQ files
      const guidance = "This IdentityIQ credit report appears to be browser-generated which often causes text extraction issues. " +
                      "For best results, try downloading the report directly from IdentityIQ as a PDF instead of printing to PDF from a browser.";
      console.log("💡 User Guidance:", guidance);
    }

    switch (fileTypeAnalysis.type) {
      case 'pdf':
        console.log("=== PROCESSING PDF FILE ===");
        console.log(`📄 PDF Type: ${fileTypeAnalysis.pdfType}`);
        console.log(`🎯 Confidence: ${fileTypeAnalysis.confidence}`);
        
        // Special handling for problematic PDF types
        if (fileTypeAnalysis.pdfType === 'corrupted_metadata_only') {
          throw new Error(
            "This PDF appears to contain only metadata with no readable text. " +
            "Please upload a text-based credit report PDF from Experian, Equifax, TransUnion, or a credit monitoring service. " +
            "If this is an IdentityIQ report, try downloading it directly instead of printing to PDF."
          );
        }
        
        extractedText = await processPDFFile(bytes, body.reportId, supabase);
        extractionMethod = fileTypeAnalysis.pdfType || 'pdf_processing';
        break;
        
      case 'image':
        console.log("=== PROCESSING IMAGE FILE ===");
        if (!Deno.env.get('AWS_ACCESS_KEY_ID')) {
          throw new Error(
            "Image files require OCR processing, but AWS credentials are not configured. " +
            "Please upload a PDF version of your credit report instead."
          );
        }
        extractedText = await processImageFile(bytes);
        extractionMethod = 'image_ocr';
        break;
        
      case 'word':
        console.log("=== PROCESSING WORD DOCUMENT ===");
        extractedText = await processWordDocument(bytes);
        extractionMethod = 'document_conversion';
        break;
        
      case 'html':
        console.log("=== PROCESSING HTML FILE ===");
        extractedText = await processHTMLFile(bytes);
        extractionMethod = 'html_conversion';
        break;
        
      default:
        throw new Error(
          `Unsupported file type: ${fileTypeAnalysis.type}. ` +
          "Please upload a PDF, image, Word document, or HTML file containing your credit report. " +
          "For best results, use a PDF downloaded directly from Experian, Equifax, TransUnion, or a credit monitoring service."
        );
    }

    // Sanitize extracted text
    console.log("=== SANITIZING EXTRACTED TEXT ===");
    const originalLength = extractedText.length;
    extractedText = sanitizeText(extractedText);
    
    console.log("Original length:", originalLength);
    console.log("Sanitized length:", extractedText.length);
    console.log("Extraction method:", extractionMethod);

    // Enhanced content validation with detailed feedback
    console.log("=== FINAL CONTENT VALIDATION ===");
    const validation = validatePDFContent(extractedText);
    
    if (!validation.isValid) {
      console.error("❌ Content validation failed:", validation.reason);
      console.error("Detected type:", validation.detectedType);
      console.error("Credit keywords found:", validation.creditKeywords);
      console.error("Content ratio:", validation.contentRatio);
      
      // Enhanced error message based on file type analysis
      let errorMessage = validation.reason || "PDF content validation failed";
      
      if (fileTypeAnalysis.pdfType === 'browser_generated_identityiq') {
        errorMessage = "IdentityIQ browser-generated PDF processing failed: " + errorMessage + 
          "\n\n💡 SOLUTION: Download the credit report directly from IdentityIQ instead of printing to PDF from your browser. " +
          "Browser-generated PDFs often have text extraction issues that prevent proper data parsing.";
      } else if (fileTypeAnalysis.pdfType?.includes('browser_generated')) {
        errorMessage = "Browser-generated PDF processing failed: " + errorMessage + 
          "\n\n💡 SOLUTION: Try downloading the original credit report PDF directly from the credit bureau " +
          "(Experian, Equifax, TransUnion) instead of using a browser-printed version.";
      }
      
      throw new Error(errorMessage);
    }
    
    console.log("✅ Content validation passed:");
    console.log("- Credit keywords found:", validation.creditKeywords);
    console.log("- Content quality ratio:", validation.contentRatio);
    console.log("- Detected type:", validation.detectedType);

    // Store in database with enhanced metadata
    console.log("=== STORING EXTRACTED TEXT IN DATABASE ===");
    const { error: updateError } = await supabase
      .from('credit_reports')
      .update({
        raw_text: extractedText,
        extraction_status: 'completed',
        processing_errors: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.reportId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to store text: ${updateError.message}`);
    }

    console.log("✅ Processing completed successfully");
    console.log("Final extraction method:", extractionMethod);
    console.log("Final text length:", extractedText.length);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'PDF processed successfully',
        textLength: extractedText.length,
        extractionMethod: extractionMethod,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error("=== FUNCTION ERROR ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    // Update status to failed
    try {
      const body = await req.clone().json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseServiceKey && body.reportId) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase
          .from('credit_reports')
          .update({
            extraction_status: 'failed',
            processing_errors: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', body.reportId);
      }
    } catch (updateError) {
      console.error("Failed to update error status:", updateError);
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});