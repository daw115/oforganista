import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { loadLiturgy } from '@/lib/liturgyCache';
import type { ReadingsData } from '@/lib/liturgyParsers';
import type { PlaylistItem, Song } from '@/types/projector';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PsalmPanelProps {
  playlist: PlaylistItem[];
  songs: Song[];
}

interface PsalmEntry {
  itemId: string;
  title: string;
  litDate?: string;
  html: string | null;
  loading: boolean;
  error: string;
}

/** Find ALL playlist items marked as psalm */
function findPsalmItems(playlist: PlaylistItem[], songs: Song[]): PlaylistItem[] {
  const marked = playlist.filter(item => item.isPsalm);
  if (marked.length > 0) return marked;

  // Fallback: keyword match
  const keywords = ['psalm', 'refren'];
  const found = playlist.filter(item => {
    const song = songs.find(s => s.id === item.songId);
    const title = (song?.title || item.title).toLowerCase();
    return keywords.some(kw => title.includes(kw));
  });
  return found;
}

/** Extract psalm + acclamation HTML sections from readings */
function extractPsalmHtml(readings: ReadingsData): string | null {
  if (!readings?.options?.length) return null;
  const html = readings.options[0]?.contentHtml || '';
  if (!html) return null;

  const div = document.createElement('div');
  div.innerHTML = html;

  const sectionTitles = Array.from(div.querySelectorAll('.readings-section-title'));
  const parts: string[] = [];

  for (const titleEl of sectionTitles) {
    const titleText = (titleEl.textContent || '').toUpperCase();

    if (titleText.includes('PSALM') || titleText.includes('AKLAMACJA') || titleText.includes('ŚPIEW PRZED')) {
      // Collect this section's HTML
      const sectionHtml: string[] = [];
      sectionHtml.push(titleEl.outerHTML);

      let el = titleEl.nextElementSibling;
      while (el && !el.classList?.contains('readings-section-title')) {
        sectionHtml.push(el.outerHTML);
        el = el.nextElementSibling;
      }
      parts.push(sectionHtml.join(''));
    }
  }

  return parts.length > 0 ? parts.join('<hr class="my-3 border-border"/>') : null;
}

export function PsalmPanel({ playlist, songs }: PsalmPanelProps) {
  const [entries, setEntries] = useState<Map<string, PsalmEntry>>(new Map());
  const loadedRef = useRef<Set<string>>(new Set());

  const psalmItems = findPsalmItems(playlist, songs);

  // Load data for each psalm item
  useEffect(() => {
    for (const item of psalmItems) {
      const cacheKey = `${item.id}__${item.litDate || 'today'}`;
      if (loadedRef.current.has(cacheKey)) continue;
      loadedRef.current.add(cacheKey);

      setEntries(prev => {
        const next = new Map(prev);
        next.set(item.id, { itemId: item.id, title: item.title, litDate: item.litDate, html: null, loading: true, error: '' });
        return next;
      });

      const dateStr = item.litDate;
      const date = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();

      loadLiturgy(date, 'readings')
        .then(result => {
          const html = extractPsalmHtml(result.data as ReadingsData);
          setEntries(prev => {
            const next = new Map(prev);
            next.set(item.id, { itemId: item.id, title: item.title, litDate: item.litDate, html, loading: false, error: '' });
            return next;
          });
        })
        .catch((e: any) => {
          setEntries(prev => {
            const next = new Map(prev);
            next.set(item.id, { itemId: item.id, title: item.title, litDate: item.litDate, html: null, loading: false, error: e.message || 'Błąd' });
            return next;
          });
        });
    }

    // Clean up removed items
    setEntries(prev => {
      const activeIds = new Set(psalmItems.map(p => p.id));
      let changed = false;
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (!activeIds.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      // Also clean loadedRef
      for (const key of loadedRef.current) {
        const id = key.split('__')[0];
        if (!activeIds.has(id)) loadedRef.current.delete(key);
      }
      return changed ? next : prev;
    });
  }, [psalmItems.map(p => `${p.id}|${p.litDate}`).join(',')]);

  if (psalmItems.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card h-full flex items-center justify-center p-4">
        <div className="text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Dodaj psalm do listy</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Tekst psalmu pojawi się tutaj</p>
        </div>
      </div>
    );
  }

  const entryList = psalmItems.map(p => entries.get(p.id)).filter(Boolean) as PsalmEntry[];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="px-3 py-2 max-w-full overflow-x-hidden">
          {entryList.map((entry, idx) => (
            <div key={entry.itemId}>
              {entry.litDate && psalmItems.length > 1 && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  {entry.litDate}
                </p>
              )}
              {entry.loading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {entry.error && (
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">{entry.error}</p>
                  <button
                    onClick={() => {
                      loadedRef.current.delete(`${entry.itemId}__${entry.litDate || 'today'}`);
                      setEntries(prev => {
                        const next = new Map(prev);
                        next.delete(entry.itemId);
                        return next;
                      });
                    }}
                    className="mt-1 flex items-center gap-1 mx-auto text-xs text-primary hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" /> Ponów
                  </button>
                </div>
              )}
              {!entry.loading && !entry.error && entry.html && (
                <div
                  className="liturgy-content prose prose-sm max-w-none dark:prose-invert text-foreground leading-relaxed
                    [&_.readings-section-title]:text-[11px] [&_.readings-section-title]:font-bold [&_.readings-section-title]:uppercase
                    [&_.readings-section-title]:tracking-wider [&_.readings-section-title]:text-primary [&_.readings-section-title]:mb-1
                    [&_.readings-section-subtitle]:text-[10px] [&_.readings-section-subtitle]:text-muted-foreground [&_.readings-section-subtitle]:mb-1
                    [&_p]:text-[13px] [&_p]:leading-relaxed [&_p]:mb-2
                    [&_p]:break-words [&_p]:overflow-wrap-anywhere
                    [&_.psalm-refrain]:text-sm [&_.psalm-refrain]:font-bold [&_.psalm-refrain]:text-primary
                    [&_hr]:my-4"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html) }}
                />
              )}
              {!entry.loading && !entry.error && !entry.html && (
                <p className="text-xs text-muted-foreground text-center py-2">Brak danych psalmu</p>
              )}
              {idx < entryList.length - 1 && (
                <hr className="my-3 border-border" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
