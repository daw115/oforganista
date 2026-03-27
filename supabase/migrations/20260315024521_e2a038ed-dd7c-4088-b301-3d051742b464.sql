-- Storage bucket for songbook images
INSERT INTO storage.buckets (id, name, public) VALUES ('songbook', 'songbook', true);

-- Songbook songs table
CREATE TABLE public.songbook_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text DEFAULT 'Ogólne',
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.songbook_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read songbook" ON public.songbook_songs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert songbook" ON public.songbook_songs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update songbook" ON public.songbook_songs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete songbook" ON public.songbook_songs FOR DELETE TO anon, authenticated USING (true);

-- Songbook pages (images) table
CREATE TABLE public.songbook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.songbook_songs(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  page_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.songbook_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pages" ON public.songbook_pages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert pages" ON public.songbook_pages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update pages" ON public.songbook_pages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete pages" ON public.songbook_pages FOR DELETE TO anon, authenticated USING (true);

-- Storage RLS
CREATE POLICY "Anyone can upload songbook" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'songbook');
CREATE POLICY "Anyone can read songbook files" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'songbook');
CREATE POLICY "Anyone can delete songbook files" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'songbook');
