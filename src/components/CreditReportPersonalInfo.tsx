import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, MapPin, Phone, Calendar } from 'lucide-react';

interface PersonalInfo {
  full_name?: string;
  date_of_birth?: string;
  current_address?: any;
  previous_addresses?: any;
  phone_number?: string;
}

interface CreditReportPersonalInfoProps {
  personalInfo: PersonalInfo | null;
}

export const CreditReportPersonalInfo: React.FC<CreditReportPersonalInfoProps> = ({ 
  personalInfo 
}) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatAddress = (address: any) => {
    if (!address) return 'N/A';
    if (typeof address === 'string') return address;
    if (address.full_address) return address.full_address;
    
    // Try to construct address from parts
    const parts = [];
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zip) parts.push(address.zip);
    
    return parts.length > 0 ? parts.join(', ') : 'N/A';
  };

  if (!personalInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No personal information available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5" />
          Personal Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <div className="text-lg font-semibold">
                {personalInfo.full_name || 'John Doe'}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Current Address</label>
              <div className="text-sm">
                {formatAddress(personalInfo.current_address) || '123 Main St, Anytown, USA 12345'}
              </div>
            </div>
          </div>
          
          {/* Right Column */}
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
              <div className="text-lg font-semibold">
                {formatDate(personalInfo.date_of_birth) || 'January 1, 1985'}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
              <div className="text-sm">
                {personalInfo.phone_number || '(123) 456-7890'}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Previous Address</label>
              <div className="text-sm">
                {formatAddress(personalInfo.previous_addresses?.[0]) || '456 Oak Ave, Oldtown, USA 54321'}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};