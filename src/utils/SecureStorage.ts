/**
 * Secure storage utility that encrypts data before storing in localStorage
 * and validates session ownership to prevent data leakage between users
 */

interface StorageItem {
  value: string;
  userId: string;
  timestamp: number;
  encrypted: boolean;
}

class SecureStorage {
  private static instance: SecureStorage;
  private encryptionKey: string | null = null;

  private constructor() {}

  static getInstance(): SecureStorage {
    if (!SecureStorage.instance) {
      SecureStorage.instance = new SecureStorage();
    }
    return SecureStorage.instance;
  }

  /**
   * Initialize encryption key from user session
   */
  initializeKey(userId: string): void {
    this.encryptionKey = this.generateKey(userId);
  }

  /**
   * Generate a simple encryption key from user ID
   * Note: This is basic encryption for sensitive localStorage data
   */
  private generateKey(userId: string): string {
    return btoa(userId + 'secure-key-salt').slice(0, 16);
  }

  /**
   * Simple XOR encryption for basic protection
   */
  private encrypt(text: string): string {
    if (!this.encryptionKey) return text;
    
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
      );
    }
    return btoa(result);
  }

  /**
   * Simple XOR decryption
   */
  private decrypt(encryptedText: string): string {
    if (!this.encryptionKey) return encryptedText;
    
    try {
      const decoded = atob(encryptedText);
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(
          decoded.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
        );
      }
      return result;
    } catch {
      return encryptedText;
    }
  }

  /**
   * Store encrypted data with user validation
   */
  setItem(key: string, value: any, userId: string): void {
    try {
      const serializedValue = JSON.stringify(value);
      const encryptedValue = this.encrypt(serializedValue);
      
      const storageItem: StorageItem = {
        value: encryptedValue,
        userId,
        timestamp: Date.now(),
        encrypted: true
      };

      localStorage.setItem(`secure_${key}`, JSON.stringify(storageItem));
    } catch (error) {
      console.error('Failed to store encrypted data:', error);
    }
  }

  /**
   * Retrieve and decrypt data with user validation
   */
  getItem<T>(key: string, currentUserId: string): T | null {
    try {
      const stored = localStorage.getItem(`secure_${key}`);
      if (!stored) return null;

      const storageItem: StorageItem = JSON.parse(stored);
      
      // Validate that data belongs to current user
      if (storageItem.userId !== currentUserId) {
        console.warn('Storage data belongs to different user, removing');
        this.removeItem(key);
        return null;
      }

      // Check if data is too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000;
      if (Date.now() - storageItem.timestamp > maxAge) {
        console.warn('Storage data expired, removing');
        this.removeItem(key);
        return null;
      }

      const decryptedValue = storageItem.encrypted 
        ? this.decrypt(storageItem.value)
        : storageItem.value;

      return JSON.parse(decryptedValue);
    } catch (error) {
      console.error('Failed to retrieve encrypted data:', error);
      return null;
    }
  }

  /**
   * Remove item from secure storage
   */
  removeItem(key: string): void {
    localStorage.removeItem(`secure_${key}`);
  }

  /**
   * Clear all secure storage for current user
   */
  clearUserData(userId: string): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('secure_')) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const storageItem: StorageItem = JSON.parse(stored);
            if (storageItem.userId === userId) {
              keysToRemove.push(key);
            }
          }
        } catch {
          // Invalid data, remove it
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Clear all secure storage
   */
  clearAll(): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('secure_')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    this.encryptionKey = null;
  }
}

export const secureStorage = SecureStorage.getInstance();