import React, { createContext, useContext, useState, useCallback } from 'react';
import { mapJsonToSchema } from '../mapper';
import type { CreditReport } from '../schema';

interface DataContextType {
  data: CreditReport | null;
  rawData: any;
  isLoading: boolean;
  error: string | null;
  handleUpload: (file: File) => Promise<void>;
  clearData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

interface DataProviderProps {
  children: React.ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const [data, setData] = useState<CreditReport | null>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const fileText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (typeof result === 'string') {
            resolve(result);
          } else {
            reject(new Error('Failed to read file as text'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });

      const jsonData = JSON.parse(fileText);
      setRawData(jsonData);
      
      const mappedData = mapJsonToSchema(jsonData);
      setData(mappedData);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process file';
      setError(errorMessage);
      console.error('File upload error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setData(null);
    setRawData(null);
    setError(null);
  }, []);

  return (
    <DataContext.Provider
      value={{
        data,
        rawData,
        isLoading,
        error,
        handleUpload,
        clearData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};