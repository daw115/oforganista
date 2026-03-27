
CREATE TABLE public.projector_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL UNIQUE,
  name text NOT NULL,
  pin_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_active_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.projector_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rooms" ON public.projector_rooms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert rooms" ON public.projector_rooms FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update rooms" ON public.projector_rooms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete rooms" ON public.projector_rooms FOR DELETE TO anon, authenticated USING (true);
