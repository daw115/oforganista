
CREATE TABLE public.liturgy_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lit_date DATE NOT NULL,
  tab TEXT NOT NULL CHECK (tab IN ('songs', 'readings', 'calendar')),
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (lit_date, tab)
);

ALTER TABLE public.liturgy_cache ENABLE ROW LEVEL SECURITY;

-- Public read access (liturgy data is non-sensitive, shared for all users)
CREATE POLICY "Anyone can read liturgy cache"
  ON public.liturgy_cache FOR SELECT
  TO anon, authenticated
  USING (true);

-- Public insert/update access (any visitor can trigger cache refresh)
CREATE POLICY "Anyone can insert liturgy cache"
  ON public.liturgy_cache FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update liturgy cache"
  ON public.liturgy_cache FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
