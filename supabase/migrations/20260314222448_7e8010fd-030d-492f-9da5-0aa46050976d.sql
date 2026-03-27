
-- Cantors table
CREATE TABLE public.cantors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cantors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read cantors" ON public.cantors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert cantors" ON public.cantors FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update cantors" ON public.cantors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Cantor melodies table
CREATE TABLE public.cantor_melodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cantor_id uuid NOT NULL REFERENCES public.cantors(id) ON DELETE CASCADE,
  psalm_title text,
  melody_name text NOT NULL,
  key text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cantor_melodies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read melodies" ON public.cantor_melodies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert melodies" ON public.cantor_melodies FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update melodies" ON public.cantor_melodies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete melodies" ON public.cantor_melodies FOR DELETE TO anon, authenticated USING (true);

-- Cantor selections table
CREATE TABLE public.cantor_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cantor_id uuid NOT NULL REFERENCES public.cantors(id) ON DELETE CASCADE,
  melody_id uuid REFERENCES public.cantor_melodies(id) ON DELETE SET NULL,
  mass_date date NOT NULL,
  mass_time text,
  custom_melody text,
  custom_key text,
  psalm_title text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cantor_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read selections" ON public.cantor_selections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert selections" ON public.cantor_selections FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update selections" ON public.cantor_selections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete selections" ON public.cantor_selections FOR DELETE TO anon, authenticated USING (true);
