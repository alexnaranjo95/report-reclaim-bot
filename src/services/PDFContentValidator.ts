/**
 * File Content Validator - Client-side file validation before upload
 * Supports PDFs, images, Word docs, HTML files with OCR processing
 */
export class PDFContentValidator {
  /**
   * Validate any supported file type for credit report processing
   */
  static async validateFile(file: File): Promise<{
    isValid: boolean;
    reason?: string;
    suggestions?: string[];
    detectedType: 'text_pdf' | 'image_pdf' | 'browser_pdf' | 'encrypted_pdf' | 'word_doc' | 'html_file' | 'image_file' | 'unsupported';
    processingMethod: 'text_extraction' | 'ocr_processing' | 'document_conversion' | 'not_supported';
  }> {
    try {
      const fileName = file.name.toLowerCase();
      const fileType = file.type.toLowerCase();

      // Check file size limits (increase for images and docs)
      if (file.size === 0) {
        return {
          isValid: false,
          reason: 'File appears to be empty',
          detectedType: 'unsupported',
          processingMethod: 'not_supported'
        };
      }

      if (file.size > 50 * 1024 * 1024) { // 50MB for all file types
        return {
          isValid: false,
          reason: 'File is too large (max 50MB)',
          detectedType: 'unsupported',
          processingMethod: 'not_supported'
        };
      }

      // Classify file type and determine processing method
      const classification = this.classifyFileType(file, fileName, fileType);
      
      if (classification.detectedType === 'unsupported') {
        return {
          isValid: false,
          reason: 'File type not supported. Please upload PDF, image, Word document, or HTML file.',
          suggestions: [
            'Supported formats: PDF, JPG, PNG, TIFF, DOCX, DOC, HTML',
            'Download credit reports in PDF format when possible'
          ],
          detectedType: 'unsupported',
          processingMethod: 'not_supported'
        };
      }

      // All supported file types are now valid - we'll process them with appropriate methods
      return {
        isValid: true,
        reason: this.getProcessingDescription(classification.detectedType, classification.processingMethod),
        detectedType: classification.detectedType,
        processingMethod: classification.processingMethod
      };

    } catch (error) {
      console.error('File validation error:', error);
      return {
        isValid: false,
        reason: 'Unable to validate file',
        detectedType: 'unsupported',
        processingMethod: 'not_supported'
      };
    }
  }

  /**
   * Classify file type based on extension and MIME type
   */
  private static classifyFileType(file: File, fileName: string, fileType: string): {
    detectedType: 'text_pdf' | 'image_pdf' | 'browser_pdf' | 'encrypted_pdf' | 'word_doc' | 'html_file' | 'image_file' | 'unsupported';
    processingMethod: 'text_extraction' | 'ocr_processing' | 'document_conversion' | 'not_supported';
  } {
    // PDF files - assume image-based by default for OCR processing
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return {
        detectedType: 'image_pdf',
        processingMethod: 'ocr_processing'
      };
    }

    // Image files
    if (fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i.test(fileName)) {
      return {
        detectedType: 'image_file',
        processingMethod: 'ocr_processing'
      };
    }

    // Word documents
    if (fileType.includes('word') || 
        fileType.includes('document') ||
        fileName.endsWith('.doc') || 
        fileName.endsWith('.docx')) {
      return {
        detectedType: 'word_doc',
        processingMethod: 'document_conversion'
      };
    }

    // HTML files
    if (fileType === 'text/html' || fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      return {
        detectedType: 'html_file',
        processingMethod: 'document_conversion'
      };
    }

    return {
      detectedType: 'unsupported',
      processingMethod: 'not_supported'
    };
  }

  /**
   * Get processing description for user
   */
  private static getProcessingDescription(detectedType: string, processingMethod: string): string {
    switch (detectedType) {
      case 'text_pdf':
        return 'Text-based PDF ready for direct processing';
      case 'image_pdf':
        return 'PDF will be processed using OCR technology to extract text';
      case 'browser_pdf':
        return 'Browser-generated PDF will be processed using OCR technology';
      case 'encrypted_pdf':
        return 'Encrypted PDF detected - will attempt OCR processing';
      case 'word_doc':
        return 'Word document will be converted and processed';
      case 'html_file':
        return 'HTML file will be converted to text format';
      case 'image_file':
        return 'Image will be processed using OCR technology';
      default:
        return 'File ready for processing';
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  static async validatePDFFile(file: File) {
    const result = await this.validateFile(file);
    return {
      isValid: result.isValid,
      reason: result.reason,
      suggestions: result.suggestions,
      detectedType: result.detectedType.includes('pdf') ? 'credit_report' : 'other' as 'credit_report' | 'image_based' | 'encrypted' | 'empty' | 'other'
    };
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
  static getValidationActions(validation: Awaited<ReturnType<typeof PDFContentValidator.validateFile>>): string[] {
    if (validation.isValid) {
      return ['File looks good! Ready to upload.'];
    }

    const baseActions = [
      'Try uploading a different format (PDF, image, Word doc, or HTML)',
      'Ensure the file contains credit report information',
      'Download directly from credit bureau websites when possible'
    ];

    return validation.suggestions || baseActions;
  }
}