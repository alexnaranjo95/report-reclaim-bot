/**
 * Enhanced file validation utility for security
 */

interface FileValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PDF_MAGIC_NUMBERS = [0x25, 0x50, 0x44, 0x46]; // %PDF

export class FileValidator {
  /**
   * Comprehensive file validation
   */
  static async validateFile(file: File): Promise<FileValidationResult> {
    const warnings: string[] = [];
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size exceeds 10MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`
      };
    }

    if (file.size === 0) {
      return {
        isValid: false,
        error: 'File is empty'
      };
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        isValid: false,
        error: `File type not allowed: ${file.type}. Allowed types: PDF, JPEG, PNG, GIF, WebP`
      };
    }

    // Validate file extension matches MIME type
    const extension = file.name.toLowerCase().split('.').pop();
    const mimeTypeValid = this.validateMimeTypeExtension(file.type, extension);
    if (!mimeTypeValid) {
      return {
        isValid: false,
        error: 'File extension does not match file type'
      };
    }

    // Check for suspicious file names
    if (this.hasSuspiciousName(file.name)) {
      warnings.push('File name contains potentially suspicious characters');
    }

    // Validate file signature (magic numbers) for PDFs
    if (file.type === 'application/pdf') {
      const isValidPdf = await this.validatePdfSignature(file);
      if (!isValidPdf) {
        return {
          isValid: false,
          error: 'File does not appear to be a valid PDF'
        };
      }
    }

    // Validate image files
    if (file.type.startsWith('image/')) {
      const isValidImage = await this.validateImageFile(file);
      if (!isValidImage) {
        return {
          isValid: false,
          error: 'File does not appear to be a valid image'
        };
      }
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate MIME type matches file extension
   */
  private static validateMimeTypeExtension(mimeType: string, extension?: string): boolean {
    if (!extension) return false;

    const validExtensions: Record<string, string[]> = {
      'application/pdf': ['pdf'],
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/gif': ['gif'],
      'image/webp': ['webp']
    };

    const allowedExtensions = validExtensions[mimeType];
    return allowedExtensions ? allowedExtensions.includes(extension) : false;
  }

  /**
   * Check for suspicious file names
   */
  private static hasSuspiciousName(filename: string): boolean {
    const suspiciousPatterns = [
      /\.(exe|bat|cmd|scr|vbs|js|jar)$/i,
      /[<>:"|?*]/,
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i,
      /\.\./,
      /^\.+$/
    ];

    return suspiciousPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Validate PDF file signature
   */
  private static async validatePdfSignature(file: File): Promise<boolean> {
    try {
      const buffer = await file.slice(0, 4).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      return PDF_MAGIC_NUMBERS.every((expectedByte, index) => 
        bytes[index] === expectedByte
      );
    } catch {
      return false;
    }
  }

  /**
   * Validate image file by attempting to load it
   */
  private static async validateImageFile(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      
      img.onload = () => {
        resolve(true);
      };
      
      img.onerror = () => {
        resolve(false);
      };

      try {
        img.src = URL.createObjectURL(file);
        
        // Clean up object URL after a timeout
        setTimeout(() => {
          URL.revokeObjectURL(img.src);
        }, 1000);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Sanitize filename for safe storage
   */
  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 100); // Limit length
  }

  /**
   * Generate secure filename with timestamp
   */
  static generateSecureFilename(originalFilename: string, userId: string): string {
    const extension = originalFilename.split('.').pop()?.toLowerCase() || '';
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const userPrefix = userId.substring(0, 8);
    
    return `${userPrefix}_${timestamp}_${randomSuffix}.${extension}`;
  }
}