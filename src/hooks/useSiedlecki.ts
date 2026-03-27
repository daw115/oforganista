import { useState, useCallback, useEffect } from 'react';
import { SIEDLECKI_TOC, SIEDLECKI_PAGE_COUNT, siedleckiPagePath, type SiedleckiTocEntry } from '@/data/siedleckiToc';

export interface CustomPageEntry {
  title: string;
  imageUrl: string;
}

function normalizeSearch(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:!?()\[\]{}"'`´'""„…\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(page: number, max: number): number {
  return Math.max(1, Math.min(max, page || 1));
}

export function useSiedlecki(initialPage?: number, customPages: CustomPageEntry[] = []) {
  const builtInPages = SIEDLECKI_PAGE_COUNT;
  const totalPages = builtInPages + customPages.length;

  const [leftPage, setLeftPage] = useState(() => {
    if (initialPage && initialPage > 0) return clamp(initialPage, totalPages);
    const saved = parseInt(localStorage.getItem('siedlecki_left_page') || '1', 10);
    return clamp(saved || 1, totalPages);
  });
  const [zoom, setZoom] = useState(() => parseFloat(localStorage.getItem('siedlecki_zoom') || '1'));
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animClass, setAnimClass] = useState<{ left: string; right: string }>({ left: '', right: '' });

  const rightPage = Math.min(leftPage + 1, totalPages);
  const showRight = rightPage !== leftPage;

  const getPageSrc = useCallback((pageNum: number): string => {
    if (pageNum <= builtInPages) return siedleckiPagePath(pageNum);
    const idx = pageNum - builtInPages - 1;
    return customPages[idx]?.imageUrl || '';
  }, [builtInPages, customPages]);

  const leftSrc = getPageSrc(leftPage);
  const rightSrc = getPageSrc(rightPage);

  useEffect(() => {
    localStorage.setItem('siedlecki_left_page', String(leftPage));
    localStorage.setItem('siedlecki_zoom', String(zoom));
  }, [leftPage, zoom]);

  // Preload adjacent pages
  useEffect(() => {
    [leftPage + 2, leftPage + 3, leftPage - 1, leftPage - 2].forEach(n => {
      if (n >= 1 && n <= totalPages) {
        const img = new Image();
        img.src = getPageSrc(n);
      }
    });
  }, [leftPage, totalPages, getPageSrc]);

  // Background prefetch ALL built-in pages on mount (low priority)
  useEffect(() => {
    let cancelled = false;
    const BATCH = 6;
    const DELAY = 80; // ms between batches

    async function prefetchAll() {
      for (let i = 1; i <= builtInPages; i += BATCH) {
        if (cancelled) return;
        const batch: Promise<void>[] = [];
        for (let j = i; j < i + BATCH && j <= builtInPages; j++) {
          batch.push(new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = img.onerror = () => resolve();
            img.src = siedleckiPagePath(j);
          }));
        }
        await Promise.all(batch);
        if (DELAY > 0) await new Promise(r => setTimeout(r, DELAY));
      }
    }

    // Start after a short delay so it doesn't block initial render
    const timer = setTimeout(prefetchAll, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [builtInPages]);

  const combinedToc = useCallback((): SiedleckiTocEntry[] => {
    const customEntries: SiedleckiTocEntry[] = customPages.map((p, i) => ({
      level: 1,
      title: p.title,
      page: builtInPages + i + 1,
    }));
    return [...SIEDLECKI_TOC, ...customEntries];
  }, [customPages, builtInPages]);

  const filteredToc = useCallback((): SiedleckiTocEntry[] => {
    const norm = normalizeSearch(searchQuery);
    const all = combinedToc();
    if (!norm) return all;
    return all.filter(x => normalizeSearch(x.title).includes(norm));
  }, [searchQuery, combinedToc]);

  const goTo = useCallback((page: number) => {
    setLeftPage(clamp(page, totalPages));
    setAnimClass({ left: '', right: '' });
  }, [totalPages]);

  const animateStep = useCallback((dir: number) => {
    if (isAnimating) return;
    const target = clamp(leftPage + dir, totalPages);
    if (target === leftPage) return;
    setIsAnimating(true);
    setAnimClass(dir > 0
      ? { left: 'siedlecki-slide-out-left', right: 'siedlecki-slide-in-left' }
      : { left: 'siedlecki-slide-out-right', right: 'siedlecki-slide-in-right' }
    );
    // Preload target
    const img = new Image();
    img.src = getPageSrc(dir > 0 ? Math.min(target + 1, totalPages) : target);
    setTimeout(() => {
      setLeftPage(target);
      setAnimClass({ left: '', right: '' });
      setIsAnimating(false);
    }, 190);
  }, [isAnimating, leftPage, totalPages]);

  const next = useCallback(() => animateStep(1), [animateStep]);
  const prev = useCallback(() => animateStep(-1), [animateStep]);
  const zoomIn = useCallback(() => setZoom(z => Math.min(2.2, +(z + 0.1).toFixed(2))), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(0.6, +(z - 0.1).toFixed(2))), []);
  const zoomFit = useCallback(() => setZoom(1), []);
  const toggleSidebar = useCallback(() => setSidebarVisible(v => !v), []);

  const activeTocPage = useCallback((): number | null => {
    const all = combinedToc();
    let best: number | null = null;
    for (const entry of all) {
      if (entry.page <= leftPage) best = entry.page;
    }
    return best;
  }, [leftPage, combinedToc]);

  return {
    leftPage, rightPage, leftSrc, rightSrc, showRight,
    zoom, setZoom, searchQuery, setSearchQuery,
    sidebarVisible, setSidebarVisible, toggleSidebar,
    animClass, filteredToc, goTo, next, prev,
    zoomIn, zoomOut, zoomFit, activeTocPage, totalPages,
  };
}
