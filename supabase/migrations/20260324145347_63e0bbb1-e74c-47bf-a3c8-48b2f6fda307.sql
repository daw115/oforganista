
CREATE TABLE public.harmonograms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  mass_date date NOT NULL,
  organist text NOT NULL,
  playlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  liturgical_day text,
  notes text
);

ALTER TABLE public.harmonograms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read harmonograms" ON public.harmonograms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert harmonograms" ON public.harmonograms FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update harmonograms" ON public.harmonograms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete harmonograms" ON public.harmonograms FOR DELETE TO anon, authenticated USING (true);
