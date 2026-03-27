
-- Create shared melodies table
CREATE TABLE public.melodies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  melody_name text NOT NULL,
  psalm_title text,
  musicxml_path text,
  notes text,
  created_by uuid REFERENCES public.cantors(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create cantor-melody assignments (links cantor to a melody with their preferred key)
CREATE TABLE public.cantor_melody_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cantor_id uuid NOT NULL REFERENCES public.cantors(id) ON DELETE CASCADE,
  melody_id uuid NOT NULL REFERENCES public.melodies(id) ON DELETE CASCADE,
  key text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(cantor_id, melody_id)
);

-- Enable RLS
ALTER TABLE public.melodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cantor_melody_assignments ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read/write melodies (same as cantor_melodies was)
CREATE POLICY "Anyone can read melodies" ON public.melodies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert melodies" ON public.melodies FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update melodies" ON public.melodies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete melodies" ON public.melodies FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Anyone can read assignments" ON public.cantor_melody_assignments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert assignments" ON public.cantor_melody_assignments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update assignments" ON public.cantor_melody_assignments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete assignments" ON public.cantor_melody_assignments FOR DELETE TO anon, authenticated USING (true);

-- Migrate existing data from cantor_melodies to melodies + assignments
INSERT INTO public.melodies (id, melody_name, psalm_title, musicxml_path, notes, created_by, created_at)
SELECT id, melody_name, psalm_title, musicxml_path, notes, cantor_id, created_at
FROM public.cantor_melodies;

INSERT INTO public.cantor_melody_assignments (cantor_id, melody_id, key)
SELECT cantor_id, id, key
FROM public.cantor_melodies;

-- Update cantor_selections foreign key to point to melodies table
ALTER TABLE public.cantor_selections DROP CONSTRAINT IF EXISTS cantor_selections_melody_id_fkey;
ALTER TABLE public.cantor_selections ADD CONSTRAINT cantor_selections_melody_id_fkey 
  FOREIGN KEY (melody_id) REFERENCES public.melodies(id) ON DELETE SET NULL;
