import React, { useMemo } from 'react';
import ReactDiffViewer from 'react-diff-viewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreditReport } from '../../schema';

interface DiffPanelProps {
  originalData: any;
  normalizedData: CreditReport;
}

export const DiffPanel: React.FC<DiffPanelProps> = ({ originalData, normalizedData }) => {
  const { originalText, normalizedText } = useMemo(() => {
    const original = JSON.stringify(originalData, null, 2);
    const normalized = JSON.stringify(normalizedData, null, 2);
    return {
      originalText: original,
      normalizedText: normalized,
    };
  }, [originalData, normalizedData]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Data Comparison</CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-4rem)] p-0">
        <div className="h-full overflow-auto">
          <ReactDiffViewer
            oldValue={originalText}
            newValue={normalizedText}
            splitView={true}
            leftTitle="Original JSON"
            rightTitle="Normalized Data"
            showDiffOnly={false}
            useDarkTheme={false}
            styles={{
              contentText: {
                fontFamily: 'monospace',
                fontSize: '12px',
              },
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};