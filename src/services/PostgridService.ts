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
      
      // Create the request payload as JSON first
      const payload = {
        to: {
          firstName: letter.to.firstName,
          lastName: letter.to.lastName,
          addressLine1: letter.to.addressLine1,
          city: letter.to.city,
          provinceOrState: letter.to.provinceOrState,
          postalOrZip: letter.to.postalOrZip,
          country: letter.to.country,
          ...(letter.to.companyName && { companyName: letter.to.companyName }),
          ...(letter.to.addressLine2 && { addressLine2: letter.to.addressLine2 })
        },
        from: {
          firstName: letter.from.firstName,
          lastName: letter.from.lastName,
          addressLine1: letter.from.addressLine1,
          city: letter.from.city,
          provinceOrState: letter.from.provinceOrState,
          postalOrZip: letter.from.postalOrZip,
          country: letter.from.country,
          ...(letter.from.companyName && { companyName: letter.from.companyName }),
          ...(letter.from.addressLine2 && { addressLine2: letter.from.addressLine2 })
        },
        // Use HTML content directly
        html: letter.content,
        color: letter.color || false,
        doubleSided: letter.doubleSided || false,
        returnEnvelope: letter.returnEnvelope || false
      };

      console.log('Sending letter to PostGrid with payload:', JSON.stringify(payload, null, 2));
      
      const response = await fetch('https://api.postgrid.com/print-mail/v1/letters', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const responseText = await response.text();
      console.log('PostGrid API response:', response.status, responseText);
      
      if (!response.ok) {
        let errorMessage = 'Failed to send letter via Postgrid';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${responseText}`;
        }
        throw new Error(errorMessage);
      }
      
      const responseData = JSON.parse(responseText);
      
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