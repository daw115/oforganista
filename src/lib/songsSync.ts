/**
 * Delta sync for the songs database.
 * Instead of uploading all songs every time, we track changes
 * and only upsert/delete the affected rows.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Song } from '@/types/projector';

const SYNC_DEBOUNCE_MS = 3000;
const BATCH_SIZE = 50;

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Snapshot of song IDs + updatedAt from the last known state */
let knownSongs: Map<string, string> = new Map(); // id → updatedAt

function isSyncEnabled(): boolean {
  try {
    const stored = localStorage.getItem('organista_modules');
    if (stored) {
      const settings = JSON.parse(stored);
      if (settings.songsSyncEnabled === false) return false;
    }
  } catch {}
  return true;
}

/** Initialize the known state from current songs (call after first load) */
export function initSyncSnapshot(songs: Song[]) {
  knownSongs = new Map();
  for (const s of songs) {
    knownSongs.set(s.id, s.updatedAt || '');
  }
}

/** Compute delta between previous snapshot and current songs */
function computeDelta(songs: Song[]): { upsert: Song[]; deleteIds: string[] } {
  const currentIds = new Set<string>();
  const upsert: Song[] = [];

  for (const s of songs) {
    currentIds.add(s.id);
    const knownUpdatedAt = knownSongs.get(s.id);
    // New song or updated song
    if (knownUpdatedAt === undefined || knownUpdatedAt !== (s.updatedAt || '')) {
      upsert.push(s);
    }
  }

  // Deleted songs: were in snapshot but not in current
  const deleteIds: string[] = [];
  for (const id of knownSongs.keys()) {
    if (!currentIds.has(id)) {
      deleteIds.push(id);
    }
  }

  return { upsert, deleteIds };
}

/** Upsert specific songs to server */
async function upsertSongs(songs: Song[]): Promise<boolean> {
  for (let i = 0; i < songs.length; i += BATCH_SIZE) {
    const batch = songs.slice(i, i + BATCH_SIZE).map(s => ({
      id: s.id,
      data: s as any,
      updated_at: s.updatedAt || new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('songs')
      .upsert(batch as any, { onConflict: 'id' });
    if (error) {
      console.warn(`[SongsSync] Upsert batch error: ${error.message}`);
      return false;
    }
  }
  return true;
}

/** Delete specific songs from server */
async function deleteSongs(ids: string[]): Promise<boolean> {
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('songs').delete().in('id', batch);
    if (error) {
      console.warn(`[SongsSync] Delete batch error: ${error.message}`);
      return false;
    }
  }
  return true;
}

/** Sync only changed/deleted songs to server */
async function syncDelta(songs: Song[]) {
  const { upsert, deleteIds } = computeDelta(songs);

  if (upsert.length === 0 && deleteIds.length === 0) {
    return; // nothing changed
  }

  console.log(`[SongsSync] Delta: ${upsert.length} upsert, ${deleteIds.length} delete`);

  let ok = true;
  if (upsert.length > 0) {
    ok = await upsertSongs(upsert);
  }
  if (ok && deleteIds.length > 0) {
    ok = await deleteSongs(deleteIds);
  }

  if (ok) {
    // Update snapshot
    initSyncSnapshot(songs);
    console.log(`[SongsSync] Delta sync complete`);
  }
}

/** Debounced delta sync — called after every local save */
export function debouncedUpload(songs: Song[]) {
  if (!isSyncEnabled()) return;

  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncDelta(songs);
  }, SYNC_DEBOUNCE_MS);
}

/** Full upload — only used for manual "Push to cloud" in settings */
export async function uploadSongsToServer(songs: Song[]): Promise<{ ok: boolean; count: number }> {
  try {
    const ok = await upsertSongs(songs);
    if (!ok) return { ok: false, count: 0 };

    // Remove server songs not in local set
    const localIds = new Set(songs.map(s => s.id));
    const allServerIds: string[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase.from('songs').select('id').range(from, from + 999).order('id');
      if (!data || data.length === 0) break;
      for (const r of data as any[]) allServerIds.push(r.id);
      if (data.length < 1000) break;
      from += data.length;
    }
    const toDelete = allServerIds.filter(id => !localIds.has(id));
    if (toDelete.length > 0) {
      await deleteSongs(toDelete);
      console.log(`[SongsSync] Deleted ${toDelete.length} stale songs from server`);
    }

    initSyncSnapshot(songs);
    console.log(`[SongsSync] Full upload: ${songs.length} songs`);
    return { ok: true, count: songs.length };
  } catch (e) {
    console.error('[SongsSync] Upload failed:', e);
    return { ok: false, count: 0 };
  }
}

/** Download all songs from the server */
export async function downloadSongsFromServer(): Promise<Song[]> {
  const allSongs: Song[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('songs')
      .select('id, data')
      .range(from, from + 999)
      .order('id');

    if (error) {
      console.error('[SongsSync] Download error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      if (row.data && typeof row.data === 'object') {
        allSongs.push(row.data as Song);
      }
    }

    from += data.length;
    if (data.length < 1000) break;
  }

  console.log(`[SongsSync] Downloaded ${allSongs.length} songs from server`);
  return allSongs;
}

/** Check how many songs exist on server */
export async function getServerSongCount(): Promise<number> {
  const { count, error } = await supabase
    .from('songs')
    .select('id', { count: 'exact', head: true });
  if (error) return 0;
  return count ?? 0;
}
