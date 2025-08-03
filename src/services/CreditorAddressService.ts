import { supabase } from '@/integrations/supabase/client';
import { PostgridAddress } from './PostgridService';

export interface CreditorAddress {
  id: string;
  creditor: string;
  bureau: string;
  street: string;
  city: string;
  state: string;
  zip: string;
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
      addressLine1: address.street,
      city: address.city,
      provinceOrState: address.state,
      postalOrZip: address.zip,
      country: 'US'
    };
  }

  async replaceAddressPlaceholders(content: string, creditor: string, bureau: string): Promise<string> {
    const address = await this.getCreditorAddress(creditor, bureau);
    
    if (address) {
      const fullAddress = `${address.street}\n${address.city}, ${address.state} ${address.zip}`;
      return content.replace(/\[CREDITOR_ADDRESS\]/g, fullAddress);
    } else {
      return content.replace(/\[CREDITOR_ADDRESS\]/g, '[ADDRESS NOT FOUND - PLEASE UPDATE MANUALLY]');
    }
  }
}

export const creditorAddressService = new CreditorAddressService();