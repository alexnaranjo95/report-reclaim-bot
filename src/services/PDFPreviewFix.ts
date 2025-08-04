import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Emergency PDF preview service to fix broken preview functionality
 */
export class PDFPreviewFix {
  
  /**
   * Test and fix PDF preview functionality
   */
  static async testAndFixPreview(report: any): Promise<string | null> {
    console.log('🔍 Testing PDF preview functionality for:', report.file_name);
    
    try {
      if (!report.file_path) {
        console.error('❌ No file path available');
        toast.error('No file path available for preview');
        return null;
      }

      console.log('📁 File path:', report.file_path);

      // Test multiple methods to access the file
      console.log('🔍 Method 1: Creating signed URL...');
      const { data: signedData, error: signedError } = await supabase.storage
        .from('credit-reports')
        .createSignedUrl(report.file_path, 3600);

      if (signedError) {
        console.error('❌ Signed URL failed:', signedError);
        
        // Try public URL method
        console.log('🔍 Method 2: Attempting public URL...');
        const { data: publicData } = supabase.storage
          .from('credit-reports')
          .getPublicUrl(report.file_path);
          
        if (publicData.publicUrl) {
          console.log('✅ Public URL generated:', publicData.publicUrl);
          return publicData.publicUrl;
        } else {
          console.error('❌ Public URL also failed');
          toast.error('Unable to generate file URL for preview');
          return null;
        }
      }

      if (!signedData?.signedUrl) {
        console.error('❌ No signed URL returned');
        toast.error('No URL returned from storage');
        return null;
      }

      console.log('✅ Signed URL created successfully');
      
      // Test if the URL is actually accessible
      try {
        console.log('🔍 Testing URL accessibility...');
        const testResponse = await fetch(signedData.signedUrl, { method: 'HEAD' });
        
        if (testResponse.ok) {
          console.log('✅ File is accessible via URL');
          return signedData.signedUrl;
        } else {
          console.error('❌ File not accessible:', testResponse.status, testResponse.statusText);
          toast.error(`File not accessible: ${testResponse.status}`);
          return null;
        }
      } catch (fetchError) {
        console.error('❌ URL accessibility test failed:', fetchError);
        // Return URL anyway, might be a CORS issue
        return signedData.signedUrl;
      }

    } catch (error) {
      console.error('❌ Preview test failed:', error);
      toast.error('Preview functionality test failed');
      return null;
    }
  }

  /**
   * Open preview in new window/tab as fallback
   */
  static async openPreviewFallback(report: any): Promise<void> {
    const url = await this.testAndFixPreview(report);
    
    if (url) {
      console.log('🚀 Opening PDF in new tab...');
      window.open(url, '_blank');
      toast.success('PDF opened in new tab');
    } else {
      toast.error('Unable to open PDF preview');
    }
  }

  /**
   * Diagnose storage bucket configuration
   */
  static async diagnoseBucketConfig(): Promise<void> {
    console.log('🔍 Diagnosing storage bucket configuration...');
    
    try {
      // Test bucket access
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        console.error('❌ Cannot list buckets:', bucketsError);
        return;
      }

      const creditReportsBucket = buckets?.find(bucket => bucket.name === 'credit-reports');
      
      if (!creditReportsBucket) {
        console.error('❌ credit-reports bucket not found');
        console.log('📋 Available buckets:', buckets?.map(b => b.name));
        return;
      }

      console.log('✅ credit-reports bucket found:', {
        id: creditReportsBucket.id,
        name: creditReportsBucket.name,
        public: creditReportsBucket.public,
        created_at: creditReportsBucket.created_at
      });

      // Test listing files in bucket
      try {
        const { data: files, error: filesError } = await supabase.storage
          .from('credit-reports')
          .list('', { limit: 5 });

        if (filesError) {
          console.error('❌ Cannot list files in bucket:', filesError);
        } else {
          console.log('✅ Can access bucket, file count:', files?.length || 0);
        }
      } catch (listError) {
        console.error('❌ File listing test failed:', listError);
      }

    } catch (error) {
      console.error('❌ Bucket diagnosis failed:', error);
    }
  }
}