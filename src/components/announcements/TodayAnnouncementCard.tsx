import { Megaphone } from 'lucide-react';
import { AnnouncementsData, DAY_LABELS } from '@/hooks/useAnnouncements';

interface TodayAnnouncementCardProps {
  data: AnnouncementsData | null;
  loading: boolean;
  error: string;
}

export function TodayAnnouncementCard({ data, loading, error }: TodayAnnouncementCardProps) {
  if (loading) {
    return (
      <div className="glass-card border-l-4 border-l-accent p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <Megaphone className="w-5 h-5 text-accent" />
          <span className="font-bold text-sm">Ogłoszenia parafialne</span>
        </div>
        <div className="h-4 bg-muted rounded w-3/4" />
      </div>
    );
  }

  if (error || !data) return null;

  const announcement = data.selectedAnnouncement;
  const dayKey = data.selectedDayKey;
  const dayLabel = dayKey ? DAY_LABELS[dayKey] || dayKey : 'Dziś';

  if (!announcement) return null;

  return (
    <div className="glass-card border-l-4 border-l-accent p-4">
      <div className="flex items-center gap-2 mb-2">
        <Megaphone className="w-5 h-5 text-accent" />
        <span className="font-bold text-sm">Ogłoszenia — {dayLabel}</span>
      </div>
      <div className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
        {announcement}
      </div>
      {data.sourceUrl && (
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline mt-2 inline-block"
        >
          Źródło →
        </a>
      )}
    </div>
  );
}
