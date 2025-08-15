import { Logger } from './logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public code?: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Centralized error handler
 */
export class ErrorHandler {
  /**
   * Handle and log errors consistently
   */
  static handle(error: unknown, context?: string): string {
    const errorMessage = this.getErrorMessage(error);
    const errorDetails = this.getErrorDetails(error);
    
    if (context) {
      Logger.error(`[${context}] ${errorMessage}`, errorDetails);
    } else {
      Logger.error(errorMessage, errorDetails);
    }
    
    return errorMessage;
  }
  
  /**
   * Extract error message from various error types
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof AppError) {
      return error.message;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    
    return 'An unexpected error occurred';
  }
  
  /**
   * Get detailed error information for logging
   */
  static getErrorDetails(error: unknown): any {
    if (error instanceof AppError) {
      return {
        code: error.code,
        statusCode: error.statusCode,
        details: error.details,
        stack: error.stack
      };
    }
    
    if (error instanceof Error) {
      return {
        name: error.name,
        stack: error.stack
      };
    }
    
    return error;
  }
  
  /**
   * Create user-friendly error messages
   */
  static getUserMessage(error: unknown): string {
    const message = this.getErrorMessage(error);
    
    // Map technical errors to user-friendly messages
    const userMessages: Record<string, string> = {
      'No raw text found': 'The PDF file could not be read. Please try uploading again.',
      'Failed to extract text': 'Unable to process the PDF. Please ensure it is a valid credit report.',
      'No file uploaded': 'Please upload a credit report PDF file.',
      'Failed to parse': 'Unable to extract credit information. Please check the file format.',
      'Network request failed': 'Connection error. Please check your internet and try again.',
      'Unauthorized': 'You do not have permission to perform this action.',
      'Not found': 'The requested resource was not found.'
    };
    
    // Check for matching user message
    for (const [key, userMessage] of Object.entries(userMessages)) {
      if (message.toLowerCase().includes(key.toLowerCase())) {
        return userMessage;
      }
    }
    
    // Return original message if no mapping found
    return message;
  }
  
  /**
   * Wrap async functions with error handling
   */
  static async wrapAsync<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (error) {
      const errorMessage = this.handle(error, context);
      return { success: false, error: errorMessage };
    }
  }
}