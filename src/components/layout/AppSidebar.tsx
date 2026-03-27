import { useState, useRef, useEffect } from 'react';
import { LayoutDashboard, Calendar, BookOpen, MonitorPlay, Settings, MoreVertical, RefreshCw, ClipboardPaste, HelpCircle, Trash2, Wifi, Globe, Music, Megaphone, Maximize, ChevronLeft, ChevronRight, Mic, Library, Church, BookOpenCheck, MoreHorizontal, X, Database, ListMusic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPL } from '@/lib/dateUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ModuleSettings } from '@/components/settings/SettingsPanel';

export type Section = 'dashboard' | 'all' | 'schedule' | 'liturgy' | 'announcements' | 'devotions' | 'projector' | 'projectorLAN' | 'projectorLANRemote' | 'songLibrary' | 'songEditor' | 'melodyLibrary' | 'songbook' | 'cantors' | 'harmonograms' | 'settings';
export type ViewMode = 'simple' | 'complex';

interface SidebarProps {
  active: Section;
  onNavigate: (section: Section) => void;
  onRefresh?: () => void;
  onPaste?: () => void;
  onHelp?: () => void;
  onClear?: () => void;
  loading?: boolean;
  hasData?: boolean;
  moduleSettings: ModuleSettings;
  remoteSlot?: React.ReactNode;
  onToggleFullscreen?: () => void;
  cantorBadge?: number;
}

export function AppSidebar({ active, onNavigate, onPaste, onHelp, onClear, onRefresh, loading, hasData, moduleSettings, remoteSlot, onToggleFullscreen, cantorBadge }: SidebarProps) {
  const today = new Date();
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems: { id: Section; label: string; shortLabel: string; icon: typeof Calendar; visible: boolean; pinMobile?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'APP', icon: LayoutDashboard, visible: true, pinMobile: true },
    { id: 'schedule', label: 'Harmonogram', shortLabel: 'Grafik', icon: Calendar, visible: true },
    { id: 'liturgy', label: 'Liturgia', shortLabel: 'Liturgia', icon: BookOpen, visible: true, pinMobile: true },
    { id: 'announcements', label: 'Ogłoszenia', shortLabel: 'Ogłosz.', icon: Megaphone, visible: true },
    { id: 'devotions', label: 'Nabożeństwa', shortLabel: 'Naboż.', icon: Church, visible: true },
    { id: 'projector', label: 'Rzutnik', shortLabel: 'Rzutnik', icon: MonitorPlay, visible: moduleSettings?.projectorEnabled ?? true, pinMobile: true },
    { id: 'projectorLAN', label: 'LAN Serwer', shortLabel: 'LAN', icon: Wifi, visible: moduleSettings?.projectorLANEnabled ?? false },
    { id: 'projectorLANRemote', label: 'LAN Pilot', shortLabel: 'Pilot', icon: Globe, visible: moduleSettings?.projectorLANRemoteEnabled ?? false },
    { id: 'songLibrary', label: 'Baza Pieśni', shortLabel: 'Pieśni', icon: Music, visible: true },
    { id: 'songEditor', label: 'Edytor Bazy', shortLabel: 'Edytor', icon: Database, visible: true },
    { id: 'melodyLibrary', label: 'Baza Melodii', shortLabel: 'Melodie', icon: Library, visible: true },
    { id: 'songbook', label: 'Śpiewnik', shortLabel: 'Śpiewnik', icon: BookOpenCheck, visible: true },
    { id: 'cantors', label: 'Kantorzy', shortLabel: 'Kantor', icon: Mic, visible: true },
    { id: 'harmonograms', label: 'Harmonogramy', shortLabel: 'Harm.', icon: ListMusic, visible: true },
    { id: 'settings', label: 'Ustawienia', shortLabel: 'Ustaw.', icon: Settings, visible: true },
  ];

  const visibleItems = navItems.filter(item => item.visible);

  // Mobile: pinned items + "More"
  const mobilePinned = visibleItems.filter(i => i.pinMobile);
  const mobileMore = visibleItems.filter(i => !i.pinMobile);

  // Check if active section is in "more" list — if so, show it as pinned temporarily
  const activeInMore = mobileMore.find(i => i.id === active);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el?.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  };

  // === MOBILE LAYOUT ===
  if (isMobile) {
    return (
      <>
        {/* Slim mobile header */}
        <header className="sticky top-0 z-30 w-full border-b border-border bg-card/95 backdrop-blur-md">
          <div className="flex items-center h-11 px-3 gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary shrink-0">
                <span className="text-xs">🎵</span>
              </div>
              <h1 className="text-sm font-bold text-foreground">Organista</h1>
            </div>
            <span className="text-[11px] text-muted-foreground capitalize ml-1">{formatPL(today)}</span>
            <div className="flex-1" />

            {remoteSlot && <div className="shrink-0">{remoteSlot}</div>}

            {/* Schedule context actions */}
            {active === 'schedule' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors touch-target">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onRefresh} disabled={loading}>
                    <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                    {loading ? 'Pobieranie...' : 'Odśwież'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onPaste}>
                    <ClipboardPaste className="w-4 h-4 mr-2" />
                    Wklej
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onHelp}>
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Pomoc
                  </DropdownMenuItem>
                  {hasData && (
                    <DropdownMenuItem
                      onClick={() => { if (confirm('Usunąć cały grafik?')) onClear?.(); }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Usuń grafik
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Bottom navigation bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/98 backdrop-blur-lg safe-area-bottom">
          <div className="flex items-stretch justify-around">
            {/* Pinned tabs */}
            {mobilePinned.map(item => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item.id); setMoreOpen(false); }}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-1 flex-1 min-h-[56px] transition-colors relative",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium mt-0.5 leading-tight">{item.shortLabel}</span>
                  {item.id === 'cantors' && cantorBadge != null && cantorBadge > 0 && (
                    <span className="absolute top-1.5 right-1/2 translate-x-3 bg-destructive text-destructive-foreground text-[9px] font-bold px-1 py-0.5 rounded-full leading-none min-w-[14px] text-center">{cantorBadge}</span>
                  )}
                </button>
              );
            })}

            {/* Active "more" item shown inline */}
            {activeInMore && (
              <button
                key={activeInMore.id}
                onClick={() => onNavigate(activeInMore.id)}
                className="flex flex-col items-center justify-center py-2 px-1 flex-1 min-h-[56px] text-primary relative"
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                <activeInMore.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium mt-0.5 leading-tight">{activeInMore.shortLabel}</span>
              </button>
            )}

            {/* More button */}
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                "flex flex-col items-center justify-center py-2 px-1 flex-1 min-h-[56px] transition-colors",
                moreOpen ? "text-primary" : "text-muted-foreground"
              )}
            >
              {moreOpen ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
              <span className="text-[10px] font-medium mt-0.5 leading-tight">Więcej</span>
            </button>
          </div>
        </nav>

        {/* "More" drawer */}
        {moreOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
            <div className="fixed bottom-[60px] left-0 right-0 z-35 bg-card border-t border-border rounded-t-2xl p-4 animate-fade-in safe-area-bottom" style={{ zIndex: 35 }}>
              <div className="grid grid-cols-4 gap-3">
                {mobileMore.map(item => {
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onNavigate(item.id); setMoreOpen(false); }}
                      className={cn(
                        "flex flex-col items-center justify-center py-3 px-1 rounded-xl transition-colors min-h-[64px]",
                        isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon className="w-5 h-5 mb-1" />
                      <span className="text-[11px] font-medium leading-tight text-center">{item.shortLabel}</span>
                      {item.id === 'cantors' && cantorBadge != null && cantorBadge > 0 && (
                        <span className="bg-destructive text-destructive-foreground text-[9px] font-bold px-1 py-0.5 rounded-full leading-none mt-0.5">{cantorBadge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // === DESKTOP LAYOUT — compact, no brand/date ===
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-card/95 backdrop-blur-md">
      {/* Tab bar only */}
      <div className="relative flex items-center">
        {canScrollLeft && (
          <button onClick={() => scroll('left')} className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-card to-transparent text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div
          ref={scrollRef}
          className="flex overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: 'none' }}
        >
          {visibleItems.map(item => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 shrink-0",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span>{item.shortLabel}</span>
                {item.id === 'cantors' && cantorBadge != null && cantorBadge > 0 && (
                  <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{cantorBadge}</span>
                )}
              </button>
            );
          })}
        </div>
        {canScrollRight && (
          <button onClick={() => scroll('right')} className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-card to-transparent text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
