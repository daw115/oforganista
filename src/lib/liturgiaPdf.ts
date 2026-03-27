export interface LiturgiaPdfEntry { title: string; url: string; }

/**
 * Mutable array populated at runtime from /liturgia-pdfs.csv
 */
export const LITURGIA_PDFS: LiturgiaPdfEntry[] = [];

let _loaded = false;
let _loadingPromise: Promise<void> | null = null;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

export async function loadLiturgiaPdfs(): Promise<void> {
  if (_loaded) return;
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {
    try {
      const res = await fetch('/liturgia-pdfs.csv');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const lines = text.trim().split('\n');
      // header: page_url,category,title,item_url,final_url,http_status,content_type,is_pdf,note
      // indices:  0         1        2      3         4         5           6          7     8

      const entries: LiturgiaPdfEntry[] = [];
      const seen = new Set<string>();

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const isPdf = (cols[7] || '').trim();
        if (isPdf !== 'TAK') continue;
        const title = (cols[2] || '').trim();
        const url = (cols[4] || '').trim();
        if (!title || !url) continue;
        // Deduplicate by title (keep first)
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ title, url });
      }

      LITURGIA_PDFS.length = 0;
      LITURGIA_PDFS.push(...entries);
      _loaded = true;
      console.log(`[liturgiaPdf] Załadowano ${entries.length} nut PDF`);
    } catch (e) {
      console.error('[liturgiaPdf] Błąd ładowania CSV:', e);
    }
  })();

  return _loadingPromise;
}

export function isLiturgiaPdfsLoaded(): boolean {
  return _loaded;
}
