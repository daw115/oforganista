/**
 * Cockpit Layout System
 *
 * Manages widget placement on a 12-column CSS Grid.
 * Layouts are saved per-device to localStorage and synced to server.
 */

import { fetchSetting, saveSetting } from './settingsSync';

// ─── Widget Registry ──────────────────────────────────────────────────────

export interface WidgetDef {
  id: string;
  label: string;
  icon: string; // emoji
  /** Default grid column span (1-12) */
  defaultColSpan: number;
  /** Default grid row span */
  defaultRowSpan: number;
  /** Minimum column span */
  minColSpan: number;
  /** Category for grouping in settings */
  category: 'projector' | 'liturgy' | 'schedule' | 'tools';
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  // ─ Projector ─
  { id: 'projector-pilot', label: 'Pilot projektora', icon: '🎬', defaultColSpan: 6, defaultRowSpan: 2, minColSpan: 4, category: 'projector' },
  { id: 'projector-playlist', label: 'Playlist pieśni', icon: '🎵', defaultColSpan: 6, defaultRowSpan: 3, minColSpan: 4, category: 'projector' },
  { id: 'projector-search', label: 'Wyszukiwarka pieśni', icon: '🔍', defaultColSpan: 6, defaultRowSpan: 2, minColSpan: 4, category: 'projector' },
  // ─ Liturgy ─
  { id: 'liturgy-today', label: 'Liturgia dnia', icon: '📖', defaultColSpan: 6, defaultRowSpan: 2, minColSpan: 4, category: 'liturgy' },
  { id: 'liturgy-proposals', label: 'Propozycje pieśni', icon: '💡', defaultColSpan: 6, defaultRowSpan: 2, minColSpan: 4, category: 'liturgy' },
  { id: 'announcements', label: 'Ogłoszenia', icon: '📢', defaultColSpan: 6, defaultRowSpan: 2, minColSpan: 4, category: 'liturgy' },
  { id: 'devotions', label: 'Nabożeństwa', icon: '🕯️', defaultColSpan: 6, defaultRowSpan: 2, minColSpan: 4, category: 'liturgy' },

  // ─ Schedule ─
  { id: 'today-card', label: 'Kartka z kalendarza', icon: '📅', defaultColSpan: 6, defaultRowSpan: 1, minColSpan: 3, category: 'schedule' },
  { id: 'schedule-stats', label: 'Statystyki', icon: '📊', defaultColSpan: 6, defaultRowSpan: 1, minColSpan: 3, category: 'schedule' },

  // ─ Tools ─
  { id: 'cantor', label: 'Kantor', icon: '🎤', defaultColSpan: 6, defaultRowSpan: 2, minColSpan: 4, category: 'tools' },
  { id: 'songbook', label: 'Śpiewnik', icon: '📕', defaultColSpan: 6, defaultRowSpan: 2, minColSpan: 4, category: 'tools' },
  { id: 'quick-actions', label: 'Szybkie akcje', icon: '⚡', defaultColSpan: 4, defaultRowSpan: 1, minColSpan: 3, category: 'tools' },
];

// ─── Layout Types ─────────────────────────────────────────────────────────

export interface WidgetPlacement {
  widgetId: string;
  colStart: number;  // 1-based, within 12-col grid
  colSpan: number;
  rowStart: number;  // 1-based
  rowSpan: number;
  visible: boolean;
}

export interface CockpitLayout {
  version: number;
  placements: WidgetPlacement[];
  columns: number; // 12 by default
}

// ─── Default Layout ───────────────────────────────────────────────────────

export function getDefaultLayout(): CockpitLayout {
  return {
    version: 2,
    columns: 12,
    placements: [
      // Row 1-2: Pilot (left) + Playlist (right) — main controls
      { widgetId: 'projector-pilot', colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3, visible: true },
      { widgetId: 'projector-playlist', colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 3, visible: true },
      // Row 3-4: Quick actions + Search
      { widgetId: 'quick-actions', colStart: 1, colSpan: 4, rowStart: 4, rowSpan: 1, visible: true },
      { widgetId: 'projector-search', colStart: 5, colSpan: 8, rowStart: 4, rowSpan: 2, visible: true },
      // Row 5-6: Liturgy + Today card
      { widgetId: 'liturgy-today', colStart: 1, colSpan: 8, rowStart: 6, rowSpan: 2, visible: true },
      { widgetId: 'today-card', colStart: 9, colSpan: 4, rowStart: 6, rowSpan: 1, visible: true },
      // Row 7: Announcements
      { widgetId: 'announcements', colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2, visible: true },
      // Hidden by default — user can enable in edit mode
      { widgetId: 'liturgy-proposals', colStart: 7, colSpan: 6, rowStart: 8, rowSpan: 2, visible: false },
      { widgetId: 'devotions', colStart: 7, colSpan: 6, rowStart: 10, rowSpan: 2, visible: false },
      { widgetId: 'schedule-stats', colStart: 1, colSpan: 6, rowStart: 12, rowSpan: 1, visible: false },
      { widgetId: 'cantor', colStart: 7, colSpan: 6, rowStart: 12, rowSpan: 2, visible: false },
      { widgetId: 'songbook', colStart: 1, colSpan: 6, rowStart: 14, rowSpan: 2, visible: false },
    ],
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────

const LAYOUT_KEY = 'organista_cockpit_layout';

export function loadLayout(): CockpitLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version && parsed?.placements) return parsed;
    }
  } catch {}
  return getDefaultLayout();
}

export function saveLayout(layout: CockpitLayout): void {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  // Fire-and-forget server sync
  saveSetting('cockpit_layout', layout);
}

export async function syncLayoutFromServer(): Promise<CockpitLayout | null> {
  try {
    const server = await fetchSetting<CockpitLayout>('cockpit_layout');
    if (server?.version && server?.placements) {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(server));
      return server;
    }
  } catch {}
  return null;
}

// ─── Layout Helpers ───────────────────────────────────────────────────────

/** Get visible placements sorted by position (top-left first) */
export function getVisiblePlacements(layout: CockpitLayout): WidgetPlacement[] {
  return layout.placements
    .filter(p => p.visible)
    .sort((a, b) => a.rowStart !== b.rowStart ? a.rowStart - b.rowStart : a.colStart - b.colStart);
}

/** Toggle widget visibility */
export function toggleWidget(layout: CockpitLayout, widgetId: string): CockpitLayout {
  return {
    ...layout,
    placements: layout.placements.map(p =>
      p.widgetId === widgetId ? { ...p, visible: !p.visible } : p
    ),
  };
}

/** Update widget placement (after drag) */
export function updatePlacement(layout: CockpitLayout, widgetId: string, updates: Partial<WidgetPlacement>): CockpitLayout {
  return {
    ...layout,
    placements: layout.placements.map(p =>
      p.widgetId === widgetId ? { ...p, ...updates } : p
    ),
  };
}

/** Reorder: move widget to a new position in the visible list */
export function reorderWidgets(layout: CockpitLayout, fromId: string, toId: string): CockpitLayout {
  const visible = getVisiblePlacements(layout);
  const fromIdx = visible.findIndex(p => p.widgetId === fromId);
  const toIdx = visible.findIndex(p => p.widgetId === toId);
  if (fromIdx < 0 || toIdx < 0) return layout;

  // Swap row positions
  const reordered = [...visible];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);

  // Reassign grid positions (simple auto-flow)
  let row = 1;
  let col = 1;
  const newPlacements = layout.placements.map(p => {
    if (!p.visible) return p;
    const idx = reordered.findIndex(r => r.widgetId === p.widgetId);
    if (idx < 0) return p;
    return reordered[idx];
  });

  // Auto-layout visible widgets
  const autoPlaced = autoLayout(newPlacements.filter(p => p.visible), layout.columns);
  const hiddenPlacements = newPlacements.filter(p => !p.visible);

  return {
    ...layout,
    placements: [...autoPlaced, ...hiddenPlacements],
  };
}

/** Auto-layout widgets in a grid (simple bin-packing) */
export function autoLayout(placements: WidgetPlacement[], columns: number = 12): WidgetPlacement[] {
  const result: WidgetPlacement[] = [];
  let row = 1;
  let col = 1;

  for (const p of placements) {
    const span = Math.min(p.colSpan, columns);
    // If doesn't fit on current row, go to next
    if (col + span - 1 > columns) {
      row += Math.max(...result.filter(r => r.rowStart === row - (row > 1 ? 0 : 0)).map(r => r.rowSpan), 1);
      // Simplified: just increment by max row span of last row
      const lastRowWidgets = result.filter(r => r.rowStart === row - 1 || r.rowStart === row);
      if (lastRowWidgets.length === 0) row++;
      col = 1;
    }

    result.push({
      ...p,
      colStart: col,
      rowStart: row,
      visible: true,
    });

    col += span;
    if (col > columns) {
      row += p.rowSpan;
      col = 1;
    }
  }

  return result;
}

/** Reset layout to defaults */
export function resetLayout(): CockpitLayout {
  const layout = getDefaultLayout();
  saveLayout(layout);
  return layout;
}

/** Get widget definition by id */
export function getWidgetDef(widgetId: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find(w => w.id === widgetId);
}
