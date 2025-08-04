/**
 * PDF Content Validator - Client-side PDF validation before upload
 */
export class PDFContentValidator {
  /**
   * Validate PDF content quality before upload
   */
  static async validatePDFFile(file: File): Promise<{
    isValid: boolean;
    reason?: string;
    suggestions?: string[];
    detectedType: 'credit_report' | 'image_based' | 'encrypted' | 'empty' | 'other';
  }> {
    try {
      // Basic file validation
      if (!file || file.type !== 'application/pdf') {
        return {
          isValid: false,
          reason: 'Please select a valid PDF file',
          detectedType: 'other'
        };
      }

      if (file.size === 0) {
        return {
          isValid: false,
          reason: 'PDF file appears to be empty',
          detectedType: 'empty'
        };
      }

      if (file.size > 10 * 1024 * 1024) {
        return {
          isValid: false,
          reason: 'PDF file is too large (max 10MB)',
          detectedType: 'other'
        };
      }

      // Read file as text to check for basic content
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to string for basic analysis
      let textContent = '';
      for (let i = 0; i < Math.min(uint8Array.length, 50000); i++) {
        textContent += String.fromCharCode(uint8Array[i]);
      }

      // Check for PDF structure
      if (!textContent.startsWith('%PDF-')) {
        return {
          isValid: false,
          reason: 'File does not appear to be a valid PDF',
          detectedType: 'other'
        };
      }

      // Check for encryption
      if (textContent.includes('/Encrypt') || textContent.includes('/Filter')) {
        return {
          isValid: false,
          reason: 'PDF appears to be encrypted or password-protected',
          suggestions: [
            'Download an unprotected version from your credit bureau',
            'If downloaded from a bureau website, try saving without password protection'
          ],
          detectedType: 'encrypted'
        };
      }

      // Look for credit report indicators
      const creditKeywords = [
        'credit report', 'experian', 'equifax', 'transunion',
        'account number', 'creditor', 'inquiry', 'tradeline',
        'fico', 'credit score', 'annual credit report'
      ];

      const hasKeywords = creditKeywords.some(keyword => 
        textContent.toLowerCase().includes(keyword.toLowerCase())
      );

      // Check for text content vs images
      const hasTextStreams = textContent.includes('/Type/Font') || 
                            textContent.includes('BT') || 
                            textContent.includes('ET');

      const hasImageStreams = textContent.includes('/Type/XObject') ||
                             textContent.includes('/Subtype/Image');

      // Analyze file characteristics
      if (!hasKeywords && file.size < 50000) {
        return {
          isValid: false,
          reason: 'PDF is too small and contains no credit report keywords',
          suggestions: [
            'Ensure you\'re uploading a complete credit report',
            'Download directly from Experian, Equifax, or TransUnion',
            'Avoid screenshots or partial documents'
          ],
          detectedType: 'other'
        };
      }

      if (hasImageStreams && !hasTextStreams && file.size > 5000000) {
        return {
          isValid: false,
          reason: 'PDF appears to be image-based (scanned document)',
          suggestions: [
            'Download a text-based PDF directly from your credit bureau',
            'Avoid PDFs created by scanning or taking photos',
            'Look for "PDF" download option on bureau websites'
          ],
          detectedType: 'image_based'
        };
      }

      // Check for suspicious browser-generated content
      if (textContent.includes('Mozilla') && file.size < 100000) {
        return {
          isValid: false,
          reason: 'PDF appears to be browser-generated or incomplete',
          suggestions: [
            'Download directly from credit bureau website, not browser print',
            'Use the official "Download PDF" button, not "Print to PDF"',
            'Ensure you\'re logged into your credit bureau account'
          ],
          detectedType: 'image_based'
        };
      }

      // Passed basic validation
      return {
        isValid: true,
        detectedType: hasKeywords ? 'credit_report' : 'other'
      };

    } catch (error) {
      console.error('PDF validation error:', error);
      return {
        isValid: false,
        reason: 'Unable to validate PDF file',
        detectedType: 'other'
      };
    }
  }

  /**
   * Get file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Suggest actions based on validation result
   */
  static getValidationActions(validation: Awaited<ReturnType<typeof PDFContentValidator.validatePDFFile>>): string[] {
    if (validation.isValid) {
      return ['File looks good! Ready to upload.'];
    }

    const baseActions = [
      'Visit your credit bureau website directly',
      'Log into your account and download a fresh PDF',
      'Look for "Download PDF" or "PDF Report" options',
      'Avoid "Print to PDF" or screenshot methods'
    ];

    return validation.suggestions || baseActions;
  }
}