CREATE TABLE public.settlement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL UNIQUE,
  month_label text NOT NULL,
  year integer NOT NULL,
  total_masses integer NOT NULL DEFAULT 0,
  total_amount integer NOT NULL DEFAULT 0,
  organist_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.settlement_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settlement history" ON public.settlement_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert settlement history" ON public.settlement_history FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update settlement history" ON public.settlement_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete settlement history" ON public.settlement_history FOR DELETE TO anon, authenticated USING (true);