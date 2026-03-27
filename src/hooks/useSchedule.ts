import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ScheduleEntry } from '@/types/schedule';
import { parseScheduleCSV } from '@/lib/csvParser';
import { toYMD, addDays } from '@/lib/dateUtils';
import { fetchSetting, saveSetting } from '@/lib/settingsSync';

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTJ8BokZ1lXzBBoUSgbR98ocesq3I4IPtQdjE1vW09pJ-Sdp4SBx92QIiWXvamXRcOOL43HiBYKtDA0/pub?gid=603680750&single=true&output=csv';

interface ScheduleSyncData {
  entries: ScheduleEntry[];
  csv: string;
  holidays: string[];
  updatedAt: string;
}

function saveScheduleToServer(entries: ScheduleEntry[], csv: string, holidays: Set<string>) {
  saveSetting<ScheduleSyncData>('schedule_data', {
    entries,
    csv,
    holidays: [...holidays],
    updatedAt: new Date().toISOString(),
  });
}

export function useSchedule() {
  const [sched, setSched] = useState<ScheduleEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('orgSched5') || '[]'); } catch { return []; }
  });
  const [rawCsv, setRawCsv] = useState(() => localStorage.getItem('orgSchedCsv') || '');
  const [csvHolidays, setCsvHolidays] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('orgSchedCsvHolidays');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const syncedRef = useRef(false);

  // On mount: try to load schedule from server
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    (async () => {
      const server = await fetchSetting<ScheduleSyncData>('schedule_data');
      if (server && server.entries.length > 0) {
        const localEmpty = sched.length === 0;
        if (localEmpty) {
          setSched(server.entries);
          setRawCsv(server.csv || '');
          setCsvHolidays(new Set(server.holidays || []));
          localStorage.setItem('orgSched5', JSON.stringify(server.entries));
          localStorage.setItem('orgSchedCsv', server.csv || '');
          localStorage.setItem('orgSchedCsvHolidays', JSON.stringify(server.holidays || []));
          console.log(`[Schedule] Restored ${server.entries.length} entries from server`);
        } else {
          saveScheduleToServer(sched, rawCsv, csvHolidays);
        }
      } else if (sched.length > 0) {
        saveScheduleToServer(sched, rawCsv, csvHolidays);
      }
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem('orgSched5', JSON.stringify(sched));
  }, [sched]);

  useEffect(() => {
    localStorage.setItem('orgSchedCsv', rawCsv);
  }, [rawCsv]);

  useEffect(() => {
    localStorage.setItem('orgSchedCsvHolidays', JSON.stringify([...csvHolidays]));
  }, [csvHolidays]);

  const applyParsed = useCallback((text: string) => {
    const result = parseScheduleCSV(text);
    if (result.entries.length > 0) {
      setSched(result.entries);
      setRawCsv(text);
      if (result.holidays.size > 0) {
        setCsvHolidays(result.holidays);
      }
      // Sync to server
      saveScheduleToServer(result.entries, text, result.holidays);
    }
    return result;
  }, []);

  useEffect(() => {
    if (sched.length > 0) return;
    setLoading(true);
    setMsg('Pobieram grafik z Google Sheets...');
    fetch(SHEET_CSV)
      .then(r => r.text())
      .then(text => {
        const result = applyParsed(text);
        if (result.entries.length > 0) {
          setMsg(`Pobrano ${result.entries.length} mszy z Google Sheets`);
        } else {
          setMsg('Nie udało się sparsować danych');
        }
      })
      .catch(() => setMsg('Błąd pobierania'))
      .finally(() => { setLoading(false); setTimeout(() => setMsg(''), 5000); });
  }, []);

  const fetchSheet = useCallback(() => {
    setLoading(true);
    setMsg('Pobieram...');
    fetch(SHEET_CSV)
      .then(r => r.text())
      .then(text => {
        const result = applyParsed(text);
        if (result.entries.length > 0) setMsg(`Pobrano ${result.entries.length} mszy`);
        else setMsg('Brak danych');
      })
      .catch(() => setMsg('Błąd'))
      .finally(() => { setLoading(false); setTimeout(() => setMsg(''), 4000); });
  }, [applyParsed]);

  const importData = useCallback((text: string) => {
    const result = applyParsed(text);
    if (result.entries.length === 0) return 0;
    setMsg(`Zaimportowano ${result.entries.length} mszy`);
    setTimeout(() => setMsg(''), 3000);
    return result.entries.length;
  }, [applyParsed]);

  const clearSchedule = useCallback(() => {
    setSched([]);
    localStorage.removeItem('orgSched5');
    // Also clear on server
    saveSetting('schedule_data', null);
  }, []);

  const switchHour = useMemo(() => {
    try {
      const stored = localStorage.getItem('orgSchedSwitchHour');
      return stored ? parseInt(stored, 10) : 17;
    } catch { return 17; }
  }, []);

  const now = new Date();
  const isSatAfterSwitch = now.getDay() === 6 && now.getHours() >= switchHour;
  const today = isSatAfterSwitch ? addDays(now, 1) : now;
  const todayStr = toYMD(today);
  const tomorrowStr = toYMD(addDays(today, 1));

  const organists = useMemo(() => {
    const names: string[] = [];
    sched.forEach(e => { if (!names.includes(e.organist)) names.push(e.organist); });
    return names;
  }, [sched]);

  const dates = useMemo(() => [...new Set(sched.map(e => e.date))].sort(), [sched]);

  const groupByDate = useCallback((date: string) => {
    const g: Record<string, string[]> = {};
    organists.forEach(n => g[n] = []);
    sched.filter(e => e.date === date).forEach(e => {
      if (!g[e.organist]) g[e.organist] = [];
      g[e.organist].push(e.time);
    });
    Object.values(g).forEach(a => a.sort());
    return g;
  }, [sched, organists]);

  const todayGroup = useMemo(() => groupByDate(todayStr), [groupByDate, todayStr]);
  const tomorrowGroup = useMemo(() => groupByDate(tomorrowStr), [groupByDate, tomorrowStr]);

  const stats = useMemo(() => {
    const s: Record<string, number> = {};
    sched.forEach(e => { s[e.organist] = (s[e.organist] || 0) + 1; });
    return s;
  }, [sched]);

  return {
    sched, loading, msg, organists, dates, stats, rawCsv, csvHolidays,
    todayStr, tomorrowStr, todayGroup, tomorrowGroup,
    fetchSheet, importData, clearSchedule, groupByDate,
  };
}
