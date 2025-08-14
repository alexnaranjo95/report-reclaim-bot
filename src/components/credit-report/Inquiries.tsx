import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Inquiry } from '../../schema';

interface InquiriesProps {
  data: Inquiry[];
}

export const Inquiries: React.FC<InquiriesProps> = ({ data }) => {
  const getInquiryTypeVariant = (type: string) => {
    if (type?.toLowerCase() === 'hard') {
      return 'destructive';
    }
    if (type?.toLowerCase() === 'soft') {
      return 'secondary';
    }
    return 'outline';
  };

  return (
    <section aria-labelledby="inquiries-header">
      <Card>
        <CardHeader>
          <CardTitle id="inquiries-header">Recent Credit Inquiries</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-muted-foreground">No recent inquiries found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creditor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Bureau</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((inquiry, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {inquiry.creditorName || 'Unknown Creditor'}
                    </TableCell>
                    <TableCell>{inquiry.date || 'N/A'}</TableCell>
                    <TableCell>
                      {inquiry.type ? (
                        <Badge variant={getInquiryTypeVariant(inquiry.type)}>
                          {inquiry.type.charAt(0).toUpperCase() + inquiry.type.slice(1)}
                        </Badge>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>{inquiry.bureau || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
};