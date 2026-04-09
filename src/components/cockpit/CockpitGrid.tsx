/**
 * Cockpit Grid v3 — Responsive glass-morphism dashboard grid.
 *
 * Fully responsive layout that adapts beautifully to:
 * - Desktop (≥1024px): 12-column CSS Grid
 * - Tablet (768–1023px): 2-column layout
 * - Mobile (<768px): Single column with category tabs
 *
 * Features: glass cards, gradient accents, stagger animations,
 * drag-drop reorder, widget resize, mobile bottom bar.
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import {
  type CockpitLayout,
  type WidgetPlacement,
  getVisiblePlacements,
  saveLayout,
  getWidgetDef,
  WIDGET_REGISTRY,
  toggleWidget,
  reorderWidgets,
  resetLayout,
} from '@/lib/cockpitLayout';
import {
  GripVertical, X, Plus, Settings2, RotateCcw,
  ChevronUp, ChevronDown, Minimize2, Maximize2,
  ArrowLeftRight, ArrowUpDown,
  Tv, BookOpen, CalendarDays, Wrench, LayoutGrid,
  Home,
} from 'lucide-react';

// ─── Responsive Breakpoint Hook ───────────────────────────────────

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => {
    if (typeof window === 'undefined') return 'desktop';
    if (window.innerWidth < 768) return 'mobile';
    if (window.innerWidth < 1024) return 'tablet';
    return 'desktop';
  });

  useEffect(() => {
    let raf: number;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = window.innerWidth;
        setBp(w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');
      });
    };
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('resize', update); cancelAnimationFrame(raf); };
  }, []);

  return bp;
}

// ─── Category config ────────────────────────────────────────

const CATEGORIES = [
  { key: 'all', label: 'Wszystko', icon: LayoutGrid },
  { key: 'projector', label: 'Projektor', icon: Tv },
  { key: 'liturgy', label: 'Liturgia', icon: BookOpen },
  { key: 'schedule', label: 'Harmonogram', icon: CalendarDays },
  { key: 'tools', label: 'Narzędzia', icon: Wrench },
] as const;

const CATEGORY_GRADIENTS: Record<string, string> = {
  projector: 'from-blue-500/80 via-cyan-400/60 to-blue-600/80',
  liturgy: 'from-violet-500/80 via-purple-400/60 to-indigo-600/80',
  schedule: 'from-amber-500/80 via-yellow-400/60 to-orange-500/80',
  tools: 'from-emerald-500/80 via-green-400/60 to-teal-500/80',
};

const CATEGORY_COLORS: Record<string, string> = {
  projector: 'text-blue-400',
  liturgy: 'text-violet-400',
  schedule: 'text-amber-400',
  tools: 'text-emerald-400',
};

const CATEGORY_BG: Record<string, string> = {
  projector: 'bg-blue-500/10',
  liturgy: 'bg-violet-500/10',
  schedule: 'bg-amber-500/10',
  tools: 'bg-emerald-500/10',
};

const getWidthLabel = (colSpan: number) => {
  if (colSpan <= 3) return 'XS';
  if (colSpan <= 4) return 'S';
  if (colSpan <= 6) return 'M';
  if (colSpan <= 8) return 'L';
  return 'XL';
};

interface CockpitGridProps {
  layout: CockpitLayout;
  onLayoutChange: (layout: CockpitLayout) => void;
  renderWidget: (widgetId: string) => ReactNode;
}

export function CockpitGrid({ layout, onLayoutChange, renderWidget }: CockpitGridProps) {
  const bp = useBreakpoint();
  const [editMode, setEditMode] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [collapsedWidgets, setCollapsedWidgets] = useState<Set<string>>(new Set());
  const [mobileCategory, setMobileCategory] = useState<string>('all');
  const [mounted, setMounted] = useState(false);
  const dragItem = useRef<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const visible = getVisiblePlacements(layout);
  const hidden = layout.placements.filter(p => !p.visible);

  const filteredVisible = mobileCategory === 'all'
    ? visible
    : visible.filter(p => {
        const def = getWidgetDef(p.widgetId);
        return def?.category === mobileCategory;
      });

  const hiddenByCategory = WIDGET_REGISTRY
    .filter(w => hidden.some(h => h.widgetId === w.id))
    .reduce((acc, w) => {
      if (!acc[w.category]) acc[w.category] = [];
      acc[w.category].push(w);
      return acc;
    }, {} as Record<string, typeof WIDGET_REGISTRY>);

  const categoryLabels: Record<string, string> = {
    projector: 'Projektor', liturgy: 'Liturgia',
    schedule: 'Harmonogram', tools: 'Narzędzia',
  };

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    dragItem.current = widgetId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    dragItem.current = null;
    setDragOver(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(widgetId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = dragItem.current;
    if (sourceId && sourceId !== targetId) {
      const newLayout = reorderWidgets(layout, sourceId, targetId);
      onLayoutChange(newLayout);
      saveLayout(newLayout);
    }
    setDragOver(null);
    dragItem.current = null;
  }, [layout, onLayoutChange]);

  const handleMoveUp = useCallback((widgetId: string) => {
    const idx = visible.findIndex(p => p.widgetId === widgetId);
    if (idx > 0) {
      const newLayout = reorderWidgets(layout, widgetId, visible[idx - 1].widgetId);
      onLayoutChange(newLayout);
      saveLayout(newLayout);
    }
  }, [visible, layout, onLayoutChange]);

  const handleMoveDown = useCallback((widgetId: string) => {
    const idx = visible.findIndex(p => p.widgetId === widgetId);
    if (idx < visible.length - 1) {
      const newLayout = reorderWidgets(layout, widgetId, visible[idx + 1].widgetId);
      onLayoutChange(newLayout);
      saveLayout(newLayout);
    }
  }, [visible, layout, onLayoutChange]);

  const handleToggle = useCallback((widgetId: string) => {
    const newLayout = toggleWidget(layout, widgetId);
    onLayoutChange(newLayout);
    saveLayout(newLayout);
  }, [layout, onLayoutChange]);

  const toggleCollapse = useCallback((widgetId: string) => {
    setCollapsedWidgets(prev => {
      const next = new Set(prev);
      if (next.has(widgetId)) next.delete(widgetId);
      else next.add(widgetId);
      return next;
    });
  }, []);

  const COL_SIZES = [3, 4, 6, 8, 12];
  const ROW_SIZES = [1, 2, 3, 4, 5];

  const updateWidgetSize = useCallback((widgetId: string, updates: Partial<Pick<WidgetPlacement, 'colSpan' | 'rowSpan'>>) => {
    const newLayout = {
      ...layout,
      placements: layout.placements.map(p =>
        p.widgetId === widgetId ? { ...p, ...updates } : p
      ),
    };
    onLayoutChange(newLayout);
    saveLayout(newLayout);
  }, [layout, onLayoutChange]);

  const handleWidthChange = useCallback((widgetId: string, direction: 'grow' | 'shrink') => {
    const placement = layout.placements.find(p => p.widgetId === widgetId);
    if (!placement) return;
    const def = getWidgetDef(widgetId);
    const minSpan = def?.minColSpan || 3;
    const validSizes = COL_SIZES.filter(s => s >= minSpan);
    let currentIdx = validSizes.indexOf(placement.colSpan);
    if (currentIdx === -1) {
      const nearest = validSizes.reduce((prev, curr) =>
        Math.abs(curr - placement.colSpan) < Math.abs(prev - placement.colSpan) ? curr : prev
      );
      currentIdx = validSizes.indexOf(nearest);
    }
    const nextIdx = direction === 'grow'
      ? Math.min(currentIdx + 1, validSizes.length - 1)
      : Math.max(currentIdx - 1, 0);
    updateWidgetSize(widgetId, { colSpan: validSizes[nextIdx] });
  }, [layout, updateWidgetSize]);

  const handleHeightChange = useCallback((widgetId: string, direction: 'grow' | 'shrink') => {
    const placement = layout.placements.find(p => p.widgetId === widgetId);
    if (!placement) return;
    let currentIdx = ROW_SIZES.indexOf(placement.rowSpan);
    if (currentIdx === -1) {
      const nearest = ROW_SIZES.reduce((prev, curr) =>
        Math.abs(curr - placement.rowSpan) < Math.abs(prev - placement.rowSpan) ? curr : prev
      );
      currentIdx = ROW_SIZES.indexOf(nearest);
    }
    const nextIdx = direction === 'grow'
      ? Math.min(currentIdx + 1, ROW_SIZES.length - 1)
      : Math.max(currentIdx - 1, 0);
    updateWidgetSize(widgetId, { rowSpan: ROW_SIZES[nextIdx] });
  }, [layout, updateWidgetSize]);

  const gridStyle: React.CSSProperties = bp === 'mobile'
    ? { display: 'flex', flexDirection: 'column', gap: '12px' }
    : bp === 'tablet'
    ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', alignContent: 'start' }
    : { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: 'minmax(100px, auto)', gap: '12px', alignContent: 'start' };

  const getWidgetStyle = (placement: WidgetPlacement, isCollapsed: boolean): React.CSSProperties => {
    if (bp === 'mobile') return {};
    if (bp === 'tablet') {
      return {
        gridColumn: placement.colSpan > 6 ? 'span 2' : 'span 1',
        gridRow: isCollapsed ? 'span 1' : undefined,
      };
    }
    return {
      gridColumn: `span ${placement.colSpan}`,
      gridRow: isCollapsed ? 'span 1' : `span ${placement.rowSpan}`,
    };
  };

  return (
    <div className="flex flex-col h-full">
      {/* Glass Header */}
      <header className="cockpit-header relative z-30 shrink-0">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/30 flex items-center justify-center">
                <Home className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight">Cockpit</h1>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/30 border border-border/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-muted-foreground font-medium">
                {visible.length} widget{visible.length !== 1 ? 'ów' : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode && (
              <button onClick={() => { onLayoutChange(resetLayout()); }} className="cockpit-btn cockpit-btn-ghost">
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
            <button
              onClick={() => setEditMode(!editMode)}
              className={`cockpit-btn ${editMode ? 'cockpit-btn-primary' : 'cockpit-btn-ghost'}`}
            >
              <Settings2 className="w-4 h-4" />
              <span>{editMode ? 'Gotowe' : 'Edytuj'}</span>
            </button>
          </div>
        </div>

        {bp === 'mobile' && !editMode && (
          <div className="px-3 pb-3 -mt-1">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
              {CATEGORIES.map(cat => {
                const isActive = mobileCategory === cat.key;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setMobileCategory(cat.key)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 touch-manipulation active:scale-95 select-none ${isActive ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm shadow-primary/10' : 'bg-muted/20 text-muted-foreground border border-transparent hover:bg-muted/40'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {editMode && hidden.length > 0 && (
        <div className="px-4 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0 animate-fade-in">
          <p className="text-xs text-muted-foreground mb-2.5 font-medium">Dodaj widget:</p>
          <div className="space-y-3">
            {Object.entries(hiddenByCategory).map(([cat, widgets]) => (
              <div key={cat}>
                <p className={`text-[10px] uppercase tracking-wider mb-1.5 font-semibold ${CATEGORY_COLORS[cat] || 'text-muted-foreground/60'}`}>
                  {categoryLabels[cat] || cat}
                </p>
                <div className="flex flex-wrap gap-2">
                  {widgets.map(w => (
                    <button
                      key={w.id}
                      onClick={() => handleToggle(w.id)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-card/80 border border-border/60 backdrop-blur-sm hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 text-sm font-medium touch-manipulation active:scale-95 ${CATEGORY_BG[cat] || ''}`}
                    >
                      <Plus className="w-3.5 h-3.5 text-primary" />
                      <span>{w.icon}</span>
                      <span>{w.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Widget Grid */}
      <div className="flex-1 overflow-auto p-3 sm:p-4" style={gridStyle}>
        {filteredVisible.map((placement, index) => {
          const def = getWidgetDef(placement.widgetId);
          const isDragTarget = dragOver === placement.widgetId;
          const isCollapsed = collapsedWidgets.has(placement.widgetId);
          const category = def?.category || 'tools';
          const gradient = CATEGORY_GRADIENTS[category] || CATEGORY_GRADIENTS.tools;
          const catColor = CATEGORY_COLORS[category] || 'text-muted-foreground';

          return (
            <div
              key={placement.widgetId}
              draggable={editMode && bp !== 'mobile'}
              onDragStart={editMode ? (e) => handleDragStart(e, placement.widgetId) : undefined}
              onDragEnd={editMode ? handleDragEnd : undefined}
              onDragOver={editMode ? (e) => handleDragOver(e, placement.widgetId) : undefined}
              onDrop={editMode ? (e) => handleDrop(e, placement.widgetId) : undefined}
              style={{
                ...getWidgetStyle(placement, isCollapsed),
                animationDelay: mounted ? `${index * 60}ms` : '0ms',
              }}
              className={`cockpit-widget group ${mounted ? 'cockpit-widget-enter' : 'opacity-0'} ${editMode ? 'ring-1 ring-primary/20 shadow-lg shadow-primary/5' : ''} ${isDragTarget ? 'ring-2 ring-primary scale-[1.02] shadow-xl shadow-primary/10' : ''} ${isCollapsed ? 'max-h-[48px]' : ''}`}
            >
              <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${gradient} opacity-60 group-hover:opacity-100 transition-opacity duration-300`} />

              {editMode && (
                <div className="absolute inset-x-0 top-0 z-20 flex flex-col border-b border-border/50 bg-card/95 backdrop-blur-md rounded-t-2xl">
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground/60 cursor-grab active:cursor-grabbing" />
                      <span className={`text-xs font-semibold ${catColor}`}>{def?.icon}</span>
                      <span className="text-sm font-medium">{def?.label}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => handleMoveUp(placement.widgetId)} className="cockpit-edit-btn" title="W górę"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => handleMoveDown(placement.widgetId)} className="cockpit-edit-btn" title="W dół"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => handleToggle(placement.widgetId)} className="cockpit-edit-btn hover:!bg-destructive/20 hover:!text-destructive" title="Ukryj"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {bp === 'desktop' && (
                    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border/30 bg-muted/10">
                      <div className="flex items-center gap-1">
                        <ArrowLeftRight className="w-3 h-3 text-muted-foreground/50" />
                        <button onClick={() => handleWidthChange(placement.widgetId, 'shrink')} className="cockpit-resize-btn">−</button>
                        <span className="text-[11px] font-bold text-foreground/80 min-w-[24px] text-center">{getWidthLabel(placement.colSpan)}</span>
                        <button onClick={() => handleWidthChange(placement.widgetId, 'grow')} className="cockpit-resize-btn">+</button>
                      </div>
                      <div className="w-px h-3 bg-border/50" />
                      <div className="flex items-center gap-1">
                        <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />
                        <button onClick={() => handleHeightChange(placement.widgetId, 'shrink')} className="cockpit-resize-btn">−</button>
                        <span className="text-[11px] font-bold text-foreground/80 min-w-[14px] text-center">{placement.rowSpan}</span>
                        <button onClick={() => handleHeightChange(placement.widgetId, 'grow')} className="cockpit-resize-btn">+</button>
                      </div>
                      <span className="text-[10px] text-muted-foreground/40 ml-auto font-mono">{placement.colSpan}×{placement.rowSpan}</span>
                    </div>
                  )}
                </div>
              )}

              {!editMode && (
                <button
                  onClick={() => toggleCollapse(placement.widgetId)}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-left transition-colors touch-manipulation hover:bg-white/[0.02] active:bg-white/[0.04]"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm">{def?.icon}</span>
                    <span className={`text-xs font-bold uppercase tracking-wide ${catColor}`}>{def?.label}</span>
                  </span>
                  {isCollapsed ? <Maximize2 className="w-3.5 h-3.5 text-muted-foreground/40" /> : <Minimize2 className="w-3.5 h-3.5 text-muted-foreground/40" />}
                </button>
              )}

              {!isCollapsed && (
                <div className={`flex-1 overflow-auto ${editMode ? (bp === 'desktop' ? 'pt-[80px]' : 'pt-[44px]') : ''}`}>
                  {renderWidget(placement.widgetId)}
                </div>
              )}
            </div>
          );
        })}

        {filteredVisible.length === 0 && (
          <div className={`${bp !== 'mobile' ? 'col-span-full' : ''} flex flex-col items-center justify-center py-20 text-muted-foreground`}>
            <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mb-4">
              <Settings2 className="w-8 h-8 opacity-40" />
            </div>
            <p className="text-base font-semibold">Brak widgetów</p>
            <p className="text-sm mt-1.5 text-muted-foreground/60">
              {mobileCategory !== 'all' ? 'Brak widgetów w tej kategorii' : 'Kliknij „Edytuj” aby dodać widgety'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
