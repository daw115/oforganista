CREATE TABLE public.devotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time text,
  description text,
  recurrence_type text NOT NULL DEFAULT 'weekly',
  day_of_week integer,
  day_of_month integer,
  nth_occurrence integer,
  liturgical_periods text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read devotions" ON public.devotions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert devotions" ON public.devotions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update devotions" ON public.devotions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete devotions" ON public.devotions FOR DELETE TO anon, authenticated USING (true);