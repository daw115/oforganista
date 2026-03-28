/**
 * Cockpit Grid — drag & drop widget grid with touch support.
 *
 * Uses CSS Grid 12-column layout optimized for laptop touchscreens.
 * Widgets can be dragged to reorder, resized via handles,
 * and toggled via an edit mode overlay.
 */

import { useState, useRef, useCallback, type ReactNode } from 'react';
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
import { GripVertical, X, Plus, Settings2, RotateCcw, ChevronUp, ChevronDown, Minimize2, Maximize2 } from 'lucide-react';

interface CockpitGridProps {
  layout: CockpitLayout;
  onLayoutChange: (layout: CockpitLayout) => void;
  renderWidget: (widgetId: string) => ReactNode;
}

export function CockpitGrid({ layout, onLayoutChange, renderWidget }: CockpitGridProps) {
  const [editMode, setEditMode] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [collapsedWidgets, setCollapsedWidgets] = useState<Set<string>>(new Set());
  const dragItem = useRef<string | null>(null);

  const visible = getVisiblePlacements(layout);
  const hidden = layout.placements.filter(p => !p.visible);

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

  // ─── Resize (col span cycle: 4 → 6 → 8 → 12 → 4) ──────

  const handleResize = useCallback((widgetId: string) => {
    const placement = layout.placements.find(p => p.widgetId === widgetId);
    if (!placement) return;
    const sizes = [4, 6, 8, 12];
    const def = getWidgetDef(widgetId);
    const minSpan = def?.minColSpan || 3;
    const validSizes = sizes.filter(s => s >= minSpan);
    const currentIdx = validSizes.indexOf(placement.colSpan);
    const nextIdx = (currentIdx + 1) % validSizes.length;

    const newLayout = {
      ...layout,
      placements: layout.placements.map(p =>
        p.widgetId === widgetId ? { ...p, colSpan: validSizes[nextIdx] } : p
      ),
    };
    onLayoutChange(newLayout);
    saveLayout(newLayout);
  }, [layout, onLayoutChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — touch-friendly height */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">Cockpit</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {visible.length} widget{visible.length !== 1 ? 'ów' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={() => {
                const fresh = resetLayout();
                onLayoutChange(fresh);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted/50 transition-colors touch-manipulation"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors touch-manipulation ${
              editMode
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 hover:bg-muted text-foreground'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            {editMode ? 'Gotowe' : 'Edytuj'}
          </button>
        </div>
      </div>

      {/* Widget Picker (edit mode) — grouped by category */}
      {editMode && hidden.length > 0 && (
        <div className="px-4 py-3 border-b border-border bg-muted/10 shrink-0">
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
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm font-medium touch-manipulation active:scale-95"
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

      {/* Grid */}
      <div
        className="flex-1 overflow-auto p-2 md:p-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridAutoRows: 'minmax(100px, auto)',
          gap: '10px',
          alignContent: 'start',
        }}
      >
        {visible.map((placement) => {
          const def = getWidgetDef(placement.widgetId);
          const isDragTarget = dragOver === placement.widgetId;
          const isCollapsed = collapsedWidgets.has(placement.widgetId);

          return (
            <div
              key={placement.widgetId}
              draggable={editMode}
              onDragStart={editMode ? (e) => handleDragStart(e, placement.widgetId) : undefined}
              onDragEnd={editMode ? handleDragEnd : undefined}
              onDragOver={editMode ? (e) => handleDragOver(e, placement.widgetId) : undefined}
              onDrop={editMode ? (e) => handleDrop(e, placement.widgetId) : undefined}
              style={{
                gridColumn: `span ${placement.colSpan}`,
                gridRow: isCollapsed ? 'span 1' : `span ${placement.rowSpan}`,
              }}
              className={`
                relative rounded-xl border overflow-hidden transition-all duration-150
                ${editMode
                  ? 'border-primary/30 bg-card ring-1 ring-primary/10'
                  : 'border-border bg-card'
                }
                ${isDragTarget ? 'ring-2 ring-primary scale-[1.01]' : ''}
                ${isCollapsed ? 'max-h-[44px]' : ''}
              `}
            >
              {/* Edit mode overlay — drag handle + controls */}
              {editMode && (
                <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-2.5 py-1.5 bg-card/95 backdrop-blur-sm border-b border-border">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab active:cursor-grabbing" />
                    <span className="text-sm font-medium">{def?.icon} {def?.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveUp(placement.widgetId)}
                      className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground touch-manipulation active:scale-90"
                      title="Przesuń w górę"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(placement.widgetId)}
                      className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground touch-manipulation active:scale-90"
                      title="Przesuń w dół"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleResize(placement.widgetId)}
                      className="px-2 py-1 rounded-lg hover:bg-muted/50 text-muted-foreground text-xs font-mono font-bold touch-manipulation active:scale-90"
                      title="Zmień rozmiar"
                    >
                      {placement.colSpan}/12
                    </button>
                    <button
                      onClick={() => handleToggle(placement.widgetId)}
                      className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive touch-manipulation active:scale-90"
                      title="Ukryj widget"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Non-edit header — collapsible, with title */}
              {!editMode && (
                <button
                  onClick={() => toggleCollapse(placement.widgetId)}
                  className="flex items-center justify-between w-full px-3 py-2 text-left border-b border-border/50 bg-card/80 hover:bg-muted/20 transition-colors touch-manipulation"
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
                <div className={`h-full overflow-auto ${editMode ? 'pt-9' : ''}`}>
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
