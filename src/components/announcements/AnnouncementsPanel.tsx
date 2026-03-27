import { RefreshCw, Megaphone, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnnouncements, DAY_LABELS } from '@/hooks/useAnnouncements';

const DAY_ORDER = ['today', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'nextsun'];

export function AnnouncementsPanel() {
  const { data, loading, error, fetchAnnouncements } = useAnnouncements();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg md:text-xl font-extrabold flex items-center gap-2 truncate">
          <Megaphone className="w-5 h-5 text-accent shrink-0" />
          Ogłoszenia
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAnnouncements}
          disabled={loading}
          className="shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{loading ? 'Pobieranie...' : 'Odśwież'}</span>
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-5 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="glass-card p-4">
            <h3 className="text-sm font-bold text-muted-foreground mb-1">{data.title}</h3>
            {data.sourceUrl && (
              <a
                href={data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Otwórz na stronie parafii
              </a>
            )}
          </div>

          <div className="space-y-3">
            {DAY_ORDER.filter(key => data.sections[key]).map(key => {
              const isSelected = key === data.selectedDayKey;
              return (
                <div
                  key={key}
                  className={`glass-card p-4 border-l-4 transition-colors ${
                    isSelected ? 'border-l-primary bg-primary/5' : 'border-l-border'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                      {DAY_LABELS[key] || key}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-md font-bold">
                        DZIŚ
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                    {data.sections[key]}
                  </div>
                </div>
              );
            })}
          </div>

          {data.extraAnnouncements.length > 0 && (
            <div className="glass-card p-4 border-l-4 border-l-accent">
              <h3 className="text-sm font-bold text-accent mb-2">Dodatkowe ogłoszenia</h3>
              <div className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                {data.extraAnnouncements.join('\n')}
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="glass-card border-2 border-dashed border-border p-12 text-center">
          <div className="text-5xl mb-3">📢</div>
          <h3 className="text-lg font-bold mb-2">Brak ogłoszeń</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Kliknij Odśwież aby pobrać ogłoszenia ze strony parafii
          </p>
          <Button onClick={fetchAnnouncements}>
            <RefreshCw className="w-4 h-4" />
            Pobierz ogłoszenia
          </Button>
        </div>
      )}
    </div>
  );
}
