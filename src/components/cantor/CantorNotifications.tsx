import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, CheckCheck, Bell } from 'lucide-react';
import type { CantorSelection } from '@/hooks/useCantors';

interface Props {
  selections: CantorSelection[];
  pendingCount: number;
  onLoad: () => void;
  onMarkSeen: (id: string) => void;
  onMarkAllSeen: () => void;
}

export function CantorNotifications({ selections, pendingCount, onLoad, onMarkSeen, onMarkAllSeen }: Props) {
  useEffect(() => { onLoad(); }, []);

  const pending = selections.filter(s => s.status === 'pending' || s.status === 'confirmed');
  const seen = selections.filter(s => s.status === 'seen');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Wybory kantorów
          {pendingCount > 0 && (
            <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </CardTitle>
        {pending.length > 0 && (
          <Button size="sm" variant="outline" onClick={onMarkAllSeen}>
            <CheckCheck className="w-4 h-4 mr-1" /> Oznacz wszystkie
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {selections.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Brak wyborów kantorów</p>
        )}

        {pending.map(s => (
          <div key={s.id} className="flex items-start gap-3 p-3 border border-primary/30 bg-primary/5 rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm">{s.cantor_name}</span>
                <span className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded">nowe</span>
              </div>
              <div className="text-sm">
                <span className="font-medium">{s.melody_name ?? s.custom_melody ?? '—'}</span>
                {(s.melody_key ?? s.custom_key) && (
                  <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {s.melody_key ?? s.custom_key}
                  </span>
                )}
              </div>
              {s.psalm_title && <div className="text-xs text-muted-foreground mt-0.5">Psalm: {s.psalm_title}</div>}
              <div className="text-xs text-muted-foreground mt-1">
                📅 {s.mass_date} {s.mass_time ? `⏰ ${s.mass_time}` : ''}
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => onMarkSeen(s.id)} title="Oznacz jako widziane">
              <Check className="w-4 h-4" />
            </Button>
          </div>
        ))}

        {seen.length > 0 && pending.length > 0 && (
          <div className="border-t border-border pt-2 mt-3">
            <p className="text-xs text-muted-foreground mb-2">Wcześniejsze wybory</p>
          </div>
        )}

        {seen.slice(0, 10).map(s => (
          <div key={s.id} className="flex items-start gap-3 p-3 border border-border rounded-lg opacity-60">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{s.cantor_name}</div>
              <div className="text-sm">
                {s.melody_name ?? s.custom_melody ?? '—'}
                {(s.melody_key ?? s.custom_key) && (
                  <span className="ml-2 text-xs text-muted-foreground">({s.melody_key ?? s.custom_key})</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                📅 {s.mass_date} {s.mass_time ?? ''}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
