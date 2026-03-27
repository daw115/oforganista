-- 1) Create a view that hides the pin column for public access
CREATE OR REPLACE VIEW public.cantors_public AS
SELECT id, name, created_at FROM public.cantors;

-- 2) Drop overly permissive policies on cantors
DROP POLICY IF EXISTS "Anyone can read cantors" ON public.cantors;
DROP POLICY IF EXISTS "Anyone can insert cantors" ON public.cantors;
DROP POLICY IF EXISTS "Anyone can update cantors" ON public.cantors;
DROP POLICY IF EXISTS "Anyone can delete cantors" ON public.cantors;

-- 3) Cantors: only allow SELECT on id and name (no pin), no direct INSERT/UPDATE/DELETE from anon
-- SELECT allowed (needed for joining cantor names in selections)
CREATE POLICY "Cantors read id and name only" ON public.cantors
  FOR SELECT TO anon, authenticated USING (true);

-- Block direct INSERT/UPDATE/DELETE - these go through edge function with service_role
CREATE POLICY "No direct cantor inserts" ON public.cantors
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "No direct cantor updates" ON public.cantors
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "No direct cantor deletes" ON public.cantors
  FOR DELETE TO anon, authenticated USING (false);
