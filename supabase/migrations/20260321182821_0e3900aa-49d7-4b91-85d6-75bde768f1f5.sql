
CREATE TABLE public.projector_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  room_code text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.projector_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read presets" ON public.projector_presets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert presets" ON public.projector_presets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update presets" ON public.projector_presets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete presets" ON public.projector_presets FOR DELETE TO anon, authenticated USING (true);
