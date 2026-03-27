import { useEffect, useRef, useState } from 'react';
import type { SiedleckiTocEntry } from '@/data/siedleckiToc';

type SortMode = 'page' | 'alpha';

interface Props {
  visible: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  entries: SiedleckiTocEntry[];
  activePage: number | null;
  onGoTo: (page: number) => void;
  onClose: () => void;
  topOffset?: string;
}

export function SiedleckiSidebar({ visible, searchQuery, onSearchChange, entries, activePage, onGoTo, onClose, topOffset }: Props) {
  const activeRef = useRef<HTMLDivElement>(null);
  const [sortMode, setSortMode] = useState<SortMode>('page');

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activePage]);

  if (!visible) return null;

  let displayEntries = [...entries];
  if (sortMode === 'alpha') {
    const lettersOnly = (s: string) => s.replace(/[^\p{Letter}]/gu, '').toLowerCase();
    displayEntries.sort((a, b) => lettersOnly(a.title).localeCompare(lettersOnly(b.title), 'pl'));
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} style={topOffset ? { top: topOffset } : undefined} />
      <aside className="fixed left-0 bottom-0 z-50 flex flex-col bg-card shadow-2xl overflow-hidden w-[340px] max-[768px]:w-full animate-in slide-in-from-left duration-200" style={{ top: topOffset || 0 }}>
        <div className="p-3.5 border-b border-border flex-none grid gap-2.5">
          <div className="flex items-center gap-2">
            <input
              className="flex-1 py-3 px-3.5 rounded-xl border border-input bg-muted text-foreground text-base placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              placeholder="Szukaj pieśni..."
              autoComplete="off"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              autoFocus
            />
            <button className="bg-muted text-foreground p-3 rounded-xl text-lg hover:bg-accent transition-colors" onClick={onClose}>✕</button>
          </div>
          <div className="flex gap-1.5">
            <button
              className={`py-1.5 px-2.5 rounded-lg text-xs transition-colors ${sortMode === 'page' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-accent'}`}
              onClick={() => setSortMode('page')}
            >Wg stron</button>
            <button
              className={`py-1.5 px-2.5 rounded-lg text-xs transition-colors ${sortMode === 'alpha' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-accent'}`}
              onClick={() => setSortMode('alpha')}
            >A-Z</button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-2.5 pb-5" style={{ WebkitOverflowScrolling: 'touch' }}>
          {displayEntries.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">Brak wyników</div>
          )}
          {displayEntries.map((entry, i) => {
            const isActive = entry.page === activePage;
            return (
              <div
                key={`${entry.page}-${i}`}
                ref={isActive ? activeRef : undefined}
                className={`py-2.5 px-3 rounded-xl cursor-pointer leading-tight hover:bg-accent flex items-start gap-2 ${isActive ? 'bg-accent' : ''}`}
                style={{ paddingLeft: `${12 + (entry.level - 1) * 16}px` }}
                onClick={() => onGoTo(entry.page)}
              >
                <div className="flex-1 min-w-0">
                  <strong className="text-foreground">{entry.title}</strong>
                  <span className="block text-xs text-muted-foreground mt-1">str. {entry.page}</span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
