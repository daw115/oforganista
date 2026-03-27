import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SongbookSong {
  id: string;
  title: string;
  category: string;
  sort_order: number;
  created_at: string;
  pages: SongbookPage[];
}

export interface SongbookPage {
  id: string;
  song_id: string;
  image_path: string;
  page_number: number;
}

const BUCKET = 'songbook';

function getPublicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function useSongbook() {
  const [songs, setSongs] = useState<SongbookSong[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: songRows } = await supabase
      .from('songbook_songs')
      .select('*')
      .order('category')
      .order('sort_order')
      .order('title');

    const { data: pageRows } = await supabase
      .from('songbook_pages')
      .select('*')
      .order('page_number');

    const mapped: SongbookSong[] = (songRows ?? []).map((s: any) => ({
      ...s,
      pages: (pageRows ?? []).filter((p: any) => p.song_id === s.id),
    }));
    setSongs(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addSong = useCallback(async (title: string, category: string, files: File[]) => {
    const { data: song, error } = await supabase
      .from('songbook_songs')
      .insert({ title, category })
      .select()
      .single();
    if (error || !song) throw error;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop() || 'png';
      const path = `${song.id}/${i + 1}.${ext}`;
      await supabase.storage.from(BUCKET).upload(path, file);
      await supabase.from('songbook_pages').insert({
        song_id: song.id,
        image_path: path,
        page_number: i + 1,
      });
    }
    await load();
    return song;
  }, [load]);

  const addPages = useCallback(async (songId: string, files: File[], startPage: number) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop() || 'png';
      const pageNum = startPage + i;
      const path = `${songId}/${pageNum}.${ext}`;
      await supabase.storage.from(BUCKET).upload(path, file);
      await supabase.from('songbook_pages').insert({
        song_id: songId,
        image_path: path,
        page_number: pageNum,
      });
    }
    await load();
  }, [load]);

  const deleteSong = useCallback(async (songId: string) => {
    const song = songs.find(s => s.id === songId);
    if (song) {
      const paths = song.pages.map(p => p.image_path);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    }
    await supabase.from('songbook_songs').delete().eq('id', songId);
    await load();
  }, [songs, load]);

  const deletePage = useCallback(async (pageId: string, imagePath: string) => {
    await supabase.storage.from(BUCKET).remove([imagePath]);
    await supabase.from('songbook_pages').delete().eq('id', pageId);
    await load();
  }, [load]);

  const updateSong = useCallback(async (id: string, updates: { title?: string; category?: string; sort_order?: number }) => {
    await supabase.from('songbook_songs').update(updates).eq('id', id);
    await load();
  }, [load]);

  const categories = [...new Set(songs.map(s => s.category))].sort();

  return {
    songs, loading, categories,
    addSong, addPages, deleteSong, deletePage, updateSong,
    getPublicUrl,
    reload: load,
  };
}
