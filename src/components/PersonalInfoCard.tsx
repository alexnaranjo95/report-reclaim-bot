import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Edit, Eye, EyeOff, MapPin, Briefcase, Calendar, User } from 'lucide-react';

interface PersonalInfo {
  name: string;
  aliases: string[];
  birthDate: string;
  addresses: Array<{
    address: string;
    type: 'current' | 'previous';
    dates?: string;
  }>;
  employers: Array<{
    name: string;
    dates?: string;
  }>;
}

interface PersonalInfoCardProps {
  personalInfo: PersonalInfo;
}

export const PersonalInfoCard: React.FC<PersonalInfoCardProps> = ({ personalInfo }) => {
  const [showSensitive, setShowSensitive] = useState(false);
  const [selectedSection, setSelectedSection] = useState<'overview' | 'addresses' | 'employment'>('overview');

  const formatDate = (dateString: string) => {
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

  const calculateAge = (birthDate: string) => {
    try {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      
      return age;
    } catch {
      return null;
    }
  };

  const age = calculateAge(personalInfo.birthDate);
  const currentAddress = personalInfo.addresses.find(addr => addr.type === 'current');
  const previousAddresses = personalInfo.addresses.filter(addr => addr.type === 'previous');
  const recentEmployer = personalInfo.employers[0]; // Assuming first is most recent

  // Check for potential issues
  const issues = [];
  if (personalInfo.aliases.length > 3) {
    issues.push({
      type: 'warning',
      message: 'Multiple name variations may cause identity verification issues'
    });
  }
  if (previousAddresses.length > 5) {
    issues.push({
      type: 'info',
      message: 'Many previous addresses may require additional verification'
    });
  }

  const sections = [
    { key: 'overview', label: 'Overview', icon: User },
    { key: 'addresses', label: 'Addresses', icon: MapPin },
    { key: 'employment', label: 'Employment', icon: Briefcase },
  ];

  return (
    <div className="space-y-6">
      {/* Section Navigation */}
      <div className="flex gap-2">
        {sections.map(section => {
          const Icon = section.icon;
          return (
            <Button
              key={section.key}
              variant={selectedSection === section.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedSection(section.key as any)}
              className="flex items-center gap-2"
            >
              <Icon className="h-3 w-3" />
              {section.label}
            </Button>
          );
        })}
      </div>

      {/* Issues Alert */}
      {issues.length > 0 && (
        <Card className="border-l-4 border-l-warning bg-warning/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-medium">Potential Identity Verification Issues</h4>
                {issues.map((issue, index) => (
                  <p key={index} className="text-sm text-muted-foreground">
                    {issue.message}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {selectedSection === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Primary Information */}
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Primary Information
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSensitive(!showSensitive)}
                className="flex items-center gap-2"
              >
                {showSensitive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showSensitive ? 'Hide' : 'Show'} Sensitive
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                  <p className="text-lg font-semibold">{personalInfo.name}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {showSensitive ? formatDate(personalInfo.birthDate) : '••/••/••••'}
                    </p>
                    {age && showSensitive && (
                      <Badge variant="outline">Age {age}</Badge>
                    )}
                  </div>
                </div>

                {currentAddress && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Current Address</label>
                    <p className="font-medium">
                      {showSensitive ? currentAddress.address : '•••••••••••••••••••••••••'}
                    </p>
                    {currentAddress.dates && (
                      <p className="text-sm text-muted-foreground">Since {currentAddress.dates}</p>
                    )}
                  </div>
                )}

                {recentEmployer && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Current Employer</label>
                    <p className="font-medium">{recentEmployer.name}</p>
                    {recentEmployer.dates && (
                      <p className="text-sm text-muted-foreground">{recentEmployer.dates}</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Name Variations */}
          {personalInfo.aliases.length > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Name Variations</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Different name formats found on your credit reports
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {personalInfo.aliases.map((alias, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 border border-border rounded"
                    >
                      <span className="font-medium">{alias}</span>
                      {index === 0 && (
                        <Badge variant="default">Primary</Badge>
                      )}
                    </div>
                  ))}
                </div>
                {personalInfo.aliases.length > 3 && (
                  <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-warning">Multiple name variations detected</p>
                        <p className="text-muted-foreground">
                          Consider ensuring consistent name usage across all financial accounts.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {selectedSection === 'addresses' && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Address History
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Current and previous addresses on file
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Current Address */}
              {currentAddress && (
                <div className="p-4 border border-success/20 bg-success/5 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Current Address
                    </h4>
                    <Badge variant="default">Primary</Badge>
                  </div>
                  <p className="font-mono text-sm">
                    {showSensitive ? currentAddress.address : '•••••••••••••••••••••••••'}
                  </p>
                  {currentAddress.dates && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Resident since: {currentAddress.dates}
                    </p>
                  )}
                </div>
              )}

              {/* Previous Addresses */}
              {previousAddresses.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Previous Addresses</h4>
                  <div className="space-y-3">
                    {previousAddresses.map((address, index) => (
                      <div key={index} className="p-3 border border-border rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <Badge variant="outline">Previous #{index + 1}</Badge>
                          {address.dates && (
                            <span className="text-xs text-muted-foreground">{address.dates}</span>
                          )}
                        </div>
                        <p className="font-mono text-sm">
                          {showSensitive ? address.address : '•••••••••••••••••••••••••'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {personalInfo.addresses.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4" />
                  <p>No address information available</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedSection === 'employment' && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Employment History
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Current and previous employers on file
            </p>
          </CardHeader>
          <CardContent>
            {personalInfo.employers.length > 0 ? (
              <div className="space-y-4">
                {personalInfo.employers.map((employer, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      index === 0 
                        ? 'border-success/20 bg-success/5' 
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium flex items-center gap-2">
                        {index === 0 && <CheckCircle className="h-4 w-4 text-success" />}
                        {employer.name}
                      </h4>
                      <Badge variant={index === 0 ? "default" : "outline"}>
                        {index === 0 ? "Current" : `Previous #${index}`}
                      </Badge>
                    </div>
                    {employer.dates && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{employer.dates}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4" />
                <p>No employment information available</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex items-center gap-2">
          <Edit className="h-4 w-4" />
          Request Updates
        </Button>
        <Button variant="outline" className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Dispute Inaccuracies
        </Button>
      </div>
    </div>
  );
};