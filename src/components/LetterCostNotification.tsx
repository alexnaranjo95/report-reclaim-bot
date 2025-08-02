import { AlertTriangle, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface LetterCostNotificationProps {
  onConfirm: () => void;
  onCancel: () => void;
  letterCount?: number;
}

export function LetterCostNotification({ 
  onConfirm, 
  onCancel, 
  letterCount = 1 
}: LetterCostNotificationProps) {
  const costPerLetter = 2.94;
  const totalCost = (costPerLetter * letterCount).toFixed(2);

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="font-semibold text-amber-800 dark:text-amber-200">
            Letter Delivery Cost Notice
          </span>
        </div>
        
        <div className="text-sm text-amber-700 dark:text-amber-300">
          <p className="mb-2">
            You are about to send <strong>{letterCount}</strong> dispute letter{letterCount > 1 ? 's' : ''} 
            via postal mail through our printing and mailing service.
          </p>
          
          <div className="bg-white dark:bg-gray-800 rounded-md p-3 border border-amber-200 dark:border-amber-700">
            <div className="flex justify-between items-center">
              <span>Cost per letter:</span>
              <span className="font-mono">${costPerLetter.toFixed(2)}</span>
            </div>
            {letterCount > 1 && (
              <div className="flex justify-between items-center">
                <span>Letters to send:</span>
                <span className="font-mono">{letterCount}</span>
              </div>
            )}
            <hr className="my-2 border-amber-200 dark:border-amber-700" />
            <div className="flex justify-between items-center font-semibold">
              <span>Total cost:</span>
              <span className="font-mono text-lg">${totalCost}</span>
            </div>
          </div>
          
          <p className="mt-2 text-xs">
            This includes printing, postage, and handling. Letters are typically delivered within 3-5 business days.
          </p>
        </div>
        
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel} size="sm">
            Cancel
          </Button>
          <Button onClick={onConfirm} size="sm" className="bg-green-600 hover:bg-green-700">
            Confirm & Send (${totalCost})
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}