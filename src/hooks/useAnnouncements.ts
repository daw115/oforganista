import { useState, useEffect, useCallback, useRef } from 'react';
import { toYMD } from '@/lib/dateUtils';
import { fetchSetting, saveSetting } from '@/lib/settingsSync';

export interface AnnouncementsData {
  title: string;
  sourceUrl: string;
  fetchedAt: string;
  sundayDate: string | null;
  sections: Record<string, string>;
  selectedDayKey: string | null;
  selectedAnnouncement: string;
  extraAnnouncements: string[];
}

const DAY_LABELS: Record<string, string> = {
  today: 'Niedziela',
  mon: 'Poniedziałek',
  tue: 'Wtorek',
  wed: 'Środa',
  thu: 'Czwartek',
  fri: 'Piątek',
  sat: 'Sobota',
  nextsun: 'Przyszła niedziela',
};

export { DAY_LABELS };

const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

function isCacheValid(data: AnnouncementsData | null): boolean {
  if (!data?.fetchedAt) return false;
  return Date.now() - new Date(data.fetchedAt).getTime() < CACHE_TTL;
}

export function useAnnouncements() {
  const [data, setData] = useState<AnnouncementsData | null>(() => {
    try {
      const cached = localStorage.getItem('parishAnnouncements');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (isCacheValid(parsed)) return parsed;
      }
    } catch { /* ignore */ }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const syncedRef = useRef(false);

  // On mount: try server cache if local is empty/stale
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    if (data) return; // local cache is valid
    (async () => {
      const server = await fetchSetting<AnnouncementsData>('parish_announcements');
      if (server && isCacheValid(server)) {
        setData(server);
        localStorage.setItem('parishAnnouncements', JSON.stringify(server));
        console.log('[Announcements] Restored from server cache');
      }
    })();
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = toYMD(new Date());
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parish-announcements?date=${today}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: AnnouncementsData = await res.json();
      
      if ((result as any).error) throw new Error((result as any).error);
      
      setData(result);
      localStorage.setItem('parishAnnouncements', JSON.stringify(result));
      // Sync to server for other devices
      saveSetting('parish_announcements', result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania ogłoszeń');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!data) {
      fetchAnnouncements();
    }
  }, []);

  return { data, loading, error, fetchAnnouncements };
}
