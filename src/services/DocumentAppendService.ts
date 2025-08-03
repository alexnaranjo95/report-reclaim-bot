import { supabase } from '@/integrations/supabase/client';

interface DocumentAppendSettings {
  includeGovId: boolean;
  includeProofOfAddress: boolean;
  includeSSN: boolean;
}

interface AdminExampleDoc {
  id: string;
  category: 'gov_id' | 'proof_of_address' | 'ssn';
  file_url: string;
  file_name: string;
}

export class DocumentAppendService {
  /**
   * Save append settings for a specific round
   */
  static async saveRoundAppendSettings(
    roundId: string, 
    settings: DocumentAppendSettings
  ): Promise<void> {
    const { error } = await supabase
      .from('rounds')
      .update({ append_settings: settings as any })
      .eq('id', roundId);

    if (error) {
      throw new Error(`Failed to save append settings: ${error.message}`);
    }
  }

  /**
   * Load append settings for a specific round
   */
  static async loadRoundAppendSettings(roundId: string): Promise<DocumentAppendSettings> {
    const { data, error } = await supabase
      .from('rounds')
      .select('append_settings')
      .eq('id', roundId)
      .single();

    if (error) {
      throw new Error(`Failed to load append settings: ${error.message}`);
    }

    const appendSettings = data.append_settings as any;
    return {
      includeGovId: appendSettings?.includeGovId || false,
      includeProofOfAddress: appendSettings?.includeProofOfAddress || false,
      includeSSN: appendSettings?.includeSSN || false
    };
  }

  /**
   * Get stored admin example documents
   */
  static async getAdminExampleDocs(): Promise<AdminExampleDoc[]> {
    const { data, error } = await supabase
      .from('admin_example_documents')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load admin example docs: ${error.message}`);
    }

    return (data as AdminExampleDoc[]) || [];
  }

  /**
   * Get client's identity documents for appending
   */
  static async getClientDocuments(
    userId: string, 
    settings: DocumentAppendSettings
  ): Promise<{ category: string; url: string }[]> {
    const documents: { category: string; url: string }[] = [];

    // Get user's verification documents from their profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('verification_documents')
      .eq('user_id', userId)
      .single();

    if (error || !profile?.verification_documents) {
      return documents;
    }

    const verificationDocs = profile.verification_documents as any[];

    // Map settings to document categories and get URLs
    if (settings.includeGovId) {
      const govIdDoc = verificationDocs.find(doc => 
        doc.type === 'government_id' && doc.status === 'approved'
      );
      if (govIdDoc?.file_url) {
        documents.push({ category: 'government_id', url: govIdDoc.file_url });
      }
    }

    if (settings.includeProofOfAddress) {
      const proofDoc = verificationDocs.find(doc => 
        doc.type === 'proof_of_address' && doc.status === 'approved'
      );
      if (proofDoc?.file_url) {
        documents.push({ category: 'proof_of_address', url: proofDoc.file_url });
      }
    }

    if (settings.includeSSN) {
      const ssnDoc = verificationDocs.find(doc => 
        doc.type === 'ssn' && doc.status === 'approved'
      );
      if (ssnDoc?.file_url) {
        documents.push({ category: 'ssn', url: ssnDoc.file_url });
      }
    }

    return documents;
  }

  /**
   * Get signed URLs for admin example documents (for preview)
   */
  static async getAdminExampleUrls(settings: DocumentAppendSettings): Promise<{ category: string; url: string }[]> {
    const documents: { category: string; url: string }[] = [];
    const exampleDocs = await this.getAdminExampleDocs();

    if (settings.includeGovId) {
      const govIdDoc = exampleDocs.find(doc => doc.category === 'gov_id');
      if (govIdDoc) {
        documents.push({ category: 'government_id', url: govIdDoc.file_url });
      }
    }

    if (settings.includeProofOfAddress) {
      const proofDoc = exampleDocs.find(doc => doc.category === 'proof_of_address');
      if (proofDoc) {
        documents.push({ category: 'proof_of_address', url: proofDoc.file_url });
      }
    }

    if (settings.includeSSN) {
      const ssnDoc = exampleDocs.find(doc => doc.category === 'ssn');
      if (ssnDoc) {
        documents.push({ category: 'ssn', url: ssnDoc.file_url });
      }
    }

    return documents;
  }
}

export const documentAppendService = new DocumentAppendService();