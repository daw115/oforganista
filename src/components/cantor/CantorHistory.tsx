import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History } from 'lucide-react';
import type { CantorSelection } from '@/hooks/useCantors';

interface Props {
  history: CantorSelection[];
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending: { label: 'Oczekuje', variant: 'default' },
  confirmed: { label: 'Potwierdzone', variant: 'secondary' },
  seen: { label: 'Odczytane', variant: 'outline' },
};

export function CantorHistory({ history }: Props) {
  if (history.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Historia wyborów
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">Brak wysłanych wyborów</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4" /> Historia wyborów ({history.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {history.map(sel => {
          const cfg = statusConfig[sel.status] ?? { label: sel.status, variant: 'outline' as const };
          return (
            <div
              key={sel.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">
                    {sel.melody_name ?? 'Melodia nieznana'}
                    {(sel.melody_key || sel.custom_key) && (
                      <span className="text-muted-foreground ml-1">({sel.melody_key || sel.custom_key})</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>📅 {sel.mass_date}</span>
                  {sel.mass_time && <span>⏰ {sel.mass_time}</span>}
                  {sel.psalm_title && <span className="truncate">🎵 {sel.psalm_title}</span>}
                </div>
              </div>
              <Badge variant={cfg.variant} className="shrink-0 text-xs">
                {cfg.label}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
