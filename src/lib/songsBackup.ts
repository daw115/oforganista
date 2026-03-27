/**
 * Server-side immutable backups for the songs database.
 * Creates weekly snapshots stored in `song_backups` table.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Song } from '@/types/projector';

const BACKUP_INTERVAL_KEY = 'organista_last_server_backup';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface SongBackup {
  id: string;
  created_at: string;
  song_count: number;
  label: string | null;
}

/** List all backups (metadata only, no song data) */
export async function listBackups(): Promise<SongBackup[]> {
  const { data, error } = await supabase
    .from('song_backups')
    .select('id, created_at, song_count, label')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[SongsBackup] List error:', error.message);
    return [];
  }
  return (data ?? []) as SongBackup[];
}

/** Create a backup from current server songs */
export async function createBackup(label?: string): Promise<boolean> {
  try {
    // Fetch all current songs from server
    const { data, error: fetchErr } = await supabase
      .from('songs')
      .select('data');
    if (fetchErr || !data) {
      console.error('[SongsBackup] Failed to fetch songs for backup:', fetchErr?.message);
      return false;
    }

    const songsData = data.map((r: any) => r.data);

    const { error } = await supabase
      .from('song_backups')
      .insert({
        song_count: songsData.length,
        label: label || `Backup ${new Date().toLocaleDateString('pl-PL')}`,
        songs_data: songsData as any,
      } as any);

    if (error) {
      console.error('[SongsBackup] Insert error:', error.message);
      return false;
    }

    localStorage.setItem(BACKUP_INTERVAL_KEY, new Date().toISOString());
    console.log(`[SongsBackup] Created backup with ${songsData.length} songs`);
    return true;
  } catch (e) {
    console.error('[SongsBackup] Create failed:', e);
    return false;
  }
}

/** Restore songs from a specific backup */
export async function restoreFromBackup(backupId: string): Promise<Song[]> {
  const { data, error } = await supabase
    .from('song_backups')
    .select('songs_data')
    .eq('id', backupId)
    .single();

  if (error || !data) {
    throw new Error('Nie udało się pobrać kopii zapasowej');
  }

  return (data as any).songs_data as Song[];
}

/** Delete a specific backup */
export async function deleteBackup(backupId: string): Promise<boolean> {
  const { error } = await supabase
    .from('song_backups')
    .delete()
    .eq('id', backupId);
  return !error;
}

/** Check if a weekly backup is due and create one if so */
export async function maybeCreateWeeklyBackup(): Promise<void> {
  try {
    const lastBackup = localStorage.getItem(BACKUP_INTERVAL_KEY);
    if (lastBackup) {
      const elapsed = Date.now() - new Date(lastBackup).getTime();
      if (elapsed < WEEK_MS) return;
    }

    // Also check server — maybe backup was created from another device
    const backups = await listBackups();
    if (backups.length > 0) {
      const latestAge = Date.now() - new Date(backups[0].created_at).getTime();
      if (latestAge < WEEK_MS) {
        localStorage.setItem(BACKUP_INTERVAL_KEY, backups[0].created_at);
        return;
      }
    }

    // Check we have songs on server
    const { count } = await supabase
      .from('songs')
      .select('id', { count: 'exact', head: true });
    if (!count || count === 0) return;

    await createBackup('Automatyczny backup tygodniowy');
    console.log('[SongsBackup] Weekly backup created');
  } catch (e) {
    console.warn('[SongsBackup] Weekly backup check failed:', e);
  }
}
