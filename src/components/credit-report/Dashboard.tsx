import React, { useState } from 'react';
import { Upload, FileJson, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useData } from '../../context/DataProvider';
import { groupAccountsByCreditor } from '../../mapper';
import { PersonalInfo } from './PersonalInfo';
import { Scores } from './Scores';
import { Summary } from './Summary';
import { AccountGroup } from './AccountGroup';
import { Inquiries } from './Inquiries';
import { PublicRecords } from './PublicRecords';
import { DiffPanel } from './DiffPanel';
import { AlignmentChecker } from './AlignmentChecker';

export const Dashboard: React.FC = () => {
  const { data, rawData, isLoading, error, handleUpload } = useData();
  const [showDiff, setShowDiff] = useState(false);
  const [showAlignment, setShowAlignment] = useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const groupedAccounts = data?.accountDetails ? groupAccountsByCreditor(data.accountDetails) : {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p>Processing credit report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <FileJson className="h-6 w-6" />
            Credit Report Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Upload a JSON credit report file to get started
          </p>
          <div className="border-2 border-dashed border-muted rounded-lg p-8">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Button asChild>
                <span>Choose File</span>
              </Button>
              <input
                id="file-upload"
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container mx-auto py-6">
      {/* Header with Tools */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Credit Report Analysis</h1>
          <p className="text-muted-foreground">
            {data.reportDate && `Report Date: ${data.reportDate}`}
            {data.reportSource && ` | Source: ${data.reportSource}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowDiff(!showDiff)}
          >
            {showDiff ? 'Hide' : 'Show'} Diff
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowAlignment(!showAlignment)}
          >
            {showAlignment ? 'Hide' : 'Show'} Alignment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Main Content */}
        <div className={`${showDiff || showAlignment ? 'col-span-8' : 'col-span-12'} space-y-6`}>
          {/* Table of Contents */}
          <Card>
            <CardHeader>
              <CardTitle>Sections</CardTitle>
            </CardHeader>
            <CardContent>
              <nav>
                <ul className="space-y-1">
                  {data.personalInformation && <li><a href="#personal-info" className="text-primary hover:underline">Personal Information</a></li>}
                  {data.creditScores?.length && <li><a href="#credit-scores" className="text-primary hover:underline">Credit Scores</a></li>}
                  {data.accountSummary && <li><a href="#account-summary" className="text-primary hover:underline">Account Summary</a></li>}
                  {data.accountDetails?.length && <li><a href="#account-details" className="text-primary hover:underline">Account Details</a></li>}
                  {data.inquiries?.length && <li><a href="#inquiries" className="text-primary hover:underline">Inquiries</a></li>}
                  {(data.publicRecords?.length || data.creditorContacts?.length) && <li><a href="#public-records" className="text-primary hover:underline">Public Records & Contacts</a></li>}
                </ul>
              </nav>
            </CardContent>
          </Card>

          {/* Personal Information */}
          {data.personalInformation && (
            <div id="personal-info">
              <PersonalInfo data={data.personalInformation} />
            </div>
          )}

          {/* Credit Scores */}
          {data.creditScores?.length && (
            <div id="credit-scores">
              <Scores data={data.creditScores} />
            </div>
          )}

          {/* Account Summary */}
          {data.accountSummary && (
            <div id="account-summary">
              <Summary data={data.accountSummary} />
            </div>
          )}

          {/* Account Details */}
          {Object.keys(groupedAccounts).length > 0 && (
            <div id="account-details" className="space-y-4">
              <h2 className="text-2xl font-bold">Account Details</h2>
              {Object.entries(groupedAccounts).map(([creditor, accounts]) => (
                <AccountGroup 
                  key={creditor} 
                  creditor={creditor} 
                  accounts={accounts} 
                />
              ))}
            </div>
          )}

          {/* Inquiries */}
          {data.inquiries?.length && (
            <div id="inquiries">
              <Inquiries data={data.inquiries} />
            </div>
          )}

          {/* Public Records & Creditor Contacts */}
          {(data.publicRecords?.length || data.creditorContacts?.length) && (
            <div id="public-records">
              <PublicRecords 
                publicRecords={data.publicRecords} 
                creditorContacts={data.creditorContacts} 
              />
            </div>
          )}
        </div>

        {/* Side Panel */}
        {(showDiff || showAlignment) && (
          <div className="col-span-4">
            {showDiff && (
              <DiffPanel 
                originalData={rawData} 
                normalizedData={data} 
              />
            )}
            {showAlignment && (
              <AlignmentChecker 
                normalizedData={data}
                pdfText={rawData?.pdfText || ''}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};