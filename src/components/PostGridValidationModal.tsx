import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle } from 'lucide-react';

interface ValidationError {
  isValid: boolean;
  missingSenderFields: string[];
  missingRecipientFields: string[];
}

interface PostGridData {
  sender: {
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
  };
  recipient: {
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
  };
}

interface PostGridValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onValidated: (data: PostGridData) => void;
  initialData?: Partial<PostGridData>;
  letterCount: number;
}

function validateLetterMeta(data: PostGridData): ValidationError {
  const requiredFields = ['name', 'address_line1', 'city', 'state', 'postal_code'];

  const missingSenderFields = requiredFields.filter(field => !data.sender[field as keyof typeof data.sender]?.trim());
  const missingRecipientFields = requiredFields.filter(field => !data.recipient[field as keyof typeof data.recipient]?.trim());

  return {
    isValid: missingSenderFields.length === 0 && missingRecipientFields.length === 0,
    missingSenderFields,
    missingRecipientFields
  };
}

const PostGridValidationModal: React.FC<PostGridValidationModalProps> = ({
  isOpen,
  onClose,
  onValidated,
  initialData,
  letterCount
}) => {
  const [formData, setFormData] = useState<PostGridData>({
    sender: {
      name: '',
      address_line1: '',
      city: '',
      state: '',
      postal_code: ''
    },
    recipient: {
      name: '',
      address_line1: '',
      city: '',
      state: '',
      postal_code: ''
    }
  });

  const [validation, setValidation] = useState<ValidationError>({
    isValid: false,
    missingSenderFields: [],
    missingRecipientFields: []
  });

  // Initialize form data with any provided initial data
  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({
        sender: { ...prev.sender, ...initialData.sender },
        recipient: { ...prev.recipient, ...initialData.recipient }
      }));
    }
  }, [initialData]);

  // Validate form whenever data changes
  useEffect(() => {
    const validationResult = validateLetterMeta(formData);
    setValidation(validationResult);
  }, [formData]);

  const handleInputChange = (section: 'sender' | 'recipient', field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleSubmit = () => {
    if (validation.isValid) {
      // Save data for future use
      localStorage.setItem('postgrid_sender_data', JSON.stringify(formData.sender));
      localStorage.setItem('postgrid_recipient_data', JSON.stringify(formData.recipient));
      
      onValidated(formData);
      onClose();
    }
  };

  // Load saved data on mount
  useEffect(() => {
    const savedSender = localStorage.getItem('postgrid_sender_data');
    const savedRecipient = localStorage.getItem('postgrid_recipient_data');
    
    if (savedSender || savedRecipient) {
      setFormData(prev => ({
        sender: savedSender ? JSON.parse(savedSender) : prev.sender,
        recipient: savedRecipient ? JSON.parse(savedRecipient) : prev.recipient
      }));
    }
  }, []);

  const renderFieldErrors = (fields: string[], title: string) => {
    if (fields.length === 0) return null;
    
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>{title}:</strong> {fields.map(field => field.replace('_', ' ')).join(', ')}
        </AlertDescription>
      </Alert>
    );
  };

  const renderFormSection = (section: 'sender' | 'recipient', title: string) => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      
      <div className="space-y-3">
        <div>
          <Label htmlFor={`${section}-name`}>Full Name *</Label>
          <Input
            id={`${section}-name`}
            value={formData[section].name}
            onChange={(e) => handleInputChange(section, 'name', e.target.value)}
            placeholder="Enter full name"
            className={validation[section === 'sender' ? 'missingSenderFields' : 'missingRecipientFields'].includes('name') ? 'border-destructive' : ''}
          />
        </div>

        <div>
          <Label htmlFor={`${section}-address`}>Address Line 1 *</Label>
          <Input
            id={`${section}-address`}
            value={formData[section].address_line1}
            onChange={(e) => handleInputChange(section, 'address_line1', e.target.value)}
            placeholder="Enter street address"
            className={validation[section === 'sender' ? 'missingSenderFields' : 'missingRecipientFields'].includes('address_line1') ? 'border-destructive' : ''}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`${section}-city`}>City *</Label>
            <Input
              id={`${section}-city`}
              value={formData[section].city}
              onChange={(e) => handleInputChange(section, 'city', e.target.value)}
              placeholder="City"
              className={validation[section === 'sender' ? 'missingSenderFields' : 'missingRecipientFields'].includes('city') ? 'border-destructive' : ''}
            />
          </div>
          <div>
            <Label htmlFor={`${section}-state`}>State *</Label>
            <Input
              id={`${section}-state`}
              value={formData[section].state}
              onChange={(e) => handleInputChange(section, 'state', e.target.value)}
              placeholder="State"
              maxLength={2}
              className={validation[section === 'sender' ? 'missingSenderFields' : 'missingRecipientFields'].includes('state') ? 'border-destructive' : ''}
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`${section}-zip`}>ZIP Code *</Label>
          <Input
            id={`${section}-zip`}
            value={formData[section].postal_code}
            onChange={(e) => handleInputChange(section, 'postal_code', e.target.value)}
            placeholder="ZIP Code"
            className={validation[section === 'sender' ? 'missingSenderFields' : 'missingRecipientFields'].includes('postal_code') ? 'border-destructive' : ''}
          />
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Address Information</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {letterCount === 1 ? 'This letter requires' : `These ${letterCount} letters require`} complete sender and recipient address information before sending via PostGrid.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {renderFieldErrors(validation.missingSenderFields, 'Missing Sender Information')}
          {renderFieldErrors(validation.missingRecipientFields, 'Missing Recipient Information')}

          {renderFormSection('sender', 'Sender Information (Your Details)')}
          
          <Separator />
          
          {renderFormSection('recipient', 'Recipient Information (Bureau/Creditor)')}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!validation.isValid}
            >
              {validation.isValid ? 'Send Letter(s)' : 'Complete Required Fields'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PostGridValidationModal;