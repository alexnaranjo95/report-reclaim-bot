/**
 * Simple logger utility to centralize logging
 * Can be extended to send logs to external services in production
 */
export class Logger {
  private static isDevelopment = import.meta.env.DEV;
  private static logLevel = import.meta.env.VITE_LOG_LEVEL || 'info';
  
  private static shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex <= currentLevelIndex;
  }
  
  static error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
  
  static warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }
  
  static info(message: string, ...args: any[]): void {
    if (this.shouldLog('info') && this.isDevelopment) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }
  
  static debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug') && this.isDevelopment) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
  
  /**
   * Log with emoji indicators for better visibility
   */
  static success(message: string, ...args: any[]): void {
    if (this.isDevelopment) {
      console.log(`✅ ${message}`, ...args);
    }
  }
  
  static progress(message: string, ...args: any[]): void {
    if (this.isDevelopment) {
      console.log(`🚀 ${message}`, ...args);
    }
  }
  
  static warning(message: string, ...args: any[]): void {
    if (this.isDevelopment) {
      console.warn(`⚠️ ${message}`, ...args);
    }
  }
  
  /**
   * Group related logs together
   */
  static group(label: string, fn: () => void): void {
    if (this.isDevelopment) {
      console.group(label);
      fn();
      console.groupEnd();
    } else {
      fn();
    }
  }
  
  /**
   * Measure performance
   */
  static time(label: string): void {
    if (this.isDevelopment) {
      console.time(label);
    }
  }
  
  static timeEnd(label: string): void {
    if (this.isDevelopment) {
      console.timeEnd(label);
    }
  }
}