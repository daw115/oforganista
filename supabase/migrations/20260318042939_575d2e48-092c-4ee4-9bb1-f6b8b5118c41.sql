
ALTER TABLE public.devotions ADD COLUMN songbook_links jsonb DEFAULT '[]'::jsonb;

UPDATE public.devotions
SET songbook_links = jsonb_build_array(jsonb_build_object('label', 'Śpiewnik', 'page', songbook_page))
WHERE songbook_page IS NOT NULL;

ALTER TABLE public.devotions DROP COLUMN songbook_page;
