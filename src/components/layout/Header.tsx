import { RefreshCw, ClipboardPaste, Trash2, HelpCircle } from 'lucide-react';
import { formatPL } from '@/lib/dateUtils';
import { Button } from '@/components/ui/button';
import { SyncStatusIndicator } from '@/components/ui/SyncStatusIndicator';

interface HeaderProps {
  onRefresh: () => void;
  onPaste: () => void;
  onClear: () => void;
  onHelp: () => void;
  loading: boolean;
  hasData: boolean;
}

export function Header({ onRefresh, onPaste, onClear, onHelp, loading, hasData }: HeaderProps) {
  const today = new Date();

  return (
    <header className="gradient-header rounded-xl px-6 py-4 mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-sm text-primary/70 capitalize">{formatPL(today)}</p>
        </div>
        <SyncStatusIndicator showLabel={false} size="sm" />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <Button
          onClick={onRefresh}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-emerald/50 text-emerald hover:bg-emerald/10 bg-transparent"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '...' : 'Odśwież'}
        </Button>
        <Button
          onClick={onPaste}
          variant="outline"
          size="sm"
          className="border-primary/50 text-primary hover:bg-primary/10 bg-transparent"
        >
          <ClipboardPaste className="w-4 h-4" />
          Wklej
        </Button>
        <Button
          onClick={onHelp}
          variant="outline"
          size="sm"
          className="border-muted-foreground/30 text-muted-foreground hover:bg-muted bg-transparent"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
        {hasData && (
          <Button
            onClick={() => { if (confirm('Usunąć cały grafik?')) onClear(); }}
            variant="outline"
            size="sm"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 bg-transparent"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
