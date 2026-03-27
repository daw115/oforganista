/**
 * Song Indexing & Numbering Service
 *
 * Provides:
 * - Title normalization & prefix generation for autocomplete
 * - Search token generation (title, author, source, siedlecki, first lines)
 * - Song number assignment (stable, sequential)
 * - Section & slide numbering (localSlideNo, songSlideNo, globalSlideId)
 * - Full rebuild utility for entire database
 */

import type { Song, Verse, DisplaySlide } from '@/types/projector';
import { splitSectionToSlides, CHURCH_PRESET, type ProjectorPreset } from './projectorLayout';

// ─── Text normalization ────────────────────────────────────────────────────

/** Remove diacritics, lowercase, strip punctuation, normalize spaces */
export function normalizeText(text: string | unknown): string {
  const str = typeof text === 'string' ? text : String(text ?? '');
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Polish chars that NFD doesn't decompose
    .replace(/ł/g, 'l').replace(/Ł/g, 'l')
    .replace(/ą/g, 'a').replace(/Ą/g, 'a')
    .replace(/ę/g, 'e').replace(/Ę/g, 'e')
    .toLowerCase()
    .replace(/[.,;:!?()\[\]{}"'`´'""„…\-_/\\*#@&+^~<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize title specifically (also strips leading numbers) */
export function normalizeSongTitle(title: string): string {
  const base = normalizeText(title);
  // Strip leading numeric prefix like "123. " or "123 - "
  return base.replace(/^\d+[\s.\-–—:]+/, '').trim();
}

/** Generate slug from title and songNumber */
export function generateSlug(title: string, songNumber: number): string {
  const normalized = normalizeSongTitle(title)
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${normalized}-${songNumber}`;
}

/** Generate a sort key for consistent ordering */
export function generateSortKey(title: string): string {
  return normalizeSongTitle(title);
}

// ─── Prefix generation (for autocomplete) ──────────────────────────────────

/** Generate all meaningful prefixes of normalized title for fast autocomplete */
export function generateTitlePrefixes(title: string): string[] {
  const normalized = normalizeSongTitle(title);
  if (!normalized) return [];

  const prefixes: string[] = [];
  // Character-level prefixes (1 to full length, max 30)
  const maxLen = Math.min(normalized.length, 30);
  for (let i = 1; i <= maxLen; i++) {
    prefixes.push(normalized.slice(0, i));
  }
  return prefixes;
}

// ─── Search token generation ───────────────────────────────────────────────

/** Generate search tokens from all searchable fields of a song */
export function generateSearchTokens(song: Song): string[] {
  const tokens = new Set<string>();

  // Title tokens
  const titleNorm = normalizeSongTitle(song.title);
  for (const word of titleNorm.split(' ').filter(w => w.length >= 2)) {
    tokens.add(word);
  }

  // Author tokens
  if (song.author) {
    for (const word of normalizeText(song.author).split(' ').filter(w => w.length >= 2)) {
      tokens.add(word);
    }
  }

  // Source tokens
  if (song.source) {
    for (const word of normalizeText(song.source).split(' ').filter(w => w.length >= 2)) {
      tokens.add(word);
    }
  }

  // Siedlecki number
  if (song.siedleckiNumber) {
    tokens.add(normalizeText(song.siedleckiNumber));
  }

  // First line of first verse (if available)
  if (song.verses.length > 0 && song.verses[0].text) {
    const firstLine = song.verses[0].text.split('\n')[0] || '';
    for (const word of normalizeText(firstLine).split(' ').filter(w => w.length >= 3)) {
      tokens.add(word);
    }
  }

  // Variants (if they contain title alternatives)
  if (song.variants && typeof song.variants === 'object') {
    const variantTitles: string[] = Array.isArray(song.variants)
      ? song.variants
      : Object.values(song.variants).filter(v => typeof v === 'string') as string[];
    for (const vt of variantTitles) {
      for (const word of normalizeText(vt).split(' ').filter(w => w.length >= 2)) {
        tokens.add(word);
      }
    }
  }

  return Array.from(tokens);
}

/** Generate combined searchText for simple full-text matching */
export function generateSearchText(song: Song): string {
  const parts: string[] = [
    song.title,
    song.author || '',
    song.source || '',
    song.siedleckiNumber || '',
  ];

  // Add first line of each verse
  for (const v of song.verses) {
    const firstLine = v.text.split('\n')[0] || '';
    if (firstLine.length > 3) parts.push(firstLine);
  }

  // Variants
  if (song.variants) {
    if (Array.isArray(song.variants)) {
      parts.push(...song.variants.filter((v: any) => typeof v === 'string'));
    }
  }

  return parts.map(p => normalizeText(p)).filter(Boolean).join(' ');
}

// ─── Section numbering ─────────────────────────────────────────────────────

/** Assign section numbers and generate ref strings */
export function assignSectionNumbers(song: Song): Song {
  const verses = song.verses.map((v, i) => ({
    ...v,
    sectionNumber: i + 1,
    ref: v.ref || `${v.type}-${i + 1}`,
    normalizedText: normalizeText(v.text),
  }));
  return { ...song, verses };
}

// ─── Slide numbering ───────────────────────────────────────────────────────

/**
 * Resolve the ordered list of verses for slide generation.
 * Uses displayOrder (verse_order from OpenLP) if available,
 * otherwise falls back to the natural order of verses[].
 * If a song has a chorus but no displayOrder, auto-interleaves: v1 c v2 c v3 c ...
 */
function resolveVerseOrder(song: Song): Verse[] {
  const verses = song.verses;
  if (!verses.length) return [];

  // If displayOrder exists, use it
  if (song.displayOrder && song.displayOrder.length > 0) {
    const ordered: Verse[] = [];
    for (const ref of song.displayOrder) {
      const found = verses.find(v => v.ref === ref);
      if (found) ordered.push(found);
    }
    // If we resolved at least some, use it; else fall back
    if (ordered.length > 0) return ordered;
  }

  // Auto-interleave chorus if no displayOrder
  const chorus = verses.find(v => v.type === 'chorus');
  const nonChorus = verses.filter(v => v.type !== 'chorus');

  if (chorus && nonChorus.length >= 2) {
    const result: Verse[] = [];
    for (const v of nonChorus) {
      result.push(v);
      result.push(chorus);
    }
    return result;
  }

  // Default: natural order
  return verses;
}

/** Build pre-computed display slides with full numbering, respecting verse_order */
export function buildSongSlides(song: Song, preset: ProjectorPreset = CHURCH_PRESET): DisplaySlide[] {
  const slides: DisplaySlide[] = [];
  let songSlideNo = 0;
  const songNumber = song.songNumber || 0;

  const orderedVerses = resolveVerseOrder(song);

  for (const verse of orderedVerses) {
    const sectionRef = verse.ref || `${verse.type}-${verse.sectionNumber || 0}`;
    const projector = verse.projector || splitSectionToSlides(verse.text, preset);

    for (const slide of projector.slides) {
      songSlideNo++;
      slides.push({
        globalSlideId: `${song.id}:${sectionRef}:${slide.slideNo}`,
        songId: song.id,
        songNumber,
        sectionRef,
        sectionNumber: verse.sectionNumber || 0,
        sectionType: verse.type,
        localSlideNo: slide.slideNo,
        songSlideNo,
        text: slide.text,
        lines: slide.lines,
        lineCount: slide.lineCount,
        searchText: normalizeText(slide.text),
      });
    }
  }

  return slides;
}

/** Assign slide numbers to a song's existing projector data */
export function assignSlideNumbers(song: Song): Song {
  const slides = buildSongSlides(song);
  return { ...song, projectorDisplaySlides: slides };
}

// ─── Song number assignment ────────────────────────────────────────────────

/** Assign song numbers to songs that don't have one. Preserves existing numbers. */
export function assignSongNumbers(songs: Song[]): Song[] {
  // Find the maximum existing song number
  let maxNumber = 0;
  for (const song of songs) {
    if (song.songNumber && song.songNumber > maxNumber) {
      maxNumber = song.songNumber;
    }
  }

  return songs.map(song => {
    if (song.songNumber) return song;
    maxNumber++;
    return { ...song, songNumber: maxNumber };
  });
}

/** Get the next available song number from a collection */
export function getNextSongNumber(songs: Song[]): number {
  let max = 0;
  for (const song of songs) {
    if (song.songNumber && song.songNumber > max) max = song.songNumber;
  }
  return max + 1;
}

// ─── Full song indexing ────────────────────────────────────────────────────

/** Rebuild all index data for a single song (idempotent) */
export function rebuildSongIndex(song: Song, preset: ProjectorPreset = CHURCH_PRESET): Song {
  // 1. Section numbers & refs
  let indexed = assignSectionNumbers(song);

  // 2. Projector data for each section
  indexed = {
    ...indexed,
    verses: indexed.verses.map(v => ({
      ...v,
      projector: splitSectionToSlides(v.text, preset),
    })),
    projectorPresetName: preset.name,
    projectorPreparedAt: new Date().toISOString(),
    projectorVersion: 3,
  };

  // 3. Normalized title, slug, sort key, prefixes, tokens
  const normalizedTitle = normalizeSongTitle(indexed.title);
  const sortKey = generateSortKey(indexed.title);
  const slug = generateSlug(indexed.title, indexed.songNumber || 0);
  const titlePrefixes = generateTitlePrefixes(indexed.title);
  const searchTokens = generateSearchTokens(indexed);
  const searchText = generateSearchText(indexed);

  indexed = {
    ...indexed,
    normalizedTitle,
    sortKey,
    slug,
    titlePrefixes,
    searchTokens,
    searchText,
    updatedAt: new Date().toISOString(),
  };

  // 4. Display slides with numbering
  indexed = assignSlideNumbers(indexed);

  return indexed;
}

/** Prepare a new song with all index data + assign songNumber */
export function indexNewSong(song: Song, existingSongs: Song[], preset: ProjectorPreset = CHURCH_PRESET): Song {
  const songNumber = song.songNumber || getNextSongNumber(existingSongs);
  const withNumber: Song = {
    ...song,
    songNumber,
    createdAt: song.createdAt || new Date().toISOString(),
  };
  return rebuildSongIndex(withNumber, preset);
}

// ─── Batch rebuild ─────────────────────────────────────────────────────────

export interface RebuildResult {
  songs: Song[];
  totalSlides: number;
  modified: number;
  /** Time taken in ms */
  elapsed: number;
}

/** Rebuild all indexing data for an entire collection */
export function rebuildAllSongsData(
  songs: Song[],
  preset: ProjectorPreset = CHURCH_PRESET,
): RebuildResult {
  const start = performance.now();

  // 1. Assign song numbers to those missing them
  const numbered = assignSongNumbers(songs);

  // 2. Rebuild each song
  let totalSlides = 0;
  let modified = 0;

  const rebuilt = numbered.map(song => {
    const indexed = rebuildSongIndex(song, preset);
    const slideCount = indexed.projectorDisplaySlides?.length || 0;
    totalSlides += slideCount;

    // Detect if we actually changed anything
    if (!song.normalizedTitle || !song.projectorDisplaySlides || song.projectorVersion !== 3) {
      modified++;
    }

    return indexed;
  });

  const elapsed = performance.now() - start;
  return { songs: rebuilt, totalSlides, modified, elapsed };
}

// ─── Search utilities ──────────────────────────────────────────────────────

export interface SongSearchResult {
  song: Song;
  /** How well this matched (higher = better) */
  score: number;
  /** Which field matched */
  matchType: 'songNumber' | 'siedlecki' | 'title' | 'titlePrefix' | 'token' | 'content';
}

/** Fast search across indexed songs */
export function searchSongs(
  songs: Song[],
  query: string,
  options: { searchContent?: boolean; limit?: number } = {},
): SongSearchResult[] {
  const { searchContent = false, limit = 100 } = options;
  const q = normalizeText(query);
  if (!q) return [];

  const results: SongSearchResult[] = [];

  // Check if query is a number (for songNumber or siedlecki lookup)
  const isNumeric = /^\d+$/.test(q);

  for (const song of songs) {
    let score = 0;
    let matchType: SongSearchResult['matchType'] = 'content';

    // 1. Exact song number match (highest priority)
    if (isNumeric && song.songNumber === parseInt(q, 10)) {
      score = 1000;
      matchType = 'songNumber';
    }
    // 2. Siedlecki number match
    else if (isNumeric && song.siedleckiNumber && normalizeText(song.siedleckiNumber) === q) {
      score = 900;
      matchType = 'siedlecki';
    }
    // 3. Exact normalized title match
    else if (song.normalizedTitle === q) {
      score = 800;
      matchType = 'title';
    }
    // 4. Title starts with query
    else if (song.normalizedTitle?.startsWith(q)) {
      score = 700 + (q.length / (song.normalizedTitle?.length || 1)) * 100;
      matchType = 'titlePrefix';
    }
    // 5. Title contains query
    else if (song.normalizedTitle?.includes(q)) {
      score = 500 + (q.length / (song.normalizedTitle?.length || 1)) * 100;
      matchType = 'title';
    }
    // 6. Search tokens match
    else if (song.searchTokens?.some(t => t.startsWith(q) || t.includes(q))) {
      const bestTokenMatch = song.searchTokens.find(t => t.startsWith(q));
      score = bestTokenMatch ? 400 : 300;
      matchType = 'token';
    }
    // 7. Full search text match
    else if (song.searchText?.includes(q)) {
      score = 200;
      matchType = 'token';
    }
    // 8. Content search (optional, expensive)
    else if (searchContent) {
      const inContent = song.verses.some(v =>
        (v.normalizedText || normalizeText(v.text)).includes(q)
      );
      if (inContent) {
        score = 100;
        matchType = 'content';
      }
    }

    if (score > 0) {
      results.push({ song, score, matchType });
    }
  }

  // Sort by score descending, then by sortKey
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.song.sortKey || '').localeCompare(b.song.sortKey || '', 'pl');
  });

  return results.slice(0, limit);
}

/** Get quick summary info for a song (for search result display) */
export function getSongSummary(song: Song): {
  songNumber: number;
  title: string;
  siedleckiNumber: string | undefined;
  firstLine: string;
  sectionCount: number;
  slideCount: number;
} {
  const firstVerse = song.verses[0];
  const firstLine = firstVerse?.text.split('\n')[0]?.trim() || '';

  return {
    songNumber: song.songNumber || 0,
    title: song.title,
    siedleckiNumber: song.siedleckiNumber,
    firstLine: firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine,
    sectionCount: song.verses.length,
    slideCount: song.projectorDisplaySlides?.length ||
      song.verses.reduce((sum, v) => sum + (v.projector?.slideCount || 1), 0),
  };
}
