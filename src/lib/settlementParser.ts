import { ScheduleEntry } from '@/types/schedule';

export interface SettlementRow {
  date: string;       // YYYY-MM-DD
  dayName: string;    // e.g. "poniedziałek"
  dayOfWeek: number;  // 0=Sun
  organistData: Record<string, {
    masses: number;
    times: string[];
    calculatedAmount: number;
    csvAmount: number | null;
    rate: number; // 50 or 60
    isHoliday: boolean;
  }>;
}

const DAY_NAMES = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

/**
 * Check if a mass should be billed at the higher rate (60 PLN).
 * Higher rate: all Sunday masses, Saturday 18:00 and 19:00, holidays
 */
function isHighRate(dayOfWeek: number, time: string, isHoliday: boolean): boolean {
  if (isHoliday) return true;
  if (dayOfWeek === 0) return true; // Sunday
  if (dayOfWeek === 6) {
    // Saturday: 18:00 and 19:00
    return time === '18:00' || time === '19:00';
  }
  return false;
}

/**
 * Parse CSV to extract "kwota" (amount) columns for each organist.
 */
export function parseAmountsFromCSV(csvText: string, organists: string[]): Record<string, Record<string, number>> {
  // Returns: { "YYYY-MM-DD": { "Dawid": 100, "Michał": 50 } }
  const result: Record<string, Record<string, number>> = {};
  if (!csvText) return result;

  const lines = csvText.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return result;

  const header = lines[0];
  const hasTabs = header.includes('\t');
  const split = (l: string) =>
    hasTabs
      ? l.split('\t').map(c => c.trim())
      : l.split(',').map(c => c.replace(/^"|"$/g, '').trim());

  const headers = split(header);
  const dateCol = headers.findIndex(h => h.toLowerCase() === 'data');
  if (dateCol < 0) return result;

  // Find amount columns: match "kwota <name>" or "<name> kwota" patterns, or columns named with amount-like headers near organist columns
  const amountCols: { organist: string; idx: number }[] = [];
  
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    for (const org of organists) {
      const orgLow = org.toLowerCase();
      if (
        h === `kwota ${orgLow}` ||
        h === `${orgLow} kwota` ||
        h === `kwota_${orgLow}` ||
        h === `${orgLow}_kwota` ||
        h === `kwota${orgLow}` ||
        h === `${orgLow}kwota`
      ) {
        amountCols.push({ organist: org, idx: i });
      }
    }
    // Also check for standalone "kwota" columns after known organist columns
    if (h === 'kwota' || h === 'kwota zł' || h === 'kwota (zł)') {
      // Find the nearest preceding organist column
      for (let j = i - 1; j >= 0; j--) {
        const matched = organists.find(o => headers[j].toLowerCase().includes(o.toLowerCase()));
        if (matched && !amountCols.find(a => a.organist === matched)) {
          amountCols.push({ organist: matched, idx: i });
          break;
        }
      }
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i]);
    const raw = (cols[dateCol] || '').trim();
    if (!raw) continue;

    const dm = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!dm) continue;

    const yy = dm[3].length === 2 ? '20' + dm[3] : dm[3];
    const dateStr = `${yy}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;

    for (const ac of amountCols) {
      const cell = (cols[ac.idx] || '').trim();
      const num = parseFloat(cell.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(num) && num > 0) {
        if (!result[dateStr]) result[dateStr] = {};
        result[dateStr][ac.organist] = num;
      }
    }
  }

  return result;
}

export function buildSettlement(
  sched: ScheduleEntry[],
  organists: string[],
  csvAmounts: Record<string, Record<string, number>>,
  holidays: Set<string>,
): SettlementRow[] {
  const dateSet = [...new Set(sched.map(e => e.date))].sort();
  
  return dateSet.map(date => {
    const d = new Date(date + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const dayName = DAY_NAMES[dayOfWeek];

    const organistData: SettlementRow['organistData'] = {};

    for (const org of organists) {
      const entries = sched.filter(e => e.date === date && e.organist === org);
      const times = entries.map(e => e.time).sort();
      const isHoliday = holidays.has(date);

      let totalAmount = 0;
      for (const t of times) {
        totalAmount += isHighRate(dayOfWeek, t, isHoliday) ? 60 : 50;
      }

      const csvAmt = csvAmounts[date]?.[org] ?? null;

      organistData[org] = {
        masses: times.length,
        times,
        calculatedAmount: totalAmount,
        csvAmount: csvAmt,
        rate: (dayOfWeek === 0 || isHoliday) ? 60 : 50,
        isHoliday,
      };
    }

    return { date, dayName, dayOfWeek, organistData };
  });
}
