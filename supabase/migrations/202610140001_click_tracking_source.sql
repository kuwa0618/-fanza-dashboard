-- Additive migration: existing click_logs rows and public rankings stay unchanged.
-- Run once on the existing project's Supabase SQL Editor before/with deployment.
BEGIN;
ALTER TABLE public.click_logs ADD COLUMN IF NOT EXISTS link_source text;
ALTER TABLE public.click_logs ADD COLUMN IF NOT EXISTS link_type text;
COMMENT ON COLUMN public.click_logs.link_source IS 'Placement: search, recommendation, sale, related, ranking, favorites, history. NULL = legacy/unknown.';
COMMENT ON COLUMN public.click_logs.link_type IS 'image or button. NULL = legacy/unknown.';
CREATE INDEX IF NOT EXISTS click_logs_clicked_at_idx ON public.click_logs (clicked_at);
NOTIFY pgrst, 'reload schema';
COMMIT;
