import { supabase } from '@/integrations/supabase/client';
import { templateService, type TemplateData } from './TemplateService';

export interface PostgridAddress {
  firstName: string;
  lastName: string;
  companyName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  provinceOrState: string;
  postalOrZip: string;
  country: string;
}

export interface PostgridLetter {
  to: PostgridAddress;
  from: PostgridAddress;
  content: string;
  attachments?: File[];
  color?: boolean;
  doubleSided?: boolean;
  returnEnvelope?: boolean;
  roundNumber?: number;
  templateData?: TemplateData;
  identificationDocs?: File[];
}

export interface PostgridResponse {
  id: string;
  status: string;
  url?: string;
  estimatedDelivery?: string;
  cost?: number;
  error?: string;
}

class PostgridService {
  private async getPostgridApiKey(): Promise<string> {
    const { data, error } = await supabase.functions.invoke('get-postgrid-key');
    
    if (error) {
      console.error('Failed to get Postgrid API key:', error);
      throw new Error('Failed to retrieve Postgrid API key');
    }
    
    return data?.apiKey;
  }

  async sendLetter(letter: PostgridLetter, retryCount = 0): Promise<PostgridResponse> {
    try {
      console.log('🔑 Getting Postgrid API key...');
      const apiKey = await this.getPostgridApiKey();
      
      if (!apiKey) {
        throw new Error('Postgrid API key is not available');
      }
      
      console.log('✅ Postgrid API key retrieved successfully');
      
      // Process template if roundNumber and templateData are provided
      let finalContent = letter.content;
      if (letter.roundNumber && letter.templateData) {
        console.log('📝 Compiling template for round', letter.roundNumber);
        const compiledContent = await templateService.getCompiledLetterForRound(
          letter.roundNumber, 
          letter.templateData
        );
        if (compiledContent) {
          finalContent = compiledContent;
        }
      }

      // Note: PDF merging functionality has been removed
      
      // Validate required fields before sending
      this.validateLetterPayload({ ...letter, content: finalContent });
      
      // Create the correct JSON payload according to PostGrid API docs
      const payload = {
        to: {
          firstName: letter.to.firstName,
          lastName: letter.to.lastName,
          addressLine1: letter.to.addressLine1,
          addressLine2: letter.to.addressLine2 || undefined,
          city: letter.to.city,
          provinceOrState: letter.to.provinceOrState,
          postalOrZip: letter.to.postalOrZip,
          country: letter.to.country || 'US'
        },
        from: {
          firstName: letter.from.firstName,
          lastName: letter.from.lastName,
          addressLine1: letter.from.addressLine1,
          addressLine2: letter.from.addressLine2 || undefined,
          city: letter.from.city,
          provinceOrState: letter.from.provinceOrState,
          postalOrZip: letter.from.postalOrZip,
          country: letter.from.country || 'US'
        },
        html: finalContent,
        doubleSided: false,
        color: false,
        addressPlacement: 'top_first_page'
      };

      console.log('📤 Sending letter to PostGrid API...');
      console.log('Payload preview:', {
        to: `${payload.to.firstName} ${payload.to.lastName}`,
        from: `${payload.from.firstName} ${payload.from.lastName}`,
        contentLength: letter.content.length,
        hasAddressLine2: !!payload.to.addressLine2
      });
      
      const response = await fetch('https://api.postgrid.com/print-mail/v1/letters', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const responseText = await response.text();
      console.log('📨 PostGrid API response status:', response.status);
      console.log('📨 PostGrid API response body:', responseText);
      
      if (!response.ok) {
        let errorMessage = `PostGrid API Error (${response.status})`;
        let errorDetails = {};
        
        try {
          const errorData = JSON.parse(responseText);
          errorDetails = errorData;
          
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
          } else if (errorData.errors && Array.isArray(errorData.errors)) {
            errorMessage = errorData.errors.map(e => {
              if (typeof e === 'string') return e;
              if (e.message) return e.message;
              if (e.field && e.code) return `${e.field}: ${e.code}`;
              return JSON.stringify(e);
            }).join(', ');
          }
          
          console.error('❌ PostGrid detailed error:', errorData);
          
          // Handle common validation errors
          if (response.status === 400 || response.status === 422) {
            console.error('❌ Request validation failed. Check address fields and required data.');
          }
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${responseText}`;
          console.error('❌ PostGrid raw error:', responseText);
        }
        
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).details = errorDetails;
        throw error;
      }
      
      const responseData = JSON.parse(responseText);
      console.log('✅ Letter sent successfully:', responseData.id);
      
      return {
        id: responseData.id,
        status: responseData.status,
        url: responseData.url,
        estimatedDelivery: responseData.estimatedDelivery,
        cost: responseData.cost,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ Error sending letter via Postgrid:', errorMessage);
      console.error('Full error details:', error);
      
      // Retry logic for network failures
      if (retryCount === 0 && this.isNetworkError(error)) {
        console.log('🔄 Retrying request with exponential backoff...');
        await this.delay(2000 * Math.pow(2, retryCount)); // 2s, 4s, 8s...
        return this.sendLetter(letter, retryCount + 1);
      }
      
      return {
        id: '',
        status: 'error',
        error: this.getUserFriendlyError(error, errorMessage),
      };
    }
  }
  
  async getLetterStatus(letterId: string): Promise<PostgridResponse> {
    try {
      const apiKey = await this.getPostgridApiKey();
      
      const response = await fetch(`https://api.postgrid.com/print-mail/v1/letters/${letterId}`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get letter status');
      }
      
      const responseData = await response.json();
      
      return {
        id: responseData.id,
        status: responseData.status,
        url: responseData.url,
        estimatedDelivery: responseData.estimatedDelivery,
        cost: responseData.cost,
      };
      
    } catch (error) {
      console.error('❌ Error getting letter status:', error);
      return {
        id: letterId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private validateLetterPayload(letter: PostgridLetter): void {
    const requiredFields = [
      { path: 'to.firstName', value: letter.to.firstName },
      { path: 'to.lastName', value: letter.to.lastName },
      { path: 'to.addressLine1', value: letter.to.addressLine1 },
      { path: 'to.city', value: letter.to.city },
      { path: 'to.provinceOrState', value: letter.to.provinceOrState },
      { path: 'to.postalOrZip', value: letter.to.postalOrZip },
      { path: 'from.firstName', value: letter.from.firstName },
      { path: 'from.lastName', value: letter.from.lastName },
      { path: 'from.addressLine1', value: letter.from.addressLine1 },
      { path: 'from.city', value: letter.from.city },
      { path: 'from.provinceOrState', value: letter.from.provinceOrState },
      { path: 'from.postalOrZip', value: letter.from.postalOrZip },
      { path: 'content', value: letter.content }
    ];

    const missingFields = requiredFields.filter(field => !field.value?.trim());
    
    if (missingFields.length > 0) {
      const missingFieldNames = missingFields.map(f => f.path).join(', ');
      throw new Error(`Missing required fields: ${missingFieldNames}`);
    }

    // Validate content is not empty
    if (letter.content.trim().length < 10) {
      throw new Error('Letter content must be at least 10 characters long');
    }

    // Additional PostGrid-specific validations
    const validateAddress = (address: PostgridAddress, type: string) => {
      // Check address line length
      if (address.addressLine1.trim().length < 3) {
        throw new Error(`${type} address line 1 must be at least 3 characters`);
      }
      
      // Check postal code format based on country
      const postalCode = address.postalOrZip.trim();
      if (address.country === 'US' || !address.country) {
        // US ZIP code validation (5 or 9 digits)
        if (!/^\d{5}(-\d{4})?$/.test(postalCode)) {
          throw new Error(`${type} postal code must be valid US ZIP format (12345 or 12345-6789)`);
        }
      } else if (address.country === 'CA') {
        // Canadian postal code validation
        if (!/^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(postalCode.toUpperCase())) {
          throw new Error(`${type} postal code must be valid Canadian format (A1A 1A1)`);
        }
      }
      
      // State/Province validation for US/CA
      if (address.country === 'US' || !address.country) {
        if (address.provinceOrState.length !== 2) {
          throw new Error(`${type} state must be 2-letter US state code`);
        }
      }
    };

    validateAddress(letter.to, 'Recipient');
    validateAddress(letter.from, 'Sender');
  }

  private isNetworkError(error: any): boolean {
    return error.name === 'TypeError' || 
           error.message?.includes('fetch') || 
           error.message?.includes('network') ||
           error.code === 'NETWORK_ERROR';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getUserFriendlyError(error: any, fallbackMessage: string): string {
    if (error.status === 400 || error.status === 422) {
      return 'Invalid address or letter data. Please check all required fields and try again.';
    }
    if (error.status === 401) {
      return 'Authentication failed. Please check API credentials.';
    }
    if (error.status === 403) {
      return 'Access denied. Please verify account permissions.';
    }
    if (error.status >= 500) {
      return 'Server error. Please try again later.';
    }
    if (this.isNetworkError(error)) {
      return 'Network connection failed. Please check your internet connection and try again.';
    }
    return fallbackMessage;
  }
}

export const postgridService = new PostgridService();