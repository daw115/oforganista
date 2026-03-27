import { getOrganistColor } from '@/lib/colors';
import { formatPL } from '@/lib/dateUtils';

interface TodayCardProps {
  title: string;
  emoji: string;
  dateStr: string;
  dates: string[];
  organists: string[];
  group: Record<string, string[]>;
  accentClass: string;
}

export function TodayCard({ title, emoji, dateStr, dates, organists, group, accentClass }: TodayCardProps) {
  const inRange = dates.includes(dateStr);

  return (
    <div className={`glass-card overflow-hidden border-l-4 ${accentClass}`}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
        <span className="text-base">{emoji}</span>
        <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground capitalize ml-auto">
          {formatPL(new Date(dateStr + 'T12:00:00'))}
        </p>
      </div>
      <div className="px-4 py-1.5">
        {!inRange ? (
          <div className="text-center py-2 text-muted-foreground text-xs">
            <p className="italic">Poza zakresem grafiku</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {[...organists].sort((a, b) => {
              const ta = (group[a] || [])[0] || 'ZZ';
              const tb = (group[b] || [])[0] || 'ZZ';
              return ta.localeCompare(tb);
            }).map(name => {
              const times = group[name] || [];
              const c = getOrganistColor(name);
              return (
                <div key={name} className="flex items-center gap-2 py-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: c.dot }}
                  >
                    {name[0]}
                  </div>
                  <span className="font-bold text-xs">{name}</span>
                  {times.length > 0 ? (
                    <div className="flex gap-1">
                      {times.map((t, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono"
                          style={{ background: c.chip, color: c.text }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">— wolne —</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
