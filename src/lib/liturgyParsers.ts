/**
 * Liturgy parsers — ported from ofiarowanie-app
 * Covers: MusicamSacram songs, Brewiarz readings, Brewiarz calendar card
 */

import { toYMD } from './dateUtils';
import { fetchMusicamSacramAuthenticated } from './musicamAuth';
import { supabase } from '@/integrations/supabase/client';

// ──── Helpers ────────────────────────────────────────────────

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function splitSongTitleInlineNote(raw: string) {
  const text = cleanText(raw || '');
  if (!text) return { title: '', inlineNote: '' };
  const match = text.match(/^(.*?)([Ww]\s*nawi[aą]zaniu do\s+.+)$/i);
  if (match && match[1] && match[1].trim().length > 1) {
    return { title: cleanText(match[1]), inlineNote: cleanText(match[2]) };
  }
  return { title: text, inlineNote: '' };
}

function normalizeSlTitle(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:!?()\[\]{}"'`´'""„…\-_/\\]+/g, ' ')
    .replace(/^\d+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Multi-source fetching with encoding detection (ISO-8859-2 / UTF-8)
async function fetchHtml(url: string, force = false): Promise<string> {
  const finalUrl = force ? `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}` : url;
  const res = await fetch(finalUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const utf8 = new TextDecoder().decode(bytes);
  const iso = new TextDecoder('iso-8859-2').decode(bytes);
  const score = (txt: string) => {
    const replacement = (txt.match(/\uFFFD/g) || []).length;
    const mojibake = (txt.match(/[ÃÅÄ]/g) || []).length;
    const polish = (txt.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g) || []).length;
    return replacement * 10 + mojibake * 3 - polish;
  };
  if (ct.includes('iso-8859-2')) return iso;
  if (ct.includes('utf-8')) return utf8;
  return score(utf8) <= score(iso) ? utf8 : iso;
}

function codetabsProxyUrl(url: string): string {
  return `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
}

async function fetchHtmlFromSources(url: string, force = false): Promise<string> {
  const sources = [
    url,
    codetabsProxyUrl(url),
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];
  let lastError: unknown;
  for (const source of sources) {
    try {
      const html = await fetchHtml(source, force);
      if ((html || '').trim().length > 0) return html;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Nie udało się pobrać danych');
}

function extractMetaRefreshTarget(html: string, baseUrl: string): string | null {
  const match =
    html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>]+)["'][^>]*>/i) ||
    html.match(/<meta[^>]+content=["'][^"']*url=([^"'>]+)["'][^>]*http-equiv=["']?refresh["']?[^>]*>/i);
  if (!match || !match[1]) return null;
  try {
    return new URL(match[1].trim(), baseUrl).toString();
  } catch {
    return null;
  }
}

// ──── SONGS (musicamsacram.pl) ───────────────────────────────

export interface SongItem {
  title: string;
  url: string;
  note: string;
  sl: string;
  siedl: string;
  dn: string;
}

export interface SongSection {
  name: string;
  items: SongItem[];
}

export interface SongSet {
  name: string;
  sections: SongSection[];
}

export interface SongsData {
  title: string;
  sets: SongSet[];
  sourceUrl: string;
}

export async function fetchSongs(date: Date): Promise<SongsData> {
  const sourceUrl = `https://musicamsacram.pl/propozycje-spiewow/dzien/${toYMD(date)}`;
  // Use authenticated fetch to get all tabs (multiple liturgical options)
  const html = await fetchMusicamSacramAuthenticated(sourceUrl);
  return parseSongsHtml(html, sourceUrl);
}

function parseSongsHtml(html: string, sourceUrl: string): SongsData {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = cleanText(doc.querySelector('title')?.textContent || 'Propozycje śpiewów');

  const extractSongTitle = (cell: HTMLElement, link: HTMLAnchorElement | null): string => {
    if (link) {
      const linkClone = link.cloneNode(true) as HTMLElement;
      linkClone.querySelectorAll('small, span, em, i').forEach((el) => el.remove());
      const t = splitSongTitleInlineNote(cleanText(linkClone.textContent || '')).title;
      if (t) return t;
    }
    const htmlBeforeBreak = (cell.innerHTML || '').split(/<br\s*\/?>/i)[0] || '';
    if (htmlBeforeBreak.trim()) {
      const tmp = new DOMParser().parseFromString(`<div>${htmlBeforeBreak}</div>`, 'text/html');
      const t = splitSongTitleInlineNote(cleanText(tmp.body.textContent || '')).title;
      if (t) return t;
    }
    const clone = cell.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('small, span, em, i').forEach((el) => el.remove());
    return splitSongTitleInlineNote(cleanText(clone.textContent || '')).title;
  };

  const extractSongNote = (cell: HTMLElement): string => {
    const chunks: string[] = [];
    cell.querySelectorAll('small, span').forEach((el) => {
      const txt = cleanText(el.textContent || '');
      if (txt) chunks.push(txt);
    });
    if (chunks.length === 0) {
      cell.querySelectorAll('em, i').forEach((el) => {
        if (el.closest('small, span')) return;
        const txt = cleanText(el.textContent || '');
        if (txt) chunks.push(txt);
      });
    }
    return cleanText(chunks.join(' '));
  };

  const parseSectionItems = (root: ParentNode): SongSection[] => {
    const sectionHeaders = Array.from(root.querySelectorAll('h2.page-header'));
    const sections: SongSection[] = [];
    for (const header of sectionHeaders) {
      const name = cleanText(header.textContent || '');
      if (!name || !/^Śpiew /i.test(name)) continue;
      const table = header.nextElementSibling?.querySelector('table');
      if (!table) continue;
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const items: SongItem[] = [];
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 1) continue;
        const first = cells[0] as HTMLElement;
        const link = first.querySelector('a');
        const songTitle = extractSongTitle(first, link);
        if (!songTitle) continue;
        const s = splitSongTitleInlineNote(songTitle);
        const noteFromCell = extractSongNote(first);
        items.push({
          title: s.title,
          url: link?.getAttribute('href') || '',
          note: noteFromCell || s.inlineNote,
          sl: cleanText(cells[1]?.textContent || '-'),
          siedl: cleanText(cells[2]?.textContent || '-'),
          dn: cleanText(cells[3]?.textContent || '-'),
        });
      }
      if (items.length > 0) sections.push({ name, items });
    }
    return sections;
  };

  const sets: SongSet[] = [];
  const panes = Array.from(doc.querySelectorAll('.tab-content .tab-pane'));
  
  // Also try to get set names from nav-tabs links
  const navTabLinks = Array.from(doc.querySelectorAll('.nav-tabs a[data-bs-toggle="tab"], .nav-tabs a[data-toggle="tab"], ul.nav-tabs li a'));
  const tabNames = navTabLinks.map(a => cleanText(a.textContent || ''));
  
  console.log(`[SongsParser] Found ${panes.length} tab-pane(s), ${navTabLinks.length} nav-tab link(s): ${tabNames.join(' | ')}`);
  
  for (let pi = 0; pi < panes.length; pi++) {
    const pane = panes[pi];
    // Try getting name from nav-tab first
    let setName = tabNames[pi] || '';
    
    // Fallback: h2.page-header that's not a song section
    if (!setName) {
      const paneHeader = Array.from(pane.querySelectorAll('h2.page-header'))
        .find((h) => !/^Śpiew /i.test(cleanText(h.textContent || '')));
      setName = cleanText(paneHeader?.textContent || '');
    }
    
    // Skip non-song panes
    if (/^utwory organowe/i.test(setName) || /^komentarze/i.test(setName) || /^slajdy/i.test(setName)) {
      console.log(`[SongsParser] Skipping pane "${setName}"`);
      continue;
    }
    
    const sections = parseSectionItems(pane);
    console.log(`[SongsParser] Pane ${pi} "${setName}": ${sections.length} section(s), ${sections.map(s => `${s.name}(${s.items.length})`).join(', ')}`);

    if (sections.length === 0) {
      const paneEl = pane as HTMLElement;
      const paneText = cleanText(paneEl.textContent || '').slice(0, 220);
      const tableCount = paneEl.querySelectorAll('table').length;
      const h2Count = paneEl.querySelectorAll('h2.page-header').length;
      console.log(`[SongsParser] Pane ${pi} empty debug: tables=${tableCount}, h2=${h2Count}, text="${paneText}"`);
    }
    // Include pane even if empty (show empty state in UI)
    if (setName) {
      sets.push({ name: setName, sections });
    }
  }
  if (sets.length === 0) {
    const fallback = parseSectionItems(doc);
    if (fallback.length > 0) sets.push({ name: title, sections: fallback });
  }
  console.log(`[SongsParser] Total sets: ${sets.length} — ${sets.map(s => s.name).join(' | ')}`);
  return { title, sets, sourceUrl };
}

// ──── READINGS (brewiarz.pl) ─────────────────────────────────

export interface ReadingsOption {
  name: string;
  url: string;
  contentHtml: string;
}

export interface ReadingsData {
  title: string;
  options: ReadingsOption[];
  sourceUrl: string;
}

function romanMonth(m: number): string {
  const arr = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
  return arr[Math.max(1, Math.min(12, m)) - 1];
}

function brewiarzIndexUrl(d: Date): string {
  const now = new Date();
  if (toYMD(d) === toYMD(now)) return 'https://brewiarz.pl/dzis.php';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `https://brewiarz.pl/${romanMonth(d.getMonth() + 1)}_${yy}/${dd}${mm}/index.php3`;
}

function parseBrewiarzOptions(indexHtml: string, indexUrl: string): { title: string; options: { name: string; url: string }[] } {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  const title = cleanText(
    doc.querySelector('div[style*="font-size: 18pt"]')?.textContent ||
    doc.querySelector('title')?.textContent ||
    'Liturgia słowa'
  );
  const links = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  const dedup = new Map<string, { name: string; url: string }>();
  for (const link of links) {
    const rawHref = link.getAttribute('href');
    if (!rawHref) continue;
    if (!/\bl=i\b/i.test(rawHref)) continue;
    const abs = new URL(rawHref, indexUrl).toString();
    const urlObj = new URL(abs);
    urlObj.pathname = urlObj.pathname.replace(/index\.php3$/i, 'czyt.php3');
    urlObj.search = '?off=1';
    const base = urlObj.toString();
    const name = cleanText(link.textContent || '');
    if (!name || dedup.has(base)) continue;
    dedup.set(base, { name, url: base });
  }
  if (dedup.size === 0) {
    dedup.set(new URL('czyt.php3?off=1', indexUrl).toString(), {
      name: 'Dzień bieżący',
      url: new URL('czyt.php3?off=1', indexUrl).toString(),
    });
  }
  return { title, options: Array.from(dedup.values()) };
}

function extractBrewiarzReadingsHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container =
    (doc.querySelector('div[style*="margin-left: 15pt"]') as HTMLElement | null) ||
    (doc.querySelector('body') as HTMLElement | null);
  if (!container) return '';

  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script').forEach(el => el.remove());
  clone.querySelectorAll('img').forEach(el => el.remove());

  const anchorOrder = ['czyt1', 'psalmresp', 'czyt2', 'aklam', 'ewang'];
  const tables = Array.from(clone.querySelectorAll('table'));
  const positions = anchorOrder
    .map((name) => {
      const anchor = clone.querySelector(`a[name="${name}"], A[name="${name}"]`) as HTMLElement | null;
      const table = anchor?.closest('table');
      if (!table) return null;
      const idx = tables.indexOf(table as HTMLTableElement);
      if (idx < 0) return null;
      return { name, idx };
    })
    .filter((v): v is { name: string; idx: number } => v !== null)
    .sort((a, b) => a.idx - b.idx);

  if (positions.length === 0) return '';

  const keep = new Set<HTMLTableElement>();
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx - 1 : tables.length - 1;
    for (let j = start; j <= end; j++) {
      const t = tables[j] as HTMLTableElement;
      const text = cleanText(t.textContent || '').toLowerCase();
      if (text.includes('wprowadzenie do') || text.includes('komentarz do')) continue;
      keep.add(t);
    }
  }

  // Remove premium/promotional text
  const allNodes = Array.from(clone.querySelectorAll('*'));
  for (const node of allNodes) {
    const ownText = cleanText(
      Array.from(node.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent || '')
        .join(' ')
    );
    if (/w wersji premium/i.test(ownText) && ownText.length < 220) {
      node.remove();
    }
  }

  // Replace links with spans
  clone.querySelectorAll('a').forEach(a => {
    const span = doc.createElement('span');
    span.textContent = cleanText(a.textContent || '');
    const inline = a.getAttribute('style');
    if (inline) span.setAttribute('style', inline);
    if (a.className) span.className = a.className;
    a.replaceWith(span);
  });

  const labelMap: Record<string, string> = {
    czyt1: 'PIERWSZE CZYTANIE',
    czyt2: 'DRUGIE CZYTANIE',
    psalmresp: 'PSALM RESPONSORYJNY',
    aklam: 'AKLAMACJA',
    ewang: 'EWANGELIA',
  };

  const shouldDropText = (text: string) => {
    const t = text.toLowerCase();
    if (t.includes('refren:')) return false;
    return t.includes('w wersji premium')
      || t.includes('znajdziesz tutaj link')
      || t.includes('link do nagrania')
      || t.includes('kliknij tutaj')
      || t.includes('jeśli strona nie wyświetla się poprawnie');
  };

  // Extract reference and subtitle from section's first table text
  const knownLabels = [
    'PIERWSZE CZYTANIE', 'DRUGIE CZYTANIE', 'CZYTANIE',
    'PSALM RESPONSORYJNY', 'ŚPIEW PRZED EWANGELIĄ', 'AKLAMACJA', 'EWANGELIA',
  ];

  const extractHeaderInfo = (sectionTables: Element[]): { ref: string; subtitle: string } => {
    if (sectionTables.length === 0) return { ref: '', subtitle: '' };
    const firstTable = sectionTables[0];
    
    const rows = Array.from(firstTable.querySelectorAll('tr'));
    let ref = '';
    let subtitle = '';
    
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td'));
      for (const cell of cells) {
        const txt = cleanText(cell.textContent || '');
        if (!txt || txt.length > 150) continue;
        
        // Check if this cell starts with a known label - extract subtitle after it
        if (!subtitle) {
          for (const label of knownLabels) {
            if (txt.startsWith(label) && txt.length > label.length + 2) {
              let rest = txt.slice(label.length).trim();
              // Remove "– komentarze" prefix if present
              rest = rest.replace(/^[–—-]\s*komentarze\s*/i, '').trim();
              if (rest && rest.length > 2) {
                subtitle = rest;
              }
              break;
            }
          }
        }
        
        // Bible reference: "Jr 7, 23-28" or "1 Krl 8, 22-23" or "Ps 95 (94)..."
        if (!ref && /^(\d\s+)?[A-ZŻŹĆŚŁÓĄĘ][a-zżźćęśłóąń]{0,4}\s+\d/.test(txt)) {
          ref = txt;
          continue;
        }
      }
    }
    
    return { ref, subtitle };
  };

  const blocks: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx - 1 : tables.length - 1;
    const sectionTables = tables.slice(start, end + 1).filter((t) => keep.has(t as HTMLTableElement));
    if (sectionTables.length === 0) continue;

    // Extract rich header info
    const { ref, subtitle } = extractHeaderInfo(sectionTables);
    const headerLabel = labelMap[positions[i].name] || positions[i].name;
    const headerRef = ref ? ` <span class="readings-section-ref">${ref}</span>` : '';
    const headerSubtitle = subtitle
      ? `<div class="readings-section-subtitle">${subtitle}</div>`
      : '';

    // Build body from ALL tables, but strip header rows from the first table
    const cleaned = sectionTables
      .map((table, tableIdx) => {
        const copy = table.cloneNode(true) as HTMLTableElement;
        
        // Strip header rows from the first table (title, reference, subtitle rows)
        if (tableIdx === 0 && (ref || subtitle)) {
          const rows = Array.from(copy.querySelectorAll('tr'));
          for (const row of rows) {
            const rowText = cleanText(row.textContent || '');
            // Remove rows that contain the reference or known labels
            if (rowText.length < 150 && (
              (ref && rowText.includes(ref))
              || knownLabels.some(label => rowText.startsWith(label) && rowText.length < label.length + 80)
            )) {
              row.remove();
            }
          }
        }
        
        copy.querySelectorAll('*').forEach((el) => {
          const txt = cleanText(el.textContent || '');
          if (txt && txt.length < 260 && shouldDropText(txt)) el.remove();
        });
        const text = cleanText(copy.textContent || '').toLowerCase();
        if (!text || text.includes('antyfona na wej') || text.includes('kolekta')
          || text.includes('modlitwa nad darami') || text.includes('prefacja')
          || text.includes('antyfona na komuni') || text.includes('modlitwa po komunii')
          || text.includes('modlitwa powszechna')
          || text.includes('wprowadzenie do modlitwy pańskiej') || text.includes('odmawia się')) {
          return '';
        }
        return copy.outerHTML;
      })
      .filter(Boolean);

    if (positions[i].name === 'ewang' && cleaned.length > 0) {
      const cutAt = Math.max(
        cleaned.join('<br>').toLowerCase().lastIndexOf('oto słowo pańskie'),
        cleaned.join('<br>').toLowerCase().lastIndexOf('oto slowo panskie')
      );
      if (cutAt > -1) {
        const joined = cleaned.join('<br>');
        const tail = joined.slice(cutAt);
        const endBr = tail.indexOf('<br><br>');
        const safeEnd = endBr > -1 ? cutAt + endBr + '<br><br>'.length : joined.length;
        cleaned.splice(0, cleaned.length, joined.slice(0, safeEnd));
      }
    }

    if (cleaned.length === 0 && !headerRef) continue;
    blocks.push(
      `<div class="readings-section-title">${headerLabel}${headerRef}</div>${headerSubtitle}${cleaned.join('')}`
    );
  }

  return blocks.join('<br>');
}

async function fetchBrewiarzHtml(url: string): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('brewiarz-proxy', {
      body: { url },
    });
    if (error) throw error;
    if (data?.html && data.html.trim().length > 50) {
      console.log(`[BrewiarzProxy] OK for ${url}, ${data.html.length} chars`);
      return data.html;
    }
  } catch (err) {
    console.warn('[BrewiarzProxy] Edge function failed, falling back to CORS proxy:', err);
  }
  // Fallback
  return fetchHtmlFromSources(url);
}

export async function fetchReadings(date: Date): Promise<ReadingsData> {
  const indexUrl = brewiarzIndexUrl(date);
  console.log('[Readings] Fetching index:', indexUrl);
  let indexHtml = await fetchBrewiarzHtml(indexUrl);

  // Handle meta refresh redirect
  const refreshTarget = extractMetaRefreshTarget(indexHtml, indexUrl);
  if (refreshTarget) {
    console.log('[Readings] Following meta refresh to:', refreshTarget);
    indexHtml = await fetchBrewiarzHtml(refreshTarget);
  }

  const resolvedBaseUrl = refreshTarget || indexUrl;
  const { title, options } = parseBrewiarzOptions(indexHtml, resolvedBaseUrl);
  console.log(`[Readings] Title: "${title}", Options: ${options.map(o => o.name).join(' | ')}`);
  const readingsOptions: ReadingsOption[] = [];

  for (const opt of options) {
    try {
      const html = await fetchBrewiarzHtml(opt.url);
      const contentHtml = extractBrewiarzReadingsHtml(html);
      console.log(`[Readings] Option "${opt.name}": content ${contentHtml.length} chars`);
      readingsOptions.push({ name: opt.name, url: opt.url, contentHtml });
    } catch (err) {
      console.error(`[Readings] Failed to fetch option "${opt.name}":`, err);
      readingsOptions.push({ name: opt.name, url: opt.url, contentHtml: '<div>Nie udało się pobrać czytań.</div>' });
    }
  }

  return { title, options: readingsOptions, sourceUrl: indexUrl };
}

// ──── CALENDAR (brewiarz.pl show.php3) ───────────────────────

export interface CalendarData {
  title: string;
  contentHtml: string;
  sourceUrl: string;
}

export async function fetchCalendar(date: Date): Promise<CalendarData> {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(2);
  const sourceUrl = `https://brewiarz.pl/show.php3?day=${dd}${mm}${yy}`;
  const html = await fetchBrewiarzHtml(sourceUrl);
  return extractBrewiarzCalendarHtml(html, sourceUrl);
}

function extractBrewiarzCalendarHtml(html: string, sourceUrl: string): CalendarData {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dayTitle = cleanText(doc.querySelector('.dzien')?.textContent || 'Kartka z kalendarza liturgicznego');
  const contentRoot =
    (doc.querySelector('.dzien')?.closest('div[style*="background-color:#FAE6D2"]') as HTMLElement | null) ||
    (doc.querySelector('.dzien')?.parentElement as HTMLElement | null);

  if (!contentRoot) {
    return { title: dayTitle, contentHtml: '<div>Brak treści kartki dla tej daty.</div>', sourceUrl };
  }

  const clone = contentRoot.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, img').forEach(el => el.remove());
  clone.querySelectorAll('[style*="mask-image"]').forEach((el) => {
    const current = (el as HTMLElement).getAttribute('style') || '';
    (el as HTMLElement).setAttribute('style', current.replace(/mask-image:[^;]+;?/gi, '').trim());
  });

  const shouldDropPremiumLine = (txt: string) => {
    const t = txt.toLowerCase();
    return (
      t.includes('w wersji premium') ||
      t.includes('dostępie premium') ||
      t.includes('inne oficja i pełna treść') ||
      t.includes('przejdź do wersji premium') ||
      t.includes('dostęp do wersji premium') ||
      t.includes('buycoffee') ||
      t.includes('patronite')
    );
  };

  const allElems = Array.from(clone.querySelectorAll('*')) as HTMLElement[];
  for (const node of allElems) {
    const ownText = cleanText(
      Array.from(node.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent || '')
        .join(' ')
    );
    if (!ownText) continue;
    if (shouldDropPremiumLine(ownText) && ownText.length < 260) {
      node.remove();
    }
  }

  clone.querySelectorAll('a').forEach((a) => {
    const linkText = cleanText(a.textContent || '');
    if (shouldDropPremiumLine(linkText)) {
      a.remove();
      return;
    }
    const span = doc.createElement('span');
    span.textContent = linkText;
    const inline = a.getAttribute('style');
    if (inline) span.setAttribute('style', inline);
    if (a.className) span.className = a.className;
    a.replaceWith(span);
  });

  return { title: dayTitle, contentHtml: clone.innerHTML, sourceUrl };
}
