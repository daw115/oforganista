import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Play, CalendarIcon, User, Music, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface HarmonogramRow {
  id: string;
  created_at: string;
  mass_date: string;
  organist: string;
  playlist: { title: string; songId?: string }[];
  liturgical_day: string | null;
  notes: string | null;
}

interface HarmonogramsPanelProps {
  onLoad?: (playlist: { title: string; songId?: string }[], organist: string) => void;
}

export function HarmonogramsPanel({ onLoad }: HarmonogramsPanelProps) {
  const [harmonograms, setHarmonograms] = useState<HarmonogramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchHarmonograms = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('harmonograms')
        .select('*')
        .order('mass_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setHarmonograms((data || []).map(d => ({
        ...d,
        playlist: Array.isArray(d.playlist) ? d.playlist as any : [],
      })));
    } catch (e) {
      console.warn('Błąd pobierania harmonogramów:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHarmonograms(); }, [fetchHarmonograms]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await supabase.from('harmonograms').delete().eq('id', id);
      setHarmonograms(prev => prev.filter(h => h.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      console.warn('Błąd usuwania:', e);
    }
  }, [selectedId]);

  const selected = harmonograms.find(h => h.id === selectedId);

  // Group by date
  const grouped = harmonograms.reduce<Record<string, HarmonogramRow[]>>((acc, h) => {
    const key = h.mass_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-[calc(100vh-6rem)]">
      {/* Left: List */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Harmonogramy</h2>
          <span className="text-xs text-muted-foreground">{harmonograms.length} zapisanych</span>
        </div>
        <div className="flex-1 overflow-auto space-y-1 pr-1">
          {harmonograms.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Brak zapisanych harmonogramów</p>
          ) : (
            sortedDates.map(dateKey => (
              <div key={dateKey}>
                <div className="sticky top-0 bg-background/95 backdrop-blur-sm px-2 py-1 z-10">
                  <span className="text-xs font-bold text-muted-foreground">
                    {(() => {
                      try {
                        return format(new Date(dateKey + 'T12:00:00'), 'EEEE, d MMMM yyyy', { locale: pl });
                      } catch { return dateKey; }
                    })()}
                  </span>
                </div>
                {grouped[dateKey].map(h => (
                  <div
                    key={h.id}
                    onClick={() => setSelectedId(h.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      selectedId === h.id
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-sm font-bold text-foreground">{h.organist}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {h.playlist.length} pieśni
                        </span>
                      </div>
                      {h.liturgical_day && (
                        <p className="text-[11px] text-primary font-medium truncate mt-0.5">{h.liturgical_day}</p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Preview */}
      <div className="flex flex-col min-h-0">
        {selected ? (
          <Card className="flex-1 flex flex-col min-h-0">
            <CardContent className="p-4 flex flex-col min-h-0 flex-1">
              {/* Header */}
              <div className="space-y-1.5 mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">
                    {(() => {
                      try {
                        return format(new Date(selected.mass_date + 'T12:00:00'), 'EEEE, d MMMM yyyy', { locale: pl });
                      } catch { return selected.mass_date; }
                    })()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">{selected.organist}</span>
                </div>
                {selected.liturgical_day && (
                  <p className="text-xs font-bold text-primary">{selected.liturgical_day}</p>
                )}
              </div>

              {/* Song list */}
              <div className="flex-1 overflow-auto border-t border-border pt-3">
                <h4 className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Music className="w-3 h-3" /> Pieśni ({selected.playlist.length})
                </h4>
                <div className="space-y-1">
                  {selected.playlist.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30">
                      <span className="text-[10px] font-mono text-muted-foreground w-4 text-center shrink-0">{i + 1}</span>
                      <span className="text-sm text-foreground truncate">{item.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-border shrink-0">
                {onLoad && (
                  <Button
                    onClick={() => onLoad(selected.playlist, selected.organist)}
                    className="flex-1 gap-1.5"
                  >
                    <Play className="w-4 h-4" /> Wczytaj
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleDelete(selected.id)}
                  title="Usuń"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Wybierz harmonogram z listy</p>
          </div>
        )}
      </div>
    </div>
  );
}
