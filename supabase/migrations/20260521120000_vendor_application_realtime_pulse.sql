-- Lightweight realtime heartbeat for vendor_application:* KV changes.
-- Admin badges subscribe to this single row (no PII) instead of waiting for
-- slow full-table kv_store Realtime or 60s HTTP polling.

CREATE TABLE IF NOT EXISTS public.app_vendor_application_pulse (
  id int PRIMARY KEY CHECK (id = 1),
  bump bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_vendor_application_pulse (id, bump, updated_at)
VALUES (1, 0, now())
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_app_vendor_application_pulse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_vendor_application_pulse
  SET bump = bump + 1,
      updated_at = now()
  WHERE id = 1;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_kv_store_vendor_app_pulse_iu ON public.kv_store_16010b6f;
CREATE TRIGGER trg_kv_store_vendor_app_pulse_iu
  AFTER INSERT OR UPDATE ON public.kv_store_16010b6f
  FOR EACH ROW
  WHEN (NEW.key LIKE 'vendor_application:%')
  EXECUTE PROCEDURE public.bump_app_vendor_application_pulse();

DROP TRIGGER IF EXISTS trg_kv_store_vendor_app_pulse_del ON public.kv_store_16010b6f;
CREATE TRIGGER trg_kv_store_vendor_app_pulse_del
  AFTER DELETE ON public.kv_store_16010b6f
  FOR EACH ROW
  WHEN (OLD.key LIKE 'vendor_application:%')
  EXECUTE PROCEDURE public.bump_app_vendor_application_pulse();

ALTER TABLE public.app_vendor_application_pulse REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_vendor_application_pulse'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_vendor_application_pulse;
  END IF;
END
$$;

ALTER TABLE public.app_vendor_application_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_vendor_application_pulse_select_all" ON public.app_vendor_application_pulse;
CREATE POLICY "app_vendor_application_pulse_select_all"
  ON public.app_vendor_application_pulse
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.app_vendor_application_pulse TO anon, authenticated;
