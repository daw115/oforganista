/**
 * Projector Layout Engine
 * 
 * Measures text width using canvas and splits song sections
 * into projector-ready slides based on the church readability preset.
 */

import type { Song, Verse, ProjectorSlide, ProjectorSectionData } from '@/types/projector';

// ─── Preset ────────────────────────────────────────────────────────────────

export interface ProjectorPreset {
  name: string;
  resolution: { width: number; height: number };
  fontFamily: string;
  fontWeight: number;
  fontSizePx: number;
  lineHeight: number;
  letterSpacingEm: number;
  textTransform: 'none' | 'uppercase';
  textAlign: 'center' | 'justify';
  hyphens: 'none' | 'auto';
  whiteSpace: string;
  overflowWrap: string;
  wordBreak: string;
  containerPadding: string; // CSS value
  textWidthPercent: number;
  maxLines: number;
  background: string;
  textColor: string;
  strokePx: number;
  strokeColor: string;
  textShadow: string[];
}

export const CHURCH_PRESET: ProjectorPreset = {
  name: 'church_readability_v3',
  resolution: { width: 1280, height: 768 },
  fontFamily: '"Arial Black", Arial, "Helvetica Neue", sans-serif',
  fontWeight: 900,
  fontSizePx: 72,
  lineHeight: 1.28,
  letterSpacingEm: 0.015,
  textTransform: 'none',
  textAlign: 'center',
  hyphens: 'none',
  whiteSpace: 'pre-line',
  overflowWrap: 'normal',
  wordBreak: 'normal',
  containerPadding: '2vh 1vw',
  textWidthPercent: 98,
  maxLines: 9,
  background: '#000000',
  textColor: '#FFFFFF',
  strokePx: 2,
  strokeColor: 'rgba(0,0,0,0.65)',
  textShadow: [
    '0 2px 10px rgba(0,0,0,0.9)',
  ],
};

// ─── Text measurement (canvas-based) ───────────────────────────────────────

let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCtx(preset: ProjectorPreset): CanvasRenderingContext2D {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _ctx = _canvas.getContext('2d')!;
  }
  const ls = preset.letterSpacingEm * preset.fontSizePx;
  // Canvas doesn't support letter-spacing natively, we compensate in measureText
  _ctx!.font = `${preset.fontWeight} ${preset.fontSizePx}px ${preset.fontFamily}`;
  return _ctx!;
}

function measureTextWidth(text: string, preset: ProjectorPreset): number {
  const ctx = getCtx(preset);
  const base = ctx.measureText(text).width;
  // Add letter-spacing: (charCount - 1) * spacing
  const ls = preset.letterSpacingEm * preset.fontSizePx;
  return base + Math.max(0, text.length - 1) * ls;
}

function getMaxLineWidth(preset: ProjectorPreset): number {
  const { width } = preset.resolution;
  // container padding: 3vw each side = 6vw total
  const hPadding = width * 0.06; // 3vw * 2
  const usable = width - hPadding;
  return usable * (preset.textWidthPercent / 100);
}

// ─── Normalization ─────────────────────────────────────────────────────────

export function normalizeSpaces(text: string): string {
  return text
    .split('\n')
    .map(l => l.trim().replace(/\s{2,}/g, ' '))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

// ─── Phrase splitting (natural boundaries) ─────────────────────────────────

/**
 * Split text into phrases at natural boundaries.
 * Preserves explicit newlines as phrase separators.
 */
export function splitPhrases(text: string): string[] {
  // First split by explicit newlines
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return rawLines;
}

// ─── Word-level line wrapping ──────────────────────────────────────────────

/**
 * Wrap a single line of text to fit within maxWidth.
 * Never breaks words. Returns array of wrapped lines.
 */
export function wrapLineToWidth(
  line: string,
  preset: ProjectorPreset,
  maxWidth: number,
): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = current + ' ' + words[i];
    if (measureTextWidth(candidate, preset) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

// ─── Slide splitting (punctuation-aware) ───────────────────────────────────

function splitScore(line: string): number {
  const t = line.trimEnd();
  if (!t) return 100;
  if (/[.!?]$/.test(t)) return 80;
  if (/[.!?][""\u201D]$/.test(t)) return 80;
  if (/[;:]$/.test(t)) return 60;
  if (/[,]$/.test(t)) return 40;
  if (/[-–—]$/.test(t)) return 30;
  if (/[*]$/.test(t)) return 50;
  return 0;
}

function splitLinesIntoSlides(lines: string[], maxLines: number): string[][] {
  if (lines.length <= maxLines) return [lines];

  const slides: string[][] = [];
  let start = 0;

  while (start < lines.length) {
    const remaining = lines.length - start;
    if (remaining <= maxLines) {
      slides.push(lines.slice(start));
      break;
    }

    let bestIdx = start + maxLines - 1;
    let bestScore = -1;

    for (let i = start + 1; i < start + maxLines && i < lines.length; i++) {
      const linesInSlide = i - start + 1;
      let score = splitScore(lines[i]);
      if (linesInSlide % 2 === 0) score += 10;
      if (linesInSlide >= 4) score += 5;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    slides.push(lines.slice(start, bestIdx + 1));
    start = bestIdx + 1;
  }

  return slides;
}

// ─── Section → Slides ──────────────────────────────────────────────────────

/**
 * Process a single section (verse/chorus) into projector slides.
 */
export function splitSectionToSlides(
  text: string,
  preset: ProjectorPreset = CHURCH_PRESET,
): ProjectorSectionData {
  const normalized = normalizeSpaces(text);
  const maxWidth = getMaxLineWidth(preset);
  const phrases = splitPhrases(normalized);

  // Wrap all phrases into display lines
  const allLines: string[] = [];
  for (const phrase of phrases) {
    const wrapped = wrapLineToWidth(phrase, preset, maxWidth);
    allLines.push(...wrapped);
  }

  // Split into slides respecting maxLines
  const slideGroups = splitLinesIntoSlides(allLines, preset.maxLines);

  const slides: ProjectorSlide[] = slideGroups.map((lines, i) => ({
    slideNo: i + 1,
    lines,
    text: lines.join('\n'),
    lineCount: lines.length,
  }));

  return {
    fitsSingleSlide: slides.length <= 1,
    slideCount: slides.length,
    slides,
  };
}

// ─── Song-level preparation ────────────────────────────────────────────────

/**
 * Prepare projector data for a single song.
 * Adds `projector` field to each section and metadata to the song.
 */
export function prepareProjectorData(
  song: Song,
  preset: ProjectorPreset = CHURCH_PRESET,
): Song {
  const verses = song.verses.map(v => ({
    ...v,
    projector: splitSectionToSlides(v.text, preset),
  }));

  return {
    ...song,
    verses,
    projectorPresetName: preset.name,
    projectorPreparedAt: new Date().toISOString(),
    projectorVersion: 1,
  };
}

/**
 * Prepare projector data for all songs in an array.
 */
export function prepareProjectorDataForAllSongs(
  songs: Song[],
  preset: ProjectorPreset = CHURCH_PRESET,
): { songs: Song[]; totalSlides: number; modified: number } {
  let totalSlides = 0;
  let modified = 0;

  const result = songs.map(song => {
    const prepared = prepareProjectorData(song, preset);
    const slideCount = prepared.verses.reduce((sum, v) => sum + (v.projector?.slideCount || 1), 0);
    totalSlides += slideCount;

    // Check if actually changed
    const hadProjector = song.verses.every(v => v.projector);
    if (!hadProjector) modified++;

    return prepared;
  });

  return { songs: result, totalSlides, modified };
}

/**
 * Check if a song needs projector data recalculation.
 */
export function needsProjectorUpdate(song: Song, preset: ProjectorPreset = CHURCH_PRESET): boolean {
  if (!song.projectorPresetName || song.projectorPresetName !== preset.name) return true;
  if (!song.projectorPreparedAt) return true;
  return song.verses.some(v => !v.projector);
}

/**
 * Get the flat list of all slides for a song (for display/navigation).
 * Respects displayOrder (verse_order) if available.
 */
export function getSongSlides(song: Song): { verseIndex: number; slideIndex: number; slide: ProjectorSlide; verse: Verse }[] {
  const result: { verseIndex: number; slideIndex: number; slide: ProjectorSlide; verse: Verse }[] = [];

  // Resolve ordered verses using displayOrder if available.
  // IMPORTANT: if refs are ambiguous (duplicates), use raw verse order to avoid losing sections.
  let orderedVerses: { verse: Verse; originalIndex: number }[];

  const refCounts = new Map<string, number>();
  for (const v of song.verses) {
    if (!v.ref) continue;
    refCounts.set(v.ref, (refCounts.get(v.ref) ?? 0) + 1);
  }
  const hasDuplicateRefs = Array.from(refCounts.values()).some(count => count > 1);

  if (song.displayOrder && song.displayOrder.length > 0 && !hasDuplicateRefs) {
    orderedVerses = [];
    for (const ref of song.displayOrder) {
      const idx = song.verses.findIndex(v => v.ref === ref);
      if (idx >= 0) orderedVerses.push({ verse: song.verses[idx], originalIndex: idx });
    }

    // Fallback when displayOrder is invalid/incomplete
    if (orderedVerses.length === 0 || orderedVerses.length < Math.min(song.verses.length, song.displayOrder.length)) {
      orderedVerses = song.verses.map((v, i) => ({ verse: v, originalIndex: i }));
    }
  } else {
    // Natural order = exactly as entered in song editor/import
    orderedVerses = song.verses.map((v, i) => ({ verse: v, originalIndex: i }));
  }

  for (const { verse, originalIndex } of orderedVerses) {
    const projector = verse.projector;
    if (projector && projector.slides.length > 0) {
      for (let si = 0; si < projector.slides.length; si++) {
        result.push({ verseIndex: originalIndex, slideIndex: si, slide: projector.slides[si], verse });
      }
    } else {
      // Fallback: treat the whole verse text as one slide
      result.push({
        verseIndex: originalIndex,
        slideIndex: 0,
        slide: { slideNo: 1, lines: verse.text.split('\n'), text: verse.text, lineCount: verse.text.split('\n').length },
        verse,
      });
    }
  }

  return result;
}
