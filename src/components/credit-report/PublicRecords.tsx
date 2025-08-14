import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DOMPurify from 'dompurify';
import parse from 'html-react-parser';
import type { PublicRecord, CreditorContact } from '../../schema';

interface PublicRecordsProps {
  publicRecords?: PublicRecord[];
  creditorContacts?: CreditorContact[];
}

export const PublicRecords: React.FC<PublicRecordsProps> = ({ 
  publicRecords = [], 
  creditorContacts = [] 
}) => {
  const renderSafeHtml = (html: string) => {
    const cleanHtml = DOMPurify.sanitize(html);
    return parse(cleanHtml);
  };

  return (
    <section aria-labelledby="public-records-header" className="space-y-6">
      {/* Public Records */}
      <Card>
        <CardHeader>
          <CardTitle id="public-records-header">Public Records</CardTitle>
        </CardHeader>
        <CardContent>
          {publicRecords.length === 0 ? (
            <p className="text-muted-foreground">No public records found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Filing Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Court</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publicRecords.map((record, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {record.type || 'Unknown Record'}
                    </TableCell>
                    <TableCell>{record.filingDate || 'N/A'}</TableCell>
                    <TableCell>{record.status || 'N/A'}</TableCell>
                    <TableCell>{record.amount || 'N/A'}</TableCell>
                    <TableCell>{record.court || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Creditor Contacts */}
      {creditorContacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Creditor Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Dispute Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditorContacts.map((contact, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{contact.name}</TableCell>
                    <TableCell>
                      {contact.address ? (
                        <div className="text-sm">
                          {typeof contact.address === 'string' && contact.address.includes('<') 
                            ? renderSafeHtml(contact.address)
                            : contact.address
                          }
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>{contact.phone || 'N/A'}</TableCell>
                    <TableCell>
                      {contact.website ? (
                        <a 
                          href={contact.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {contact.website}
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.disputeAddress ? (
                        <div className="text-sm">
                          {typeof contact.disputeAddress === 'string' && contact.disputeAddress.includes('<')
                            ? renderSafeHtml(contact.disputeAddress)
                            : contact.disputeAddress
                          }
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
};