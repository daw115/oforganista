import { useEffect, useRef } from 'react';
import { getCachedLiturgy, refreshLiturgyCache, fetchFreshAndCache } from '@/lib/liturgyCache'; 
import { toYMD, addDays } from '@/lib/dateUtils';

type Tab = 'songs' | 'readings' | 'calendar';
const TABS: Tab[] = ['songs', 'readings', 'calendar'];

/** How old (in minutes) cached data can be before we consider it stale */
const STALE_AFTER_MINUTES = 60;

function isStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const age = Date.now() - new Date(updatedAt).getTime();
  return age > STALE_AFTER_MINUTES * 60 * 1000;
}

/**
 * Fetch all 3 tabs for a single date.
 * For today: always fetch from web (no cache check that may timeout).
 * For future days: check cache first.
 */
async function ensureDateCached(date: Date, skipCacheCheck = false): Promise<number> {
  let fetched = 0;
  for (const tab of TABS) {
    try {
      if (skipCacheCheck) {
        // Fetch from web directly, save to cache in background
        await fetchFreshAndCache(date, tab);
        fetched++;
      } else {
        const cached = await getCachedLiturgy(date, tab);
        if (!cached.data || isStale(cached.updatedAt)) {
          await refreshLiturgyCache(date, tab);
          fetched++;
        }
      }
    } catch (err) {
      console.warn(`[LiturgyPrefetch] Błąd pobierania ${tab} na ${toYMD(date)}:`, err);
    }
  }
  return fetched;
}

/**
 * Auto-prefetches liturgy data on app startup.
 * 1. Immediately fetches today's data if missing (priority).
 * 2. Then background-fetches the next 7 days.
 */
export function useLiturgyPrefetch(days = 7) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    console.log('[LiturgyPrefetch] Start — pobieram liturgię na dziś...');

    (async () => {
      const today = new Date();

      // Step 1: Priority — ensure today's data is cached
      try {
        const todayFetched = await ensureDateCached(today, true);
        if (todayFetched > 0) {
          console.log(`[LiturgyPrefetch] Pobrano ${todayFetched} wpisów na dziś (${toYMD(today)})`);
        } else {
          console.log(`[LiturgyPrefetch] Cache na dziś (${toYMD(today)}) jest aktualny`);
        }
      } catch (err) {
        console.warn('[LiturgyPrefetch] Błąd pobierania na dziś:', err);
      }

      // Step 2: Background — prefetch remaining days (1..days)
      let totalFetched = 0;
      for (let d = 1; d <= days; d++) {
        try {
          const fetched = await ensureDateCached(addDays(today, d));
          totalFetched += fetched;
        } catch (err) {
          console.warn(`[LiturgyPrefetch] Błąd prefetch dzień +${d}:`, err);
        }
      }
      if (totalFetched > 0) {
        console.log(`[LiturgyPrefetch] Pobrano ${totalFetched} wpisów w tle (${days} dni)`);
      } else {
        console.log(`[LiturgyPrefetch] Cały cache (${days} dni) jest aktualny`);
      }
    })();
  }, [days]);
}
