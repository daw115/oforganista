import type { Song, Verse } from '@/types/projector';

// Load sql.js — tries CDN first, falls back to local files for offline use
async function initSQL(): Promise<any> {
  const cdnJs = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
  const cdnWasm = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm';
  const localJs = `${window.location.origin}/sql-wasm.js`;
  const localWasm = `${window.location.origin}/sql-wasm.wasm`;

  if (!(window as any).initSqlJs) {
    // Try CDN first, fallback to local
    const loaded = await new Promise<'cdn' | 'local'>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = cdnJs;
      script.onload = () => resolve('cdn');
      script.onerror = () => {
        // CDN failed — try local copy
        console.log('[SQL] CDN unavailable, trying local sql-wasm.js...');
        script.remove();
        const localScript = document.createElement('script');
        localScript.src = localJs;
        localScript.onload = () => resolve('local');
        localScript.onerror = () => reject(new Error('Failed to load sql.js from CDN and local'));
        document.head.appendChild(localScript);
      };
      document.head.appendChild(script);
    });
    console.log(`[SQL] Loaded sql.js from ${loaded}`);
  }

  const initSqlJs = (window as any).initSqlJs;
  // Use CDN WASM if online, otherwise local
  return initSqlJs({
    locateFile: () => {
      // Check if we loaded from local — use local WASM too
      return navigator.onLine ? cdnWasm : localWasm;
    },
  });
}

// Parse OpenLP SQLite from File or ArrayBuffer
export async function parseOpenLpDatabase(input: File | ArrayBuffer): Promise<Song[]> {
  const SQL = await initSQL();
  const buffer = input instanceof File ? await input.arrayBuffer() : input;
  const db = new SQL.Database(new Uint8Array(buffer));
  const songs: Song[] = [];

  try {
    // Discover available tables
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.length > 0 ? tables[0].values.map((r: any[]) => String(r[0])) : [];
    console.log('OpenLP tables found:', tableNames);

    if (!tableNames.includes('songs')) {
      console.error('No "songs" table found. Tables:', tableNames);
      db.close();
      return songs;
    }

    // Check for authors table
    const hasAuthors = tableNames.includes('authors') && tableNames.includes('authors_songs');

    // Check if verse_order column exists
    let hasVerseOrder = false;
    try {
      const cols = db.exec("PRAGMA table_info(songs)");
      if (cols.length > 0) {
        hasVerseOrder = cols[0].values.some((r: any[]) => String(r[1]) === 'verse_order');
      }
    } catch {}

    let query: string;
    const verseOrderCol = hasVerseOrder ? ", s.verse_order" : ", '' as verse_order";
    if (hasAuthors) {
      query = `
        SELECT s.id, s.title, s.lyrics,
               GROUP_CONCAT(a.display_name, ', ') as authors
               ${verseOrderCol}
        FROM songs s
        LEFT JOIN authors_songs asng ON asng.song_id = s.id
        LEFT JOIN authors a ON a.id = asng.author_id
        GROUP BY s.id
        ORDER BY s.title
      `;
    } else {
      query = `SELECT id, title, lyrics, '' as authors ${verseOrderCol} FROM songs ORDER BY title`;
    }

    const results = db.exec(query);

    if (results.length > 0) {
      for (const row of results[0].values) {
        const id = String(row[0]);
        const title = String(row[1] || '').trim();
        const lyricsRaw = String(row[2] || '');
        const author = row[3] ? String(row[3]).trim() : undefined;
        const verseOrderRaw = row[4] ? String(row[4]).trim() : '';

        if (!title) continue;

        const verses = parseLyricsXml(lyricsRaw);

        // Parse verse_order string (e.g. "v1 c1 v2 c1 v3 c1")
        const displayOrder = verseOrderRaw
          ? verseOrderRaw.split(/\s+/).filter(Boolean)
          : undefined;

        songs.push({
          id,
          title,
          author: author || undefined,
          verses,
          displayOrder,
          searchText: `${title} ${author || ''}`.toLowerCase(),
        });
      }
    }

    console.log(`Parsed ${songs.length} songs from OpenLP database`);
  } catch (e) {
    console.error('Error parsing OpenLP database:', e);
  }

  db.close();
  return songs;
}

// Extract text from a node, converting <br/> to newlines
function extractTextWithBreaks(node: Element): string {
  let result = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (el.tagName.toLowerCase() === 'br') {
        result += '\n';
      } else {
        result += extractTextWithBreaks(el);
      }
    }
  });
  return result;
}

function parseLyricsXml(xml: string): Verse[] {
  const verses: Verse[] = [];
  if (!xml || xml.trim() === '') return verses;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      // Try regex-based CDATA extraction before falling back to plain text
      const cdataVerses = extractVersesByCdata(xml);
      return cdataVerses.length > 0 ? cdataVerses : splitPlainText(xml);
    }

    const verseNodes = doc.querySelectorAll('verse');

    if (verseNodes.length === 0) {
      const cdataVerses = extractVersesByCdata(xml);
      return cdataVerses.length > 0 ? cdataVerses : splitPlainText(xml);
    }

    verseNodes.forEach((node) => {
      const typeAttr = node.getAttribute('type') || 'v';
      const labelAttr = node.getAttribute('label') || '1';

      // Build OpenLP-compatible ref: e.g. "v1", "c1", "b1"
      const ref = `${typeAttr.toLowerCase()}${labelAttr}`;

      let type: Verse['type'] = 'verse';
      let label = '';

      switch (typeAttr.toLowerCase()) {
        case 'c':
          type = 'chorus';
          label = labelAttr === '1' ? 'Refren' : `Refren ${labelAttr}`;
          break;
        case 'v':
          type = 'verse';
          label = `Zwrotka ${labelAttr}`;
          break;
        case 'b':
          type = 'bridge';
          label = labelAttr === '1' ? 'Bridge' : `Bridge ${labelAttr}`;
          break;
        case 'i':
          type = 'intro';
          label = 'Intro';
          break;
        case 'e':
          type = 'outro';
          label = 'Outro';
          break;
        default:
          type = 'other';
          label = `${typeAttr} ${labelAttr}`;
      }

      const linesNodes = node.querySelectorAll('lines');
      let text = '';
      if (linesNodes.length > 0) {
        text = Array.from(linesNodes)
          .map(l => extractTextWithBreaks(l))
          .join('\n');
      } else {
        text = extractTextWithBreaks(node);
      }

      // Clean up: collapse multiple blank lines, trim each line, remove leading/trailing blanks
      text = text
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (text) {
        verses.push({ type, label, text, ref });
      }
    });
  } catch {
    const cdataVerses = extractVersesByCdata(xml);
    return cdataVerses.length > 0 ? cdataVerses : splitPlainText(xml);
  }

  if (verses.length === 0) {
    const cdataVerses = extractVersesByCdata(xml);
    return cdataVerses.length > 0 ? cdataVerses : splitPlainText(xml);
  }

  return verses;
}

/** Regex-based fallback: extract verses from CDATA blocks in OpenLP XML */
function extractVersesByCdata(xml: string): Verse[] {
  const verses: Verse[] = [];
  // Match verse tags with any attribute order
  const re = /<verse\s+([^>]*)>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))\s*<\/verse>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(xml)) !== null) {
    const attrs = match[1];
    const rawText = match[2] || match[3] || '';
    const labelAttr = attrs.match(/label="([^"]*)"/)?.[1] || '1';
    const typeAttr = attrs.match(/type="([^"]*)"/)?.[1] || 'v';
    const ref = `${typeAttr.toLowerCase()}${labelAttr}`;

    let type: Verse['type'] = 'verse';
    let label = '';

    switch (typeAttr.toLowerCase()) {
      case 'c': type = 'chorus'; label = labelAttr === '1' ? 'Refren' : `Refren ${labelAttr}`; break;
      case 'v': type = 'verse'; label = `Zwrotka ${labelAttr}`; break;
      case 'b': type = 'bridge'; label = labelAttr === '1' ? 'Bridge' : `Bridge ${labelAttr}`; break;
      case 'i': type = 'intro'; label = 'Intro'; break;
      case 'e': type = 'outro'; label = 'Outro'; break;
      default: type = 'other'; label = `${typeAttr} ${labelAttr}`;
    }

    const text = rawText
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map(l => l.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (text) {
      verses.push({ type, label, text, ref });
    }
  }

  return verses;
}

function splitPlainText(text: string): Verse[] {
  const parts = text.split(/\n\n+/).filter(p => p.trim());
  if (parts.length === 0 && text.trim()) {
    return [{ type: 'verse', label: 'Zwrotka 1', text: text.trim() }];
  }
  return parts.map((part, i) => ({
    type: 'verse' as const,
    label: `Zwrotka ${i + 1}`,
    text: part.trim(),
  }));
}

// Fetch bundled database from public folder
export async function fetchBundledDatabase(): Promise<Song[]> {
  const response = await fetch('/songs.sqlite');
  if (!response.ok) throw new Error('Failed to fetch bundled database');
  const buffer = await response.arrayBuffer();
  return parseOpenLpDatabase(buffer);
}

// Check if local OpenLP database is available (via serve.cjs or Vite plugin)
export async function checkLocalDatabase(): Promise<{ available: boolean; path: string | null }> {
  try {
    const res = await fetch('/local-db-info');
    if (!res.ok) return { available: false, path: null };
    return await res.json();
  } catch {
    return { available: false, path: null };
  }
}

// Fetch local OpenLP database from disk (via serve.cjs or Vite plugin)
export async function fetchLocalDatabase(): Promise<Song[]> {
  const response = await fetch('/local-db');
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Nie można pobrać lokalnej bazy OpenLP');
  }
  const buffer = await response.arrayBuffer();
  return parseOpenLpDatabase(buffer);
}
