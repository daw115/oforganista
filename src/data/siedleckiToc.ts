import './siedlecki_toc_raw.js';

export interface SiedleckiTocEntry {
  level: number;
  title: string;
  page: number;
}

export const SIEDLECKI_TOC: SiedleckiTocEntry[] = (window as any).SPIEWNIK_TOC || [];
export const SIEDLECKI_PAGE_COUNT: number = (window as any).SPIEWNIK_PAGE_COUNT || 1404;

const SIEDLECKI_BASE_URL = 'https://build-your-songbook.lovable.app';

export function siedleckiPagePath(n: number): string {
  return `${SIEDLECKI_BASE_URL}/pages/${String(n).padStart(4, '0')}.webp`;
}
