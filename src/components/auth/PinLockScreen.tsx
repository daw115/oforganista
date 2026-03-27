import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';

export interface UserProfile {
  name: string;
  color: string;
}

const PROFILES: UserProfile[] = [
  { name: 'Dawid', color: 'green' },
  { name: 'Michał', color: 'yellow' },
];

const COLOR_MAP: Record<string, string> = {
  green: 'bg-emerald-500 hover:bg-emerald-600',
  yellow: 'bg-amber-500 hover:bg-amber-600',
};

interface ProfilePickerProps {
  onUnlock: (profileName: string) => void;
}

export function PinLockScreen({ onUnlock }: ProfilePickerProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full">
        <User className="w-10 h-10 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Wybierz profil</h1>
        <div className="flex gap-4 w-full">
          {PROFILES.map(p => (
            <Button
              key={p.name}
              className={`flex-1 h-20 text-lg font-bold text-white ${COLOR_MAP[p.color] || 'bg-primary hover:bg-primary/90'}`}
              onClick={() => onUnlock(p.name)}
            >
              {p.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export { PROFILES };
