
CREATE TABLE public.song_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  song_count integer NOT NULL DEFAULT 0,
  label text,
  songs_data jsonb NOT NULL
);

CREATE INDEX idx_song_backups_created_at ON public.song_backups (created_at DESC);

ALTER TABLE public.song_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read backups" ON public.song_backups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert backups" ON public.song_backups FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can delete backups" ON public.song_backups FOR DELETE TO anon, authenticated USING (true);
