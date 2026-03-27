/**
 * OpenLP Remote API client — direct HTTP calls for LAN use.
 * Tuned for OpenLP 2.2 API (v2).
 * 
 * IMPORTANT: When this app is served over HTTPS (e.g. from Lovable),
 * browsers block HTTP requests to LAN IPs (mixed content / PNA).
 * The app works correctly when served locally over HTTP (npm run dev).
 */

export interface OpenLpConfig {
  ip: string;
  port: number;
  version: 'v2' | 'v3';
  username?: string;
  password?: string;
}

export interface OpenLpServiceItem {
  id: string;
  title: string;
  plugin: string;
  selected: boolean;
}

export interface OpenLpSlide {
  tag: string;
  text: string;
  html: string;
  selected: boolean;
}

export interface OpenLpPollData {
  slide: number;
  item: string;
  service: number;
  blank: boolean;
  theme: boolean;
  display: boolean;
  isSecure: boolean;
}

function baseUrl(config: OpenLpConfig) {
  // When served from serve.js (same origin), use local proxy to avoid CORS
  const origin = window.location.origin;
  const isLocalServe = window.location.protocol === 'http:';
  if (isLocalServe) {
    return `${origin}/openlp-proxy/${config.ip}/${config.port}`;
  }
  return `http://${config.ip}:${config.port}`;
}

async function directFetch(targetUrl: string, method: 'GET' | 'POST' | 'PUT' = 'GET', payload?: unknown): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const options: RequestInit = {
    method,
    signal: controller.signal,
  };

  if (payload !== undefined && method !== 'GET') {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(payload);
  }

  try {
    const res = await fetch(targetUrl, options);
    clearTimeout(timeout);

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`OpenLP HTTP ${res.status}${raw ? `: ${raw.slice(0, 160)}` : ''}`);
    }
    if (!raw) return {};

    try {
      return JSON.parse(raw);
    } catch {
      return { text: raw };
    }
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Timeout — brak odpowiedzi z OpenLP');
    }

    // Detect HTTPS→HTTP blocking
    const isHttps = window.location.protocol === 'https:';
    if (isHttps && err instanceof TypeError) {
      throw new Error(
        'Przeglądarka blokuje połączenie HTTP z sieci HTTPS (mixed content). ' +
        'Aby korzystać z Rzutnika LAN, otwórz tę stronę po HTTP lub uruchom aplikację lokalnie (npm run dev).'
      );
    }

    if (err instanceof TypeError) {
      throw new Error('Brak połączenia z OpenLP — sprawdź IP, port i czy API jest włączone.');
    }

    throw err;
  }
}

function encodeDataParam(payload: Record<string, unknown>) {
  return encodeURIComponent(JSON.stringify(payload));
}

// ─── POLL ──────────────────────────────────────────────────────────
export async function pollOpenLp(config: OpenLpConfig): Promise<OpenLpPollData> {
  if (config.version !== 'v2') {
    throw new Error('Ta konfiguracja wspiera OpenLP 2.x (v2).');
  }

  const json = await directFetch(`${baseUrl(config)}/api/poll`);
  return (json.results ?? json) as OpenLpPollData;
}

// ─── SERVICE ITEMS ─────────────────────────────────────────────────
export async function getServiceItems(config: OpenLpConfig): Promise<OpenLpServiceItem[]> {
  const json = await directFetch(`${baseUrl(config)}/api/service/list`);
  const items = json.results?.items ?? [];

  return items.map((item: any, i: number) => ({
    id: String(i),
    title: item.title ?? `Item ${i + 1}`,
    plugin: item.plugin ?? '',
    selected: !!item.selected,
  }));
}

// ─── LIVE SLIDES ───────────────────────────────────────────────────
export async function getLiveSlides(config: OpenLpConfig): Promise<OpenLpSlide[]> {
  const json = await directFetch(`${baseUrl(config)}/api/controller/live/text`);
  return (json.results?.slides ?? []) as OpenLpSlide[];
}

// ─── CONTROLLER ACTIONS ────────────────────────────────────────────
export async function controllerNext(config: OpenLpConfig) {
  await directFetch(`${baseUrl(config)}/api/controller/live/next`);
}

export async function controllerPrevious(config: OpenLpConfig) {
  await directFetch(`${baseUrl(config)}/api/controller/live/previous`);
}

export async function controllerGoToSlide(config: OpenLpConfig, slideIndex: number) {
  const data = encodeDataParam({ request: { id: slideIndex } });
  await directFetch(`${baseUrl(config)}/api/controller/live/set?data=${data}`);
}

// ─── SERVICE ACTIONS ───────────────────────────────────────────────
export async function serviceNext(config: OpenLpConfig) {
  await directFetch(`${baseUrl(config)}/api/service/next`);
}

export async function servicePrevious(config: OpenLpConfig) {
  await directFetch(`${baseUrl(config)}/api/service/previous`);
}

export async function serviceGoToItem(config: OpenLpConfig, itemIndex: number, _serviceItems?: OpenLpServiceItem[]) {
  const data = encodeDataParam({ request: { id: itemIndex } });
  await directFetch(`${baseUrl(config)}/api/service/set?data=${data}`);
}

export async function serviceRemoveItem(config: OpenLpConfig, itemIndex: number) {
  const data = encodeDataParam({ request: { id: itemIndex } });
  const attempts = [
    `${baseUrl(config)}/api/service/delete?data=${data}`,
    `${baseUrl(config)}/api/service/remove?data=${data}`,
    `${baseUrl(config)}/api/service/item/delete?data=${data}`,
  ];

  let lastError: unknown;
  for (const url of attempts) {
    try {
      await directFetch(url);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Nie udało się usunąć elementu z listy OpenLP');
}

// ─── DISPLAY MODE ──────────────────────────────────────────────────
export async function setDisplayMode(config: OpenLpConfig, mode: 'show' | 'blank' | 'theme' | 'desktop') {
  await directFetch(`${baseUrl(config)}/api/display/${mode}`);
}

// ─── SEARCH SONGS ──────────────────────────────────────────────────
function normalizeSearchResults(raw: any): Array<[string, number]> {
  const source = raw?.results?.items ?? raw?.results?.songs ?? raw?.results ?? raw?.items ?? raw?.songs ?? raw;
  if (!Array.isArray(source)) return [];

  const normalized: Array<[string, number]> = [];

  for (const item of source) {
    if (Array.isArray(item)) {
      const first = item[0];
      const second = item[1];

      if (typeof first === 'string' && (typeof second === 'number' || (typeof second === 'string' && /^\d+$/.test(second)))) {
        normalized.push([first, Number(second)]);
        continue;
      }

      if ((typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) && typeof second === 'string') {
        normalized.push([second, Number(first)]);
        continue;
      }

      if (typeof first === 'string') {
        const id = typeof second === 'number' ? second : Number(second ?? -1);
        if (!Number.isNaN(id) && id >= 0) normalized.push([first, id]);
      }
      continue;
    }

    if (item && typeof item === 'object') {
      const title = String(item.title ?? item.name ?? item.song ?? item.text ?? '').trim();
      const idRaw = item.id ?? item.song_id ?? item.songId ?? item.uuid;
      const id = typeof idRaw === 'number' ? idRaw : Number(idRaw);

      if (title && !Number.isNaN(id)) {
        normalized.push([title, id]);
      }
    }
  }

  return normalized;
}

function buildSearchQueries(query: string): string[] {
  const q = query.trim();
  if (!q) return [];

  const noParentheses = q.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  const noPunctuation = noParentheses.replace(/["'„”.,:;!?/\\-]+/g, ' ');
  const compact = noPunctuation.replace(/\s+/g, ' ').trim();
  const firstChunk = compact.split(' ').slice(0, 4).join(' ').trim();

  return Array.from(new Set([q, compact, firstChunk].filter(Boolean)));
}

async function runSongSearch(config: OpenLpConfig, query: string): Promise<Array<[string, number]>> {
  const base = baseUrl(config);
  const requestPayload = encodeURIComponent(JSON.stringify({ request: { text: query } }));

  // OpenLP 2.2/2.4: GET /api/songs/search?data={"request":{"text":"..."}}
  // This is THE correct endpoint from OpenLP source code (httprouter.py line 167)
  const getAttempts = [
    `${base}/api/songs/search?data=${requestPayload}`,
    // OpenLP 3.x API v2 (newer versions)
    `${base}/api/v2/plugins/songs/search?text=${encodeURIComponent(query)}`,
  ];

  for (const url of getAttempts) {
    try {
      const raw = await directFetch(url);
      console.log('[OpenLP Search] GET', url.replace(base, ''), '→', JSON.stringify(raw).slice(0, 200));
      const normalized = normalizeSearchResults(raw);
      if (normalized.length > 0) return normalized;
    } catch (err) {
      console.log('[OpenLP Search] GET failed:', url.replace(base, ''), err instanceof Error ? err.message : '');
    }
  }

  // OpenLP 3.x POST fallback
  try {
    const raw = await directFetch(`${base}/api/v2/plugins/songs/search`, 'POST', { text: query });
    console.log('[OpenLP Search] POST v2 →', JSON.stringify(raw).slice(0, 200));
    const normalized = normalizeSearchResults(raw);
    if (normalized.length > 0) return normalized;
  } catch (err) {
    console.log('[OpenLP Search] POST v2 failed:', err instanceof Error ? err.message : '');
  }

  console.warn('[OpenLP Search] No results for:', query);
  return [];
}

export async function searchSongs(config: OpenLpConfig, query: string): Promise<Array<[string, number]>> {
  const queries = buildSearchQueries(query);
  for (const q of queries) {
    const results = await runSongSearch(config, q);
    if (results.length > 0) return results;
  }
  return [];
}

// ─── ADD SONG TO SERVICE ───────────────────────────────────────────
export async function addSongToService(config: OpenLpConfig, songId: number): Promise<void> {
  const base = baseUrl(config);
  let lastError: unknown;

  // OpenLP 2.2/2.4: GET /api/songs/add?data={"request":{"id": songId}}
  // This is THE correct endpoint from OpenLP source code (httprouter.py line 169)
  const requestPayload = encodeURIComponent(JSON.stringify({ request: { id: songId } }));
  try {
    const result = await directFetch(`${base}/api/songs/add?data=${requestPayload}`, 'GET');
    console.log('[OpenLP Add] GET /api/songs/add →', JSON.stringify(result).slice(0, 120));
    return;
  } catch (err) {
    console.log('[OpenLP Add] GET /api/songs/add failed:', err instanceof Error ? err.message : '');
    lastError = err;
  }

  // OpenLP 3.x API v2: POST /api/v2/plugins/songs/add with JSON body {"id": songId}
  try {
    const result = await directFetch(`${base}/api/v2/plugins/songs/add`, 'POST', { id: songId });
    console.log('[OpenLP Add] POST v2 /api/v2/plugins/songs/add →', JSON.stringify(result).slice(0, 120));
    return;
  } catch (err) {
    console.log('[OpenLP Add] POST v2 failed:', err instanceof Error ? err.message : '');
    lastError = err;
  }

  throw lastError instanceof Error ? lastError : new Error('Nie udało się dodać pieśni do listy OpenLP');
}

// ─── SEARCH AND ADD SONG TO SERVICE ────────────────────────────────
export async function searchAndAddSong(config: OpenLpConfig, title: string): Promise<boolean> {
  const results = await searchSongs(config, title);
  if (results.length === 0) return false;

  const songId = results[0][1];
  if (typeof songId !== 'number' || Number.isNaN(songId)) return false;

  await addSongToService(config, songId);
  return true;
}
