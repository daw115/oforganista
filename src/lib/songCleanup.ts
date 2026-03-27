import type { Song } from '@/types/projector';

/**
 * Find duplicate songs by normalized title
 */
export function findDuplicates(songs: Song[]): Map<string, Song[]> {
  const normalize = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

  const groups = new Map<string, Song[]>();
  for (const song of songs) {
    const key = normalize(song.title);
    if (!key) continue;
    const arr = groups.get(key) || [];
    arr.push(song);
    groups.set(key, arr);
  }

  // Only return groups with duplicates
  const dupes = new Map<string, Song[]>();
  for (const [key, arr] of groups) {
    if (arr.length > 1) dupes.set(key, arr);
  }
  return dupes;
}

/**
 * Find songs with no verses or all empty verses
 */
export function findEmptySongs(songs: Song[]): Song[] {
  return songs.filter(
    s => s.verses.length === 0 || s.verses.every(v => !v.text.trim())
  );
}

/**
 * Clean up verse formatting:
 * - Remove leading/trailing blank lines
 * - Collapse multiple blank lines into one
 * - Trim each line
 */
/**
 * Clean up verse formatting:
 * - Trim each line, collapse multiple spaces
 * - Remove single blank lines (just noise)
 * - Preserve double blank lines as-is (they mark slide boundaries)
 * - Remove leading/trailing blank lines
 */
export function cleanVerseText(text: string): string {
  // First trim lines and collapse multiple spaces
  let result = text
    .split('\n')
    .map(l => l.trim().replace(/\s{2,}/g, ' '))
    .join('\n');

  // Split numbered sub-verses that got concatenated onto one line
  // e.g. "Jezu mój kochany! 2. Jezu, na modlitwie" → split before "2."
  result = result.replace(/([.!?*])\s+(\d+\.\s)/g, '$1\n$2');

  // Collapse 3+ blank lines into 2 (preserve double blanks as slide boundaries)
  result = result.replace(/\n{3,}/g, '\n\n');

  // Remove leading/trailing blank lines
  return result.replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Apply formatting cleanup to all songs, returns count of modified songs
 */
export function cleanAllFormatting(songs: Song[]): { cleaned: Song[]; modifiedCount: number } {
  let modifiedCount = 0;
  const cleaned = songs.map(song => {
    let modified = false;
    const verses = song.verses.map(v => {
      const cleanedText = cleanVerseText(v.text);
      if (cleanedText !== v.text) modified = true;
      return { ...v, text: cleanedText };
    });
    if (modified) modifiedCount++;
    return modified ? { ...song, verses } : song;
  });
  return { cleaned, modifiedCount };
}

/**
 * Find songs with very little text (total char count below threshold)
 */
export function findShortSongs(songs: Song[], maxChars = 80): Song[] {
  return songs.filter(s => {
    const totalChars = s.verses.reduce((sum, v) => sum + v.text.trim().length, 0);
    return totalChars > 0 && totalChars <= maxChars;
  });
}

/**
 * Find songs with verses exceeding a max line count (won't fit on one slide)
 */
export function findLongVerses(songs: Song[], maxLines = 6): { song: Song; verseIndex: number; lineCount: number }[] {
  const results: { song: Song; verseIndex: number; lineCount: number }[] = [];
  for (const song of songs) {
    for (let i = 0; i < song.verses.length; i++) {
      const lines = song.verses[i].text.split('\n').filter(l => l.trim()).length;
      if (lines > maxLines) {
        results.push({ song, verseIndex: i, lineCount: lines });
      }
    }
  }
  return results;
}

/**
 * Score a line as a split point (higher = better place to break).
 * Based on Polish language punctuation rules.
 */
function splitScore(line: string): number {
  const trimmed = line.trimEnd();
  if (!trimmed) return 100; // blank line = best split
  if (/[.!?]$/.test(trimmed)) return 80;  // sentence end
  if (/[.!?][""\u201D]$/.test(trimmed)) return 80;
  if (/[;:]$/.test(trimmed)) return 60;   // clause end
  if (/[,]$/.test(trimmed)) return 40;    // comma
  if (/[-–—]$/.test(trimmed)) return 30;  // dash
  return 0; // no punctuation — bad split point
}

/**
 * Split an array of lines into chunks of maxLines or fewer,
 * preferring to break at natural Polish language boundaries.
 */
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

    // Look for best split point within the window [start, start+maxLines)
    let bestIdx = start + maxLines - 1; // default: hard cut at max
    let bestScore = -1;

    // Prefer splitting at even line counts (couplets: 2, 4, 6 lines)
    // Search from line (start+2) to (start+maxLines-1)
    for (let i = start + 1; i < start + maxLines && i < lines.length; i++) {
      const linesInSlide = i - start + 1;
      let score = splitScore(lines[i]);
      // Bonus for even line counts (keeps couplets together)
      if (linesInSlide % 2 === 0) score += 10;
      // Slight preference for fuller slides (4-6 lines over 2-3)
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

/**
 * Restructure a song: flatten all verses into continuous text,
 * clean it, then re-split into slides of max 6 lines following
 * Polish language splitting rules.
 */
export function restructureSongs(songs: Song[], maxLines = 7): {
  cleaned: Song[];
  modifiedCount: number;
  totalSlides: number;
} {
  let modifiedCount = 0;
  let totalSlides = 0;

  const cleaned = songs.map(song => {
    if (song.verses.length === 0) return song;

    let modified = false;
    const newVerses = song.verses.map(verse => {
      const lines = verse.text
        .split('\n')
        .map(l => l.trim().replace(/\s{2,}/g, ' '));

      // Remove leading/trailing empty lines but preserve internal structure
      while (lines.length > 0 && !lines[0].trim()) lines.shift();
      while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

      const cleanedText = lines.join('\n');
      if (cleanedText !== verse.text) modified = true;

      // Count slides this verse will need
      const contentLines = lines.filter(l => l.trim());
      const slideCount = Math.max(1, Math.ceil(contentLines.length / maxLines));
      totalSlides += slideCount;

      return { ...verse, text: cleanedText };
    });

    if (modified) modifiedCount++;
    return modified ? { ...song, verses: newVerses } : song;
  });

  return { cleaned, modifiedCount, totalSlides };
}

/**
 * Remove duplicates keeping the one with the most verses
 */
export function deduplicateSongs(songs: Song[]): { cleaned: Song[]; removedCount: number } {
  const dupes = findDuplicates(songs);
  const idsToRemove = new Set<string>();

  for (const [, arr] of dupes) {
    // Keep the one with most content
    const sorted = [...arr].sort((a, b) => {
      const aContent = a.verses.reduce((sum, v) => sum + v.text.length, 0);
      const bContent = b.verses.reduce((sum, v) => sum + v.text.length, 0);
      return bContent - aContent;
    });
    // Remove all except the first (most content)
    for (let i = 1; i < sorted.length; i++) {
      idsToRemove.add(sorted[i].id);
    }
  }

  return {
    cleaned: songs.filter(s => !idsToRemove.has(s.id)),
    removedCount: idsToRemove.size,
  };
}

/**
 * Detect songs whose title is a liturgical day name (e.g. "2 Niedziela Adwentu",
 * "Środa Popielcowa", "Uroczystość Najświętszego Ciała i Krwi Chrystusa").
 * These are typically imported psalm entries named after the liturgical day.
 */
const LITURGICAL_PATTERNS = [
  /^\d+\s*niedziela/i,
  /niedziela\s+(adwentu|wielkanocna|wielkiego\s+postu|zwyk[łl]a)/i,
  /^(poniedzia[łl]ek|wtorek|[sś]roda|czwartek|pi[aą]tek|sobota)\s+(wielk|[śs]wi[eę]t)/i,
  /[sś]roda\s+popielcowa/i,
  /niedziela\s+palmowa/i,
  /^uroczysto[sś][cć]/i,
  /^[sś]wi[eę]to\s+/i,
  /^wspomnienie\s+/i,
  /wielki\s+(czwartek|pi[aą]tek)/i,
  /wigilia\s+paschalna/i,
  /^triduum/i,
  /^\d+\s*(tydzie[nń]|dzie[nń])\s+(adwentu|wielk|zwyk)/i,
];

export function findLiturgicalDaySongs(songs: Song[]): Song[] {
  return songs.filter(s =>
    LITURGICAL_PATTERNS.some(p => p.test(s.title))
  );
}

/**
 * Find psalm refrains — songs where the title is (nearly) identical to the verse text,
 * OR songs with liturgical day titles (these are imported psalm entries).
 */
export function findPsalmRefrains(songs: Song[]): Song[] {
  const norm = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  const liturgicalIds = new Set(findLiturgicalDaySongs(songs).map(s => s.id));

  return songs.filter(s => {
    // Liturgical day title
    if (liturgicalIds.has(s.id)) return true;
    // Title = content match
    if (s.verses.length === 0) return false;
    const titleNorm = norm(s.title);
    if (!titleNorm) return false;
    const allText = norm(s.verses.map(v => v.text.trim()).join(' '));
    return allText === titleNorm;
  });
}

/**
 * For each psalm refrain, find other songs whose normalized title matches.
 * Returns a map: psalm refrain id -> matching regular songs
 */
export function findPsalmDuplicatesInLibrary(psalmRefrains: Song[], allSongs: Song[]): Map<string, Song[]> {
  const norm = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  const psalmIds = new Set(psalmRefrains.map(s => s.id));

  // Build index of non-psalm songs by normalized title
  const titleIndex = new Map<string, Song[]>();
  for (const song of allSongs) {
    if (psalmIds.has(song.id)) continue;
    const key = norm(song.title);
    if (!key) continue;
    const arr = titleIndex.get(key) || [];
    arr.push(song);
    titleIndex.set(key, arr);
  }

  const result = new Map<string, Song[]>();
  for (const psalm of psalmRefrains) {
    const key = norm(psalm.title);
    const matches = titleIndex.get(key);
    if (matches && matches.length > 0) {
      result.set(psalm.id, matches);
    }
  }
  return result;
}
