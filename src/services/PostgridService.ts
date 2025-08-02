import { supabase } from '@/integrations/supabase/client';

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

  async sendLetter(letter: PostgridLetter): Promise<PostgridResponse> {
    try {
      const apiKey = await this.getPostgridApiKey();
      
      const formData = new FormData();
      
      // Add letter data
      formData.append('to[firstName]', letter.to.firstName);
      formData.append('to[lastName]', letter.to.lastName);
      formData.append('to[addressLine1]', letter.to.addressLine1);
      formData.append('to[city]', letter.to.city);
      formData.append('to[provinceOrState]', letter.to.provinceOrState);
      formData.append('to[postalOrZip]', letter.to.postalOrZip);
      formData.append('to[country]', letter.to.country);
      
      if (letter.to.companyName) {
        formData.append('to[companyName]', letter.to.companyName);
      }
      if (letter.to.addressLine2) {
        formData.append('to[addressLine2]', letter.to.addressLine2);
      }
      
      formData.append('from[firstName]', letter.from.firstName);
      formData.append('from[lastName]', letter.from.lastName);
      formData.append('from[addressLine1]', letter.from.addressLine1);
      formData.append('from[city]', letter.from.city);
      formData.append('from[provinceOrState]', letter.from.provinceOrState);
      formData.append('from[postalOrZip]', letter.from.postalOrZip);
      formData.append('from[country]', letter.from.country);
      
      if (letter.from.companyName) {
        formData.append('from[companyName]', letter.from.companyName);
      }
      if (letter.from.addressLine2) {
        formData.append('from[addressLine2]', letter.from.addressLine2);
      }
      
      // Add content as HTML
      const blob = new Blob([letter.content], { type: 'text/html' });
      formData.append('file', blob, 'dispute-letter.html');
      
      // Add attachments (intake documents)
      if (letter.attachments) {
        letter.attachments.forEach((file, index) => {
          formData.append(`attachments[${index}]`, file);
        });
      }
      
      // Add options
      formData.append('color', letter.color ? 'true' : 'false');
      formData.append('doubleSided', letter.doubleSided ? 'true' : 'false');
      formData.append('returnEnvelope', letter.returnEnvelope ? 'true' : 'false');
      
      const response = await fetch('https://api.postgrid.com/print-mail/v1/letters', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send letter via Postgrid');
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
      console.error('Error sending letter via Postgrid:', error);
      return {
        id: '',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
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
      console.error('Error getting letter status:', error);
      return {
        id: letterId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}

export const postgridService = new PostgridService();