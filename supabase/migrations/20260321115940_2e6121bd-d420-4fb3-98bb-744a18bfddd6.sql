
CREATE TABLE public.songs (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  room_code text
);

CREATE INDEX idx_songs_updated_at ON public.songs (updated_at);
CREATE INDEX idx_songs_room_code ON public.songs (room_code);

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read songs" ON public.songs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert songs" ON public.songs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update songs" ON public.songs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete songs" ON public.songs FOR DELETE TO anon, authenticated USING (true);
