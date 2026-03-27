import { useMemo } from 'react';
import { getOrganistColor } from '@/lib/colors';
import { toYMD, addDays, formatShort } from '@/lib/dateUtils';

interface ScheduleTableProps {
  organists: string[];
  dates: string[];
  sched: { date: string; organist: string; time: string }[];
  groupByDate: (date: string) => Record<string, string[]>;
}

export function ScheduleTable({ organists, dates, sched, groupByDate }: ScheduleTableProps) {
  const today = new Date();
  const todayStr = toYMD(today);
  const tomorrowStr = toYMD(addDays(today, 1));

  return (
    <div className="border-t border-border/50 divide-y divide-border/30">
      {dates.map(date => {
        const d = new Date(date + 'T12:00:00');
        const isSun = d.getDay() === 0;
        const isToday = date === todayStr;
        const isTomorrow = date === tomorrowStr;
        const g = groupByDate(date);

        // Sort organists by earliest time for this date
        const sorted = [...organists]
          .map(name => ({ name, times: g[name] || [] }))
          .filter(o => o.times.length > 0)
          .sort((a, b) => a.times[0].localeCompare(b.times[0]));

        let rowClass = '';
        if (isToday) rowClass = 'bg-primary/10';
        else if (isTomorrow) rowClass = 'bg-amber/5';
        else if (isSun) rowClass = 'bg-destructive/5';

        return (
          <div key={date} className={`flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors ${rowClass}`}>
            <div className="flex items-center gap-2 min-w-[140px] shrink-0">
              {isToday && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
              <span className={`text-sm ${isSun ? 'font-extrabold text-destructive' : 'font-medium'}`}>
                {formatShort(d)}
              </span>
              {isToday && (
                <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-md font-bold">
                  DZIŚ
                </span>
              )}
              {isTomorrow && (
                <span className="text-[10px] bg-amber text-amber-foreground px-1.5 py-0.5 rounded-md font-bold">
                  JUTRO
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              {sorted.map(({ name, times }) => {
                const c = getOrganistColor(name);
                return (
                  <div key={name} className="flex items-center gap-1.5">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ background: c.dot }}
                    >
                      {name[0]}
                    </div>
                    <span className="font-bold text-xs">{name}</span>
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
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
