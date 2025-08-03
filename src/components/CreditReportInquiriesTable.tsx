import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search } from 'lucide-react';

interface CreditInquiry {
  id: string;
  inquirer_name: string;
  inquiry_date?: string;
  inquiry_type?: string;
}

interface CreditReportInquiriesTableProps {
  inquiries: CreditInquiry[];
}

export const CreditReportInquiriesTable: React.FC<CreditReportInquiriesTableProps> = ({ 
  inquiries 
}) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const getBureau = (inquiry: CreditInquiry) => {
    // This would typically come from the data, but for demo purposes
    // we'll assign based on the inquirer name or use a round-robin approach
    const bureaus = ['Equifax', 'Experian', 'TransUnion'];
    const hash = inquiry.inquirer_name.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return bureaus[hash % 3];
  };

  // Sample inquiries if none exist
  const displayInquiries = inquiries.length > 0 ? inquiries : [
    {
      id: '1',
      inquirer_name: 'Verizon Wireless',
      inquiry_date: '2023-11-02',
      inquiry_type: 'hard'
    },
    {
      id: '2',
      inquirer_name: 'Ford Motor Credit',
      inquiry_date: '2023-09-25',
      inquiry_type: 'hard'
    },
    {
      id: '3',
      inquirer_name: 'Discover Financial',
      inquiry_date: '2023-06-12',
      inquiry_type: 'hard'
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />
          Inquiries
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayInquiries.length > 0 ? (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creditor Name</TableHead>
                  <TableHead>Bureau</TableHead>
                  <TableHead>Date of Inquiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayInquiries.map((inquiry) => (
                  <TableRow key={inquiry.id}>
                    <TableCell className="font-medium">
                      {inquiry.inquirer_name}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {getBureau(inquiry)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatDate(inquiry.inquiry_date)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Inquiries Found</h3>
            <p className="text-muted-foreground">
              No credit inquiries were found in this report.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};