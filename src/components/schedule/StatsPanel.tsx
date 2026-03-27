import { getOrganistColor } from '@/lib/colors';

interface StatsPanelProps {
  organists: string[];
  stats: Record<string, number>;
}

export function StatsPanel({ organists, stats }: StatsPanelProps) {
  return (
    <div className="flex flex-wrap gap-2 px-5 py-3">
      {organists.map(name => {
        const c = getOrganistColor(name);
        return (
          <span
            key={name}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: c.chip, color: c.text }}
          >
            {name}: {stats[name] || 0} mszy
          </span>
        );
      })}
    </div>
  );
}
