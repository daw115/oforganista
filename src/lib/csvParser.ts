import { ScheduleEntry } from '@/types/schedule';

export interface ScheduleParseResult {
  entries: ScheduleEntry[];
  holidays: Set<string>;
}

export function parseScheduleCSV(text: string): ScheduleParseResult {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { entries: [], holidays: new Set() };

  const header = lines[0];
  const hasTabs = header.includes('\t');
  const split = (l: string) =>
    hasTabs
      ? l.split('\t').map(c => c.trim())
      : l.split(',').map(c => c.replace(/^"|"$/g, '').trim());

  const headers = split(header);
  const dateCol = headers.findIndex(h => h.toLowerCase() === 'data');
  if (dateCol < 0) return { entries: [], holidays: new Set() };

  // Detect "swieto" / "święto" column
  const holidayCol = headers.findIndex(h => {
    const low = h.toLowerCase();
    return low === 'swieto' || low === 'święto' || low === 'świeto' || low === 'swięto';
  });

  const skip = new Set(['dzień', 'dzien', 'data', '', 'suma', 'razem', 'ilość', 'ilosc', 'liczba', 'uwagi', 'swieto', 'święto', 'świeto', 'swięto']);
  const orgCols: { name: string; idx: number }[] = [];

  for (let i = 0; i < headers.length; i++) {
    if (i <= dateCol) continue;
    const low = headers[i].toLowerCase();
    if (skip.has(low) || headers[i].length < 2) continue;
    if (/^\d+$/.test(headers[i])) continue;
    orgCols.push({ name: headers[i], idx: i });
  }

  if (orgCols.length === 0) return { entries: [], holidays: new Set() };

  const entries: ScheduleEntry[] = [];
  const holidays = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i]);
    const raw = (cols[dateCol] || '').trim();
    if (!raw) continue;

    const dm = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!dm) continue;

    const yy = dm[3].length === 2 ? '20' + dm[3] : dm[3];
    const dateStr = `${yy}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;

    // Check holiday column
    if (holidayCol >= 0) {
      const hCell = (cols[holidayCol] || '').trim().toLowerCase();
      if (hCell === 'x' || hCell === 'tak' || hCell === '1') {
        holidays.add(dateStr);
      }
    }

    for (const o of orgCols) {
      const cell = (cols[o.idx] || '').trim();
      if (!cell || cell === '-' || cell === '—') continue;
      const times = cell.match(/\d{1,2}[:.]\d{2}/g);
      if (!times) continue;

      for (const t of times) {
        const norm = t.replace('.', ':');
        const [hh, mm] = norm.split(':');
        entries.push({
          date: dateStr,
          time: hh.padStart(2, '0') + ':' + mm,
          organist: o.name,
        });
      }
    }
  }

  return { entries, holidays };
}
