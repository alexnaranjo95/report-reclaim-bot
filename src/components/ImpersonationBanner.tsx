import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface ImpersonationBannerProps {
  userName: string;
  onRevert: () => void;
}

export const ImpersonationBanner = ({ userName, onRevert }: ImpersonationBannerProps) => {
  return (
    <div className="bg-yellow-100 text-yellow-800 text-xs px-3 py-1 flex items-center justify-between border-b border-yellow-200">
      <span className="font-medium">
        Impersonating {userName} — viewing as this user
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRevert}
        className="h-6 px-2 text-xs hover:bg-yellow-200 flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" />
        Return to Admin
      </Button>
    </div>
  );
};