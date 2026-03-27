import { toYMD } from './dateUtils';

export interface SuggestedSong {
  title: string;
  section: string;
  note?: string;
  url?: string;
}

export interface SuggestedSection {
  name: string;
  songs: SuggestedSong[];
}

export interface LiturgyData {
  psalmRefrain: string;
  psalmText: string;
  acclamationRefrain: string;
  acclamationText: string;
}

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

export async function fetchSuggestedSongs(date: Date): Promise<{ sections: SuggestedSection[]; liturgy: LiturgyData | null }> {
  const url = `https://musicamsacram.pl/propozycje-spiewow/dzien/${toYMD(date)}`;
  const resp = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
  if (!resp.ok) throw new Error(`Błąd pobierania: ${resp.status}`);
  const html = await resp.text();
  const sections = parseSuggestionsHtml(html);
  const liturgy = parseLiturgyData(html);
  return { sections, liturgy };
}

function parseSuggestionsHtml(html: string): SuggestedSection[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const sections: SuggestedSection[] = [];

  const headers = doc.querySelectorAll('h2.page-header');
  headers.forEach(h2 => {
    const name = h2.textContent?.trim() || '';
    if (!name.startsWith('Śpiew na')) return;

    const tableContainer = h2.nextElementSibling;
    if (!tableContainer) return;

    const table = tableContainer.tagName === 'TABLE'
      ? tableContainer
      : tableContainer.querySelector('table');
    if (!table) return;

    const songs: SuggestedSong[] = [];
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(tr => {
      const td = tr.querySelector('td');
      if (!td) return;

      const link = td.querySelector('a');
      const title = link?.textContent?.trim() || td.childNodes[0]?.textContent?.trim() || '';
      if (!title || title === '-') return;

      const small = td.querySelector('small em');
      const note = small?.textContent?.trim() || undefined;
      const url = link?.getAttribute('href') || undefined;

      songs.push({ title, section: name, note, url });
    });

    if (songs.length > 0) {
      sections.push({ name, songs });
    }
  });

  return sections;
}

function stripHtmlWithBreaks(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseLiturgyData(html: string): LiturgyData | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let psalmRefrain = '';
  let psalmText = '';
  let acclamationRefrain = '';
  let acclamationText = '';

  const readingsRoot = doc.querySelector('#nd_liturgia_czytania');
  if (readingsRoot) {
    const allP = Array.from(readingsRoot.querySelectorAll('p'));
    let section: 'psalm' | 'acclamation' | null = null;

    for (const p of allP) {
      const text = p.textContent?.trim() || '';

      if (p.classList.contains('nd_czytanie_nazwa')) {
        if (text === 'Psalm') section = 'psalm';
        else if (text === 'Aklamacja') section = 'acclamation';
        else section = null;
        continue;
      }

      if (section === 'psalm') {
        if (p.classList.contains('nd_psalm_refren') && !psalmRefrain) {
          psalmRefrain = text;
        }
        if (p.classList.contains('nd_psalm')) {
          const stanza = stripHtmlWithBreaks(p.innerHTML);
          if (stanza) {
            if (psalmText) psalmText += '\n\n';
            psalmText += stanza;
          }
        }
      }

      if (section === 'acclamation') {
        if (p.classList.contains('nd_psalm_refren') && !acclamationRefrain) {
          acclamationRefrain = text;
        }
        if (p.classList.contains('nd_czytanie_tresc')) {
          acclamationText = stripHtmlWithBreaks(p.innerHTML);
        }
      }
    }
  }

  // Fallback 1: parse by regex between headers if DOM structure differs
  if (!psalmRefrain || !acclamationRefrain) {
    const psalmBlock = html.match(/<p class="nd_czytanie_nazwa">Psalm<\/p>([\s\S]*?)<p class="nd_czytanie_nazwa">Aklamacja<\/p>/i)?.[1] || '';
    const acclBlock = html.match(/<p class="nd_czytanie_nazwa">Aklamacja<\/p>([\s\S]*?)<p class="nd_czytanie_nazwa">Ewangelia<\/p>/i)?.[1] || '';

    if (!psalmRefrain) {
      const match = psalmBlock.match(/<p class="nd_psalm_refren">([\s\S]*?)<\/p>/i);
      if (match) psalmRefrain = stripHtmlWithBreaks(match[1]);
    }

    if (!psalmText) {
      const matches = Array.from(psalmBlock.matchAll(/<p class="nd_psalm">([\s\S]*?)<\/p>/gi));
      psalmText = matches.map(m => stripHtmlWithBreaks(m[1])).filter(Boolean).join('\n\n');
    }

    if (!acclamationRefrain) {
      const match = acclBlock.match(/<p class="nd_psalm_refren">([\s\S]*?)<\/p>/i);
      if (match) acclamationRefrain = stripHtmlWithBreaks(match[1]);
    }

    if (!acclamationText) {
      const match = acclBlock.match(/<p class="nd_czytanie_tresc">([\s\S]*?)<\/p>/i);
      if (match) acclamationText = stripHtmlWithBreaks(match[1]);
    }
  }

  // Fallback 2: extract psalm refrain from summary header line
  if (!psalmRefrain) {
    const summaryPsalm = doc.querySelector('#nd_liturgia_naglowek p.nd_wstep .nd_sigla')?.textContent?.trim() || '';
    if (summaryPsalm.includes(')')) {
      const match = summaryPsalm.match(/\)\s*(.+)$/);
      if (match) psalmRefrain = match[1].trim();
    }
  }

  if (!psalmRefrain && !acclamationRefrain) return null;

  return { psalmRefrain, psalmText, acclamationRefrain, acclamationText };
}

/** Normalize text for fuzzy matching — keep only letters */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u0142/g, 'l') // ł (not caught by NFD)
    .replace(/[^a-z]/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

/** Find best match for a suggested song title in the local database.
 *  Priority: 1) exact title match, 2) full phrase in title, 3) prefix title, 4) word match in title, 5) strict content fallback
 */
export function findMatch(
  suggestedTitle: string,
  songTitles: { id: string; title: string }[],
  fullSongs?: { id: string; verses: { text: string }[] }[],
): { id: string; title: string } | null {
  const norm = normalize(suggestedTitle);
  if (!norm) return null;

  // 1. Exact title match
  for (const s of songTitles) {
    if (normalize(s.title) === norm) return s;
  }

  // 2. Full phrase contained in title or title contained in phrase
  for (const s of songTitles) {
    const sn = normalize(s.title);
    if (sn.includes(norm) || norm.includes(sn)) return s;
  }

  // 3. Prefix match
  for (const s of songTitles) {
    const sn = normalize(s.title);
    if (sn.startsWith(norm) || norm.startsWith(sn)) return s;
  }

  // 4. All significant words present in title (min 4 chars to avoid "nie", "pan", etc.)
  const words = norm.split(/\s+/).filter(w => w.length >= 4);
  if (words.length >= 2) {
    for (const s of songTitles) {
      const sn = normalize(s.title);
      if (words.every(w => sn.includes(w))) return s;
    }
  }

  // 5. Content/verse search — very strict: require all long words (5+ chars) and at least 3 of them
  if (fullSongs) {
    const longWords = norm.split(/\s+/).filter(w => w.length >= 5);
    if (longWords.length >= 3) {
      for (const fs of fullSongs) {
        const allText = normalize(fs.verses.map(v => v.text).join(' '));
        if (longWords.every(w => allText.includes(w))) {
          const titleEntry = songTitles.find(s => s.id === fs.id);
          if (titleEntry) return titleEntry;
        }
      }
    }
  }

  return null;
}

/** Psalm matching — strict title-only to avoid matching collection songs.
 * Priority: 1) exact title 1:1, 2) title contains full refrain or vice versa.
 * NO content/verse search — avoids false positives from "REFRENY PSALMÓW" collections.
 */
export function findPsalmMatch(
  refrain: string,
  songTitles: { id: string; title: string }[],
  _fullSongs?: { id: string; verses: { text: string }[] }[],
): { id: string; title: string } | null {
  const norm = normalize(refrain);
  if (!norm || norm.length < 5) return null;

  // 1) exact title 1:1
  for (const s of songTitles) {
    if (normalize(s.title) === norm) return s;
  }

  // 2) title contains full refrain phrase or refrain contains full title
  // Skip collection/aggregate titles (containing "refreny", "psalmy" etc.)
  for (const s of songTitles) {
    const sn = normalize(s.title);
    if (sn.includes('refreny') || sn.includes('psalmy')) continue;
    if (sn.length < 5) continue;
    if (sn.includes(norm) || norm.includes(sn)) return s;
  }

  return null;
}
