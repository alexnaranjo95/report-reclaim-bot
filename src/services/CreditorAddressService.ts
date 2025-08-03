import { supabase } from '@/integrations/supabase/client';
import { PostgridAddress } from './PostgridService';

export interface CreditorAddress {
  id: string;
  creditor: string;
  bureau: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

class CreditorAddressService {
  async getCreditorAddress(creditor: string, bureau: string): Promise<CreditorAddress | null> {
    try {
      const params = new URLSearchParams({
        bureau: bureau,
        creditor: creditor
      });
      
      const { data, error } = await supabase.functions.invoke(`admin-addresses?${params.toString()}`);

      if (error) {
        console.error('Error fetching creditor address:', error);
        return null;
      }

      if (data?.data && data.data.length > 0) {
        return data.data[0];
      }

      return null;
    } catch (error) {
      console.error('Error in getCreditorAddress:', error);
      return null;
    }
  }

  async getPostgridAddress(creditor: string, bureau: string): Promise<PostgridAddress | null> {
    const address = await this.getCreditorAddress(creditor, bureau);
    
    if (!address) {
      return null;
    }

    // Convert creditor address to Postgrid format
    return {
      firstName: 'Dispute',
      lastName: 'Department',
      companyName: creditor,
      addressLine1: address.street || '123 Default Street',
      city: address.city || 'Default City',
      provinceOrState: address.state || 'CA',
      postalOrZip: address.zip || '90210',
      country: 'US'
    };
  }

  async replaceAddressPlaceholders(content: string, creditor: string, bureau: string): Promise<string> {
    const address = await this.getCreditorAddress(creditor, bureau);
    
    if (address) {
      const street = address.street || '[STREET NOT AVAILABLE]';
      const city = address.city || '[CITY NOT AVAILABLE]';
      const state = address.state || '[STATE NOT AVAILABLE]';
      const zip = address.zip || '[ZIP NOT AVAILABLE]';
      const fullAddress = `${street}\n${city}, ${state} ${zip}`;
      return content.replace(/\[CREDITOR_ADDRESS\]/g, fullAddress);
    } else {
      return content.replace(/\[CREDITOR_ADDRESS\]/g, '[ADDRESS NOT FOUND - PLEASE UPDATE MANUALLY]');
    }
  }
}

export const creditorAddressService = new CreditorAddressService();