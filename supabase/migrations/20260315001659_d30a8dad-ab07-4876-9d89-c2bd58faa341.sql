INSERT INTO storage.buckets (id, name, public) VALUES ('musicxml', 'musicxml', true);

CREATE POLICY "Anyone can upload musicxml" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'musicxml');
CREATE POLICY "Anyone can read musicxml" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'musicxml');
CREATE POLICY "Anyone can delete musicxml" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'musicxml');

ALTER TABLE public.cantor_melodies ADD COLUMN musicxml_path text;