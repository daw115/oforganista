/**
 * IndexedDB storage for songs – replaces localStorage to avoid quota issues.
 * Falls back gracefully if IndexedDB is unavailable.
 */
import type { Song } from '@/types/projector';

const DB_NAME = 'organista_db';
const DB_VERSION = 2;
const STORE_NAME = 'songs';
const BACKUP_STORE = 'songs_backup';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BACKUP_STORE)) {
        db.createObjectStore(BACKUP_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSongsToDb(songs: Song[]): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const song of songs) {
      store.put(song);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('[SongsDB] Failed to save songs to IndexedDB:', e);
  }
}

export async function loadSongsFromDb(): Promise<Song[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    const result = await new Promise<Song[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as Song[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (e) {
    console.warn('[SongsDB] Failed to load songs from IndexedDB:', e);
    return [];
  }
}

/** Create a backup of the current songs database */
export async function backupSongsDb(): Promise<number> {
  try {
    const db = await openDb();
    // Read current songs
    const readTx = db.transaction(STORE_NAME, 'readonly');
    const readStore = readTx.objectStore(STORE_NAME);
    const readReq = readStore.getAll();
    const songs = await new Promise<Song[]>((resolve, reject) => {
      readReq.onsuccess = () => resolve(readReq.result as Song[]);
      readReq.onerror = () => reject(readReq.error);
    });

    // Write to backup store
    const writeTx = db.transaction(BACKUP_STORE, 'readwrite');
    const backupStore = writeTx.objectStore(BACKUP_STORE);
    backupStore.clear();
    for (const song of songs) {
      backupStore.put(song);
    }
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error);
    });

    localStorage.setItem('organista_backup_time', new Date().toISOString());
    db.close();
    return songs.length;
  } catch (e) {
    console.warn('[SongsDB] Failed to create backup:', e);
    return 0;
  }
}

/** Restore songs from the backup */
export async function restoreSongsFromBackup(): Promise<Song[]> {
  const db = await openDb();
  const tx = db.transaction(BACKUP_STORE, 'readonly');
  const store = tx.objectStore(BACKUP_STORE);
  const req = store.getAll();
  const songs = await new Promise<Song[]>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as Song[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (songs.length === 0) throw new Error('Brak kopii zapasowej');
  return songs;
}

/** Get the timestamp of the last backup, or null */
export function getBackupTime(): string | null {
  return localStorage.getItem('organista_backup_time');
}

/** Check if a backup exists */
export async function hasBackup(): Promise<boolean> {
  try {
    const db = await openDb();
    const tx = db.transaction(BACKUP_STORE, 'readonly');
    const store = tx.objectStore(BACKUP_STORE);
    const countReq = store.count();
    const count = await new Promise<number>((resolve, reject) => {
      countReq.onsuccess = () => resolve(countReq.result);
      countReq.onerror = () => reject(countReq.error);
    });
    db.close();
    return count > 0;
  } catch {
    return false;
  }
}

/** Migrate data from localStorage to IndexedDB (one-time) */
export async function migrateFromLocalStorage(): Promise<Song[] | null> {
  try {
    const raw = localStorage.getItem('organista_songs');
    if (!raw) return null;
    const songs: Song[] = JSON.parse(raw);
    if (songs.length > 0) {
      await saveSongsToDb(songs);
    }
    localStorage.removeItem('organista_songs');
    return songs;
  } catch {
    localStorage.removeItem('organista_songs');
    return null;
  }
}
