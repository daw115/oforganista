/**
 * Cockpit Grid — drag & drop widget grid with touch support.
 *
 * Uses CSS Grid 12-column layout optimized for laptop touchscreens.
 * Widgets can be dragged to reorder, resized via handles,
 * and toggled via an edit mode overlay.
 *
 * Glass-morphism design with responsive breakpoints.
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
import { GripVertical, X, Plus, Settings2, RotateCcw, ChevronUp, ChevronDown, Minimize2, Maximize2, ArrowLeftRight, ArrowUpDown } from 'lucide-react';

/* ─── Responsive breakpoint hook ─────────────────────────────── */
function useBreakpoint() {
  const [bp, setBp] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setBp(w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return bp;
}

/* ─── Category colors ────────────────────────────────────────── */
const categoryColors: Record<string, string> = {
  projector: 'hsl(217 91% 60%)',
  liturgy: 'hsl(263 70% 60%)',
  schedule: 'hsl(45 93% 47%)',
  tools: 'hsl(160 84% 39%)',
};

interface CockpitGridProps {
  layout: CockpitLayout;
  onLayoutChange: (layout: CockpitLayout) => void;
  renderWidget: (widgetId: string) => ReactNode;
}

export function CockpitGrid({ layout, onLayoutChange, renderWidget }: CockpitGridProps) {
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isTablet = bp === 'tablet';

  const [editMode, setEditMode] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [collapsedWidgets, setCollapsedWidgets] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const dragItem = useRef<string | null>(null);

  const visible = getVisiblePlacements(layout);
  const hidden = layout.placements.filter(p => !p.visible);

  // Filter by category on mobile
  const filteredVisible = isMobile && activeCategory
    ? visible.filter(p => getWidgetDef(p.widgetId)?.category === activeCategory)
    : visible;

  // Group hidden widgets by category
  const hiddenByCategory = WIDGET_REGISTRY
    .filter(w => hidden.some(h => h.widgetId === w.id))
    .reduce((acc, w) => {
      if (!acc[w.category]) acc[w.category] = [];
      acc[w.category].push(w);
      return acc;
    }, {} as Record<string, typeof WIDGET_REGISTRY>);

  const categoryLabels: Record<string, string> = {
    projector: 'Projektor',
    liturgy: 'Liturgia',
    schedule: 'Harmonogram',
    tools: 'Narzędzia',
  };

  // ─── Drag & Drop (mouse) ─────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    dragItem.current = widgetId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '0.5';
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '1';
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

  // ─── Touch move (simple swap) ────────────────────────────────

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

  // ─── Toggle widget ─────────────────────────────────────────

  const handleToggle = useCallback((widgetId: string) => {
    const newLayout = toggleWidget(layout, widgetId);
    onLayoutChange(newLayout);
    saveLayout(newLayout);
  }, [layout, onLayoutChange]);

  // ─── Collapse/expand widget ──────────────────────────────

  const toggleCollapse = useCallback((widgetId: string) => {
    setCollapsedWidgets(prev => {
      const next = new Set(prev);
      if (next.has(widgetId)) next.delete(widgetId);
      else next.add(widgetId);
      return next;
    });
  }, []);

  // ─── Resize helpers ──────────────────────────────────────

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
    const currentIdx = validSizes.indexOf(placement.colSpan);

    let nextIdx: number;
    if (direction === 'grow') {
      nextIdx = currentIdx < validSizes.length - 1 ? currentIdx + 1 : currentIdx;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : currentIdx;
    }

    if (currentIdx === -1) {
      const nearest = validSizes.reduce((prev, curr) =>
        Math.abs(curr - placement.colSpan) < Math.abs(prev - placement.colSpan) ? curr : prev
      );
      nextIdx = validSizes.indexOf(nearest);
    }

    updateWidgetSize(widgetId, { colSpan: validSizes[nextIdx] });
  }, [layout, updateWidgetSize]);

  const handleHeightChange = useCallback((widgetId: string, direction: 'grow' | 'shrink') => {
    const placement = layout.placements.find(p => p.widgetId === widgetId);
    if (!placement) return;
    const currentIdx = ROW_SIZES.indexOf(placement.rowSpan);

    let nextIdx: number;
    if (direction === 'grow') {
      nextIdx = currentIdx < ROW_SIZES.length - 1 ? currentIdx + 1 : currentIdx;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : currentIdx;
    }

    if (currentIdx === -1) {
      const nearest = ROW_SIZES.reduce((prev, curr) =>
        Math.abs(curr - placement.rowSpan) < Math.abs(prev - placement.rowSpan) ? curr : prev
      );
      nextIdx = ROW_SIZES.indexOf(nearest);
    }

    updateWidgetSize(widgetId, { rowSpan: ROW_SIZES[nextIdx] });
  }, [layout, updateWidgetSize]);

  const getWidthLabel = (colSpan: number) => {
    if (colSpan <= 3) return 'XS';
    if (colSpan <= 4) return 'S';
    if (colSpan <= 6) return 'M';
    if (colSpan <= 8) return 'L';
    return 'XL';
  };

  /* ─── Responsive colSpan ──────────────────────────────────── */
  const getResponsiveColSpan = (placement: WidgetPlacement) => {
    if (isMobile) return 12;
    if (isTablet) return Math.max(placement.colSpan, 6);
    return placement.colSpan;
  };

  // Unique categories from visible widgets
  const categories = [...new Set(visible.map(p => getWidgetDef(p.widgetId)?.category).filter(Boolean))] as string[];

  return (
    <div className="cockpit-page flex flex-col h-full">
      {/* ─── Glass Header ──────────────────────────────────── */}
      <div className="cockpit-header flex items-center justify-between px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">Cockpit</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {visible.length} widget{visible.length !== 1 ? 'ów' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={() => { const fresh = resetLayout(); onLayoutChange(fresh); }}
              className="cockpit-btn cockpit-btn-ghost"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={`cockpit-btn ${editMode ? 'cockpit-btn-primary' : 'cockpit-btn-ghost'}`}
          >
            <Settings2 className="w-4 h-4" />
            {editMode ? 'Gotowe' : 'Edytuj'}
          </button>
        </div>
      </div>

      {/* ─── Mobile Category Tabs ──────────────────────────── */}
      {isMobile && !editMode && categories.length > 1 && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto shrink-0 border-b border-border/30">
          <button
            onClick={() => setActiveCategory(null)}
            className={`cockpit-btn text-xs whitespace-nowrap ${!activeCategory ? 'cockpit-btn-primary' : 'cockpit-btn-ghost'}`}
          >
            Wszystko
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`cockpit-btn text-xs whitespace-nowrap ${activeCategory === cat ? 'cockpit-btn-primary' : 'cockpit-btn-ghost'}`}
            >
              {categoryLabels[cat] || cat}
            </button>
          ))}
        </div>
      )}

      {/* ─── Widget Picker (edit mode) ─────────────────────── */}
      {editMode && hidden.length > 0 && (
        <div className="px-4 py-3 border-b border-border/30 bg-muted/10 shrink-0">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Dodaj widget:</p>
          <div className="space-y-2">
            {Object.entries(hiddenByCategory).map(([cat, widgets]) => (
              <div key={cat}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">{categoryLabels[cat] || cat}</p>
                <div className="flex flex-wrap gap-2">
                  {widgets.map(w => (
                    <button
                      key={w.id}
                      onClick={() => handleToggle(w.id)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card/50 border border-border/40 hover:border-primary/50 hover:bg-primary/5 backdrop-blur-sm transition-all text-sm font-medium touch-manipulation active:scale-95"
                    >
                      <Plus className="w-4 h-4 text-primary" />
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

      {/* ─── Glass Grid ────────────────────────────────────── */}
      <div
        className="flex-1 overflow-auto p-2 md:p-3 lg:p-4"
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(12, 1fr)',
          gridAutoRows: 'minmax(100px, auto)',
          gap: isMobile ? '12px' : isTablet ? '12px' : '14px',
          alignContent: 'start',
        }}
      >
        {filteredVisible.map((placement, idx) => {
          const def = getWidgetDef(placement.widgetId);
          const isDragTarget = dragOver === placement.widgetId;
          const isCollapsed = collapsedWidgets.has(placement.widgetId);
          const catColor = categoryColors[def?.category || ''] || 'hsl(var(--primary))';
          const colSpan = getResponsiveColSpan(placement);

          return (
            <div
              key={placement.widgetId}
              draggable={editMode && !isMobile}
              onDragStart={editMode ? (e) => handleDragStart(e, placement.widgetId) : undefined}
              onDragEnd={editMode ? handleDragEnd : undefined}
              onDragOver={editMode ? (e) => handleDragOver(e, placement.widgetId) : undefined}
              onDrop={editMode ? (e) => handleDrop(e, placement.widgetId) : undefined}
              style={{
                gridColumn: isMobile ? undefined : `span ${colSpan}`,
                gridRow: isCollapsed ? 'span 1' : `span ${placement.rowSpan}`,
                animationDelay: `${idx * 60}ms`,
              }}
              className={`
                cockpit-widget cockpit-widget-enter
                ${editMode ? 'ring-1 ring-primary/20 border-primary/30' : ''}
                ${isDragTarget ? 'ring-2 ring-primary scale-[1.01]' : ''}
                ${isCollapsed ? 'max-h-[44px]' : ''}
              `}
            >
              {/* Edit mode overlay — drag handle + controls */}
              {editMode && (
                <div className="absolute inset-x-0 top-0 z-20 flex flex-col border-b border-border/50 bg-card/95 backdrop-blur-sm">
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab active:cursor-grabbing" />
                      <span className="text-sm font-medium">{def?.icon} {def?.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleMoveUp(placement.widgetId)} className="cockpit-edit-btn" title="Przesuń w górę">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleMoveDown(placement.widgetId)} className="cockpit-edit-btn" title="Przesuń w dół">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggle(placement.widgetId)}
                        className="cockpit-edit-btn hover:bg-destructive/20 hover:text-destructive"
                        title="Ukryj widget"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {/* Resize controls */}
                  {!isMobile && (
                    <div className="flex items-center gap-3 px-2.5 py-1 border-t border-border/30 bg-muted/10">
                      <div className="flex items-center gap-1">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <button onClick={() => handleWidthChange(placement.widgetId, 'shrink')} className="cockpit-resize-btn" title="Zwęź">−</button>
                        <span className="text-xs font-semibold text-foreground min-w-[28px] text-center">{getWidthLabel(placement.colSpan)}</span>
                        <button onClick={() => handleWidthChange(placement.widgetId, 'grow')} className="cockpit-resize-btn" title="Rozszerz">+</button>
                      </div>
                      <div className="w-px h-4 bg-border/50" />
                      <div className="flex items-center gap-1">
                        <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <button onClick={() => handleHeightChange(placement.widgetId, 'shrink')} className="cockpit-resize-btn" title="Niższy">−</button>
                        <span className="text-xs font-semibold text-foreground min-w-[16px] text-center">{placement.rowSpan}</span>
                        <button onClick={() => handleHeightChange(placement.widgetId, 'grow')} className="cockpit-resize-btn" title="Wyższy">+</button>
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 ml-auto font-mono">{placement.colSpan}×{placement.rowSpan}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Non-edit header — collapsible, with category accent */}
              {!editMode && (
                <button
                  onClick={() => toggleCollapse(placement.widgetId)}
                  className="flex items-center justify-between w-full px-3 py-2 text-left border-b border-border/30 hover:bg-muted/10 transition-colors touch-manipulation"
                  style={{ borderLeftWidth: '3px', borderLeftColor: catColor }}
                >
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <span>{def?.icon}</span>
                    <span>{def?.label}</span>
                  </span>
                  {isCollapsed ? <Maximize2 className="w-3 h-3 text-muted-foreground/50" /> : <Minimize2 className="w-3 h-3 text-muted-foreground/50" />}
                </button>
              )}

              {/* Widget content */}
              {!isCollapsed && (
                <div className={`h-full overflow-auto ${editMode ? 'pt-[72px]' : ''}`}>
                  {renderWidget(placement.widgetId)}
                </div>
              )}
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="col-span-12 flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Settings2 className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-base font-medium">Brak widgetów</p>
            <p className="text-sm mt-1">Kliknij „Edytuj" aby dodać widgety do cockpitu</p>
          </div>
        )}
      </div>
    </div>
  );
}
