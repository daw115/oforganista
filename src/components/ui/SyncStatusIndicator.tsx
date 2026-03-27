import { useState, useEffect } from 'react';
import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export type SyncStatus = 'checking' | 'synced' | 'offline';

interface SyncStatusIndicatorProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

/** Check if we can reach the database */
async function checkConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('app_settings' as any)
      .select('key')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    checkConnection().then(ok => {
      if (!cancelled) setStatus(ok ? 'synced' : 'offline');
    });
    return () => { cancelled = true; };
  }, []);

  return status;
}

export function SyncStatusIndicator({ className, showLabel = true, size = 'sm' }: SyncStatusIndicatorProps) {
  const status = useSyncStatus();

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className={cn('flex items-center gap-1.5', textSize, 'text-muted-foreground', className)}>
      {status === 'checking' ? (
        <>
          <Loader2 className={cn(iconSize, 'animate-spin')} />
          {showLabel && <span>Sprawdzanie...</span>}
        </>
      ) : status === 'synced' ? (
        <>
          <Cloud className={cn(iconSize, 'text-primary')} />
          {showLabel && <span className="text-primary">Zsynchronizowano</span>}
        </>
      ) : (
        <>
          <CloudOff className={iconSize} />
          {showLabel && <span>Tryb offline</span>}
        </>
      )}
    </div>
  );
}
