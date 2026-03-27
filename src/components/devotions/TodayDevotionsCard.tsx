import { useMemo } from 'react';
import { type Devotion, type SongbookLink, isDevotionOnDate, estimateLiturgicalPeriod } from '@/hooks/useDevotions';
import { Church, BookOpen } from 'lucide-react';

interface Props {
  devotions: Devotion[];
  loading: boolean;
  currentLiturgicalPeriod?: string;
}

const SONGBOOK_URL = 'https://build-your-songbook.lovable.app';

function SongbookChips({ links }: { links: SongbookLink[] }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {links.map((link, i) => (
        <a
          key={i}
          href={`${SONGBOOK_URL}?page=${link.page}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/50 text-accent-foreground text-[11px] font-bold hover:bg-accent transition-colors"
        >
          <BookOpen className="w-3 h-3" />
          {link.label ? `${link.label} (str. ${link.page})` : `Śpiewnik str. ${link.page}`}
        </a>
      ))}
    </div>
  );
}

function DevotionList({ items }: { items: Devotion[] }) {
  return (
    <div className="space-y-2">
      {items.map(d => (
        <div key={d.id} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">
              {d.name}
              {d.start_time && (
                <span className="text-muted-foreground font-normal ml-1">({d.start_time})</span>
              )}
            </p>
            {d.description && (
              <p className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{d.description}</p>
            )}
            <SongbookChips links={d.songbook_links} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TodayDevotionsCard({ devotions, loading, currentLiturgicalPeriod }: Props) {
  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);

  const tomorrowPeriod = useMemo(() => estimateLiturgicalPeriod(tomorrow), [tomorrow]);

  const todayDevotions = useMemo(
    () => devotions.filter(d => isDevotionOnDate(d, today, currentLiturgicalPeriod)),
    [devotions, today, currentLiturgicalPeriod]
  );

  const tomorrowDevotions = useMemo(
    () => devotions.filter(d => isDevotionOnDate(d, tomorrow, tomorrowPeriod)),
    [devotions, tomorrow, tomorrowPeriod]
  );

  if (loading || (todayDevotions.length === 0 && tomorrowDevotions.length === 0)) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {todayDevotions.length > 0 && (
        <div className="glass-card border-l-4 border-l-amber overflow-hidden">
          <div className="px-4 py-3">
            <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
              <Church className="w-4 h-4 text-amber" />
              Dziś nabożeństwa ({todayDevotions.length})
            </h3>
            <DevotionList items={todayDevotions} />
          </div>
        </div>
      )}
      {tomorrowDevotions.length > 0 && (
        <div className="glass-card border-l-4 border-l-primary/60 overflow-hidden">
          <div className="px-4 py-3">
            <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
              <Church className="w-4 h-4 text-primary/60" />
              Jutro nabożeństwa ({tomorrowDevotions.length})
            </h3>
            <DevotionList items={tomorrowDevotions} />
          </div>
        </div>
      )}
    </div>
  );
}
