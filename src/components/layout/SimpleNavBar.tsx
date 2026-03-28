import { useState } from 'react';
import { LayoutDashboard, Calendar, Church, Megaphone, Mic, BookOpenCheck, Music, MonitorPlay, Settings, BookOpen, Library, Database, ListMusic, ChevronUp, ChevronDown, LayoutGrid } from 'lucide-react';
import type { Section } from '@/components/layout/AppSidebar';

interface SimpleNavBarProps {
  active: Section;
  onNavigate: (section: Section) => void;
  defaultCollapsed?: boolean;
}

const links: { icon: typeof LayoutDashboard; label: string; section: Section; colorClass: string }[] = [
  { icon: LayoutDashboard, label: 'APP', section: 'dashboard', colorClass: 'text-primary' },
  { icon: LayoutGrid, label: 'Cockpit', section: 'cockpit', colorClass: 'text-primary' },
  { icon: Calendar, label: 'Grafik', section: 'schedule', colorClass: 'text-primary' },
  { icon: BookOpenCheck, label: 'Liturgia', section: 'liturgy', colorClass: 'text-emerald' },
  { icon: Megaphone, label: 'Ogłosz.', section: 'announcements', colorClass: 'text-amber' },
  { icon: Church, label: 'Naboż.', section: 'devotions', colorClass: 'text-amber' },
  { icon: MonitorPlay, label: 'Rzutnik', section: 'projector', colorClass: 'text-primary' },
  { icon: Music, label: 'Pieśni', section: 'songLibrary', colorClass: 'text-primary' },
  { icon: Database, label: 'Edytor', section: 'songEditor', colorClass: 'text-primary' },
  { icon: Library, label: 'Melodie', section: 'melodyLibrary', colorClass: 'text-accent' },
  { icon: BookOpen, label: 'Śpiewnik', section: 'songbook', colorClass: 'text-emerald' },
  { icon: Mic, label: 'Kantorzy', section: 'cantors', colorClass: 'text-accent' },
  { icon: ListMusic, label: 'Harm.', section: 'harmonograms', colorClass: 'text-primary' },
  { icon: Settings, label: 'Ustaw.', section: 'settings', colorClass: 'text-muted-foreground' },
];

export function SimpleNavBar({ active, onNavigate, defaultCollapsed = false }: SimpleNavBarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="relative bg-card border-b border-border">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center justify-center py-1 hover:bg-muted/50 transition-colors"
          aria-label="Rozwiń nawigację"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      ) : (
        <>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5 p-2">
            {links.map(({ icon: Icon, label, section, colorClass }) => {
              const isActive = active === section;
              return (
                <button
                  key={section}
                  onClick={() => onNavigate(section)}
                  className={`flex flex-col items-center justify-center gap-1 p-1.5 rounded-lg transition-colors min-h-[48px] ${
                    isActive
                      ? 'bg-primary/15 ring-2 ring-primary/40'
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${colorClass}`} />
                  <span className="text-[9px] font-semibold text-muted-foreground leading-tight">{label}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="w-full flex items-center justify-center py-0.5 hover:bg-muted/50 transition-colors"
            aria-label="Zwiń nawigację"
          >
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          </button>
        </>
      )}
    </div>
  );
}
