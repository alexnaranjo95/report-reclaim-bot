import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { PersonalInformation } from '../../schema';

interface PersonalInfoProps {
  data: PersonalInformation;
}

export const PersonalInfo: React.FC<PersonalInfoProps> = ({ data }) => {
  return (
    <section aria-labelledby="personal-info-header" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle id="personal-info-header">Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Full Name</TableCell>
                <TableCell>{data.fullName || 'N/A'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Birth Date</TableCell>
                <TableCell>{data.birthDate || 'N/A'}</TableCell>
              </TableRow>
              {data.ssn && (
                <TableRow>
                  <TableCell className="font-medium">SSN</TableCell>
                  <TableCell>***-**-{data.ssn.slice(-4)}</TableCell>
                </TableRow>
              )}
              {data.phone && (
                <TableRow>
                  <TableCell className="font-medium">Phone</TableCell>
                  <TableCell>{data.phone}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.addresses && data.addresses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Addresses</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.addresses.map((addr, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{addr.type || 'Address'}</TableCell>
                    <TableCell>
                      <address className="not-italic">
                        {[addr.street, addr.city, addr.state, addr.postalCode]
                          .filter(Boolean)
                          .join(', ')}
                      </address>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.employers && data.employers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Employment History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employer</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.employers.map((employer, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{employer.name || 'N/A'}</TableCell>
                    <TableCell>{employer.position || 'N/A'}</TableCell>
                    <TableCell>
                      {employer.startDate || 'N/A'} - {employer.endDate || 'Present'}
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