/**
 * Song matching utilities — ported from ofiarowanie-app
 * Matches song titles to SL pages and liturgy PDFs
 */

import { SL_TOC, type SlEntry } from './slToc';
import { LITURGIA_PDFS } from './liturgiaPdf';


const SL_VIEWER_URL = 'https://build-your-songbook.lovable.app/';

function normalizeSlTitle(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l').replace(/ą/g, 'a').replace(/ę/g, 'e')
    .replace(/[.,;:!?()\[\]{}"'`´'""„…\-_/\\]+/g, ' ')
    .replace(/^\d+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSiedlCode(value: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^0-9a-z]/g, '');
}

function titleTokens(normalized: string): string[] {
  return normalized.split(' ').map(v => v.trim()).filter(Boolean);
}

// ──── SL TOC matcher ────

interface SlNormalizedEntry {
  page: number;
  normTitle: string;
  tokens: string[];
}

interface SlMatcher {
  normalized: SlNormalizedEntry[];
  exact: Map<string, number[]>;
}

function buildSlMatcher(entries: SlEntry[]): SlMatcher {
  const normalized: SlNormalizedEntry[] = entries
    .map(entry => {
      const normTitle = normalizeSlTitle(entry.title);
      return { page: entry.page, normTitle, tokens: titleTokens(normTitle) };
    })
    .filter(entry => entry.normTitle.length > 0);

  const exact = normalized.reduce<Map<string, number[]>>((acc, entry) => {
    if (!acc.has(entry.normTitle)) acc.set(entry.normTitle, []);
    acc.get(entry.normTitle)?.push(entry.page);
    return acc;
  }, new Map());

  return { normalized, exact };
}

const slMatcher = buildSlMatcher(SL_TOC);

// Map: normalized Siedl number → SL page
const slBySiedlNumber: Map<string, number> = (() => {
  const map = new Map<string, number>();
  for (const entry of SL_TOC) {
    const key = normalizeSiedlCode(entry.number || '');
    if (key && !map.has(key)) map.set(key, entry.page);
  }
  return map;
})();

// ──── LITURGIA_PDFS matcher (lazy, rebuilt when LITURGIA_PDFS changes) ────

interface LiturgiaPdfNormalizedEntry {
  url: string;
  normTitle: string;
}

let _pdfCacheLen = -1;
let _pdfNormalized: LiturgiaPdfNormalizedEntry[] = [];
let _pdfExact: Map<string, string[]> = new Map();

function ensurePdfIndex() {
  if (_pdfCacheLen === LITURGIA_PDFS.length) return;
  _pdfNormalized = LITURGIA_PDFS
    .map(entry => ({ url: entry.url, normTitle: normalizeSlTitle(entry.title) }))
    .filter(entry => entry.normTitle.length > 0);
  _pdfExact = _pdfNormalized.reduce<Map<string, string[]>>((acc, entry) => {
    if (!acc.has(entry.normTitle)) acc.set(entry.normTitle, []);
    acc.get(entry.normTitle)?.push(entry.url);
    return acc;
  }, new Map());
  _pdfCacheLen = LITURGIA_PDFS.length;
}

// ──── Public API ────

/**
 * Find SL page for a song title using fuzzy matching against SL_TOC.
 */
export function findSlPageForSong(songTitle: string): number | null {
  const normalized = normalizeSlTitle(songTitle);
  if (!normalized) return null;

  const variants = new Set<string>([normalized]);
  const noParen = normalized.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (noParen) variants.add(noParen);
  const beforeComma = normalized.split(',')[0].trim();
  if (beforeComma.length >= 4) variants.add(beforeComma);

  for (const variant of variants) {
    const exact = slMatcher.exact.get(variant);
    if (exact && exact.length > 0) return exact[0];
  }

  let allWordsPage: number | null = null;
  let allWordsScore = -1;
  for (const variant of variants) {
    const words = titleTokens(variant);
    if (words.length < 2) continue;
    for (const entry of slMatcher.normalized) {
      if (words.every(w => entry.normTitle.includes(w))) {
        const score = words.length * 100 + Math.min(entry.normTitle.length, variant.length);
        if (score > allWordsScore) { allWordsScore = score; allWordsPage = entry.page; }
      }
    }
  }
  if (allWordsPage !== null) return allWordsPage;

  let twoWordsPage: number | null = null;
  let twoWordsScore = -1;
  for (const variant of variants) {
    const words = titleTokens(variant).slice(0, 2);
    if (words.length < 2) continue;
    for (const entry of slMatcher.normalized) {
      if (words.every(w => entry.normTitle.includes(w))) {
        const score = Math.min(entry.normTitle.length, variant.length);
        if (score > twoWordsScore) { twoWordsScore = score; twoWordsPage = entry.page; }
      }
    }
  }
  if (twoWordsPage !== null) return twoWordsPage;

  let bestPage: number | null = null;
  let bestLength = 0;
  for (const variant of variants) {
    if (variant.length < 5) continue;
    for (const entry of slMatcher.normalized) {
      if (entry.normTitle.includes(variant) || variant.includes(entry.normTitle)) {
        const len = Math.min(entry.normTitle.length, variant.length);
        if (len > bestLength) { bestLength = len; bestPage = entry.page; }
      }
    }
  }
  return bestPage;
}

/**
 * Find SL viewer page for a Siedlce songbook number.
 */
export function findSlPageForSiedl(siedlValue: string): number | null {
  const code = normalizeSiedlCode(siedlValue);
  if (!code) return null;
  return slBySiedlNumber.get(code) ?? null;
}

/**
 * Find a liturgy PDF URL for a song title.
 */
export function findLiturgiaPdfForSong(songTitle: string): string | null {
  ensurePdfIndex();
  const normalized = normalizeSlTitle(songTitle);
  if (!normalized) return null;

  const variants = new Set<string>([normalized]);
  const noParen = normalized.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (noParen) variants.add(noParen);
  const beforeComma = normalized.split(',')[0].trim();
  if (beforeComma.length >= 4) variants.add(beforeComma);

  for (const variant of variants) {
    const exact = _pdfExact.get(variant);
    if (exact && exact.length > 0) return exact[0];
  }

  let bestUrl: string | null = null;
  let bestLength = 0;
  for (const variant of variants) {
    if (variant.length < 5) continue;
    for (const entry of _pdfNormalized) {
      if (entry.normTitle.includes(variant) || variant.includes(entry.normTitle)) {
        const len = Math.min(entry.normTitle.length, variant.length);
        if (len > bestLength) { bestLength = len; bestUrl = entry.url; }
      }
    }
  }
  return bestUrl;
}

/**
 * Get SL viewer URL for a given page number.
 */
export function slViewerUrl(page: number): string {
  return `${SL_VIEWER_URL}?page=${page}`;
}
