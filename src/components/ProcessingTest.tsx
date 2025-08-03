import React from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const ProcessingTest: React.FC = () => {
  const handleTestProcessing = async () => {
    try {
      console.log('=== TESTING PROCESSING FUNCTION ===');
      
      // First, get the latest uploaded report
      const { data: reports, error: reportsError } = await supabase
        .from('credit_reports')
        .select('id, file_path, extraction_status')
        .order('created_at', { ascending: false })
        .limit(1);

      if (reportsError || !reports?.length) {
        toast.error('No reports found to process');
        return;
      }

      const report = reports[0];
      console.log('Processing report:', report);

      if (!report.file_path) {
        toast.error('No file path found for report');
        return;
      }

      // Update status to processing
      await supabase
        .from('credit_reports')
        .update({ extraction_status: 'processing' })
        .eq('id', report.id);

      // Call the processing function
      console.log('Calling process-credit-report function...');
      const { data, error } = await supabase.functions.invoke('process-credit-report', {
        body: {
          reportId: report.id,
          filePath: report.file_path,
        },
      });

      console.log('Function result:', { data, error });

      if (error) {
        console.error('Processing error:', error);
        toast.error(`Processing failed: ${error.message}`);
      } else {
        console.log('Processing successful:', data);
        toast.success('Processing completed successfully!');
      }

    } catch (error) {
      console.error('Test error:', error);
      toast.error(`Test failed: ${error.message}`);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-yellow-50">
      <h3 className="font-semibold mb-2">Processing Test</h3>
      <p className="text-sm text-gray-600 mb-4">
        This will process the most recent uploaded credit report
      </p>
      <Button onClick={handleTestProcessing}>
        Test Processing Function
      </Button>
    </div>
  );
};