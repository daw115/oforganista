INSERT INTO storage.buckets (id, name, public) VALUES ('songs', 'songs', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read songs" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'songs');
CREATE POLICY "Anyone can upload songs" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'songs');
CREATE POLICY "Anyone can update songs" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'songs') WITH CHECK (bucket_id = 'songs');