import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface VerificationDocument {
  id: string;
  name: string;
  type: string;
  url: string;
  uploadedAt: string;
  documentType: string;
}

export const DocumentNotificationBanner = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [verificationDocuments, setVerificationDocuments] = useState<VerificationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  const requiredDocTypes = ['Photo ID', 'Proof of SSN', 'Proof of Address'];

  useEffect(() => {
    const checkDocuments = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase.rpc('get_user_profile', { 
          profile_user_id: user.id 
        }) as { data: any, error: any };

        if (data && data.length > 0) {
          const docs = data[0].verification_documents || [];
          setVerificationDocuments(docs);
          
          // Check if all required document types are uploaded
          const uploadedTypes = docs.map((doc: VerificationDocument) => doc.documentType);
          const missingTypes = requiredDocTypes.filter(type => !uploadedTypes.includes(type));
          
          // Show banner if documents are missing and not dismissed
          const dismissed = localStorage.getItem('documents-banner-dismissed');
          setIsVisible(missingTypes.length > 0 && !dismissed);
        }
      } catch (error) {
        console.error('Error checking documents:', error);
      } finally {
        setLoading(false);
      }
    };

    checkDocuments();
  }, [user]);

  const getUploadedTypes = () => {
    return verificationDocuments.map(doc => doc.documentType);
  };

  const getMissingTypes = () => {
    const uploadedTypes = getUploadedTypes();
    return requiredDocTypes.filter(type => !uploadedTypes.includes(type));
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    localStorage.setItem('documents-banner-dismissed', 'true');
  };

  const handleUploadClick = () => {
    navigate('/settings');
  };

  if (loading || !isVisible || isDismissed) return null;

  const missingTypes = getMissingTypes();
  const uploadedTypes = getUploadedTypes();

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 mb-6">
      <div className="flex items-start justify-between w-full">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <div className="space-y-3">
                <div>
                  <strong>Verification Documents Required</strong>
                  <p className="text-sm mt-1">
                    You must upload all required identification documents before creating dispute letters. 
                    This ensures compliance with credit bureau requirements.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Document Status:</p>
                  <div className="flex flex-wrap gap-2">
                    {requiredDocTypes.map(type => {
                      const isUploaded = uploadedTypes.includes(type);
                      return (
                        <Badge 
                          key={type}
                          variant={isUploaded ? "default" : "secondary"}
                          className={isUploaded ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"}
                        >
                          {isUploaded ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <X className="h-3 w-3 mr-1" />
                          )}
                          {type}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                
                {missingTypes.length > 0 && (
                  <div className="flex gap-2 pt-2">
                    <Button 
                      onClick={handleUploadClick}
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Documents
                    </Button>
                  </div>
                )}
              </div>
            </AlertDescription>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-8 w-8 p-0 text-amber-600 hover:text-amber-800"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </Alert>
  );
};