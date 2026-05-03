-- Public-safe realtime “heartbeat” for order KV changes.
-- Browsers subscribe to this one row only (no PII). A trigger bumps the counter when
-- kv_store_16010b6f gets an INSERT/UPDATE on keys like order:%, avoiding expensive
-- polling and extra Edge Function reads for every admin tab.
--
-- Realtime still uses one WebSocket per app — typically cheaper than repeated HTTP
-- polling to Edge Functions.

CREATE TABLE IF NOT EXISTS public.app_order_pulse (
  id int PRIMARY KEY CHECK (id = 1),
  bump bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_order_pulse (id, bump, updated_at)
VALUES (1, 0, now())
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_app_order_pulse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_order_pulse
  SET bump = bump + 1,
      updated_at = now()
  WHERE id = 1;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_kv_store_order_pulse_iu ON public.kv_store_16010b6f;
CREATE TRIGGER trg_kv_store_order_pulse_iu
  AFTER INSERT OR UPDATE ON public.kv_store_16010b6f
  FOR EACH ROW
  WHEN (NEW.key LIKE 'order:%')
  EXECUTE PROCEDURE public.bump_app_order_pulse();

DROP TRIGGER IF EXISTS trg_kv_store_order_pulse_del ON public.kv_store_16010b6f;
CREATE TRIGGER trg_kv_store_order_pulse_del
  AFTER DELETE ON public.kv_store_16010b6f
  FOR EACH ROW
  WHEN (OLD.key LIKE 'order:%')
  EXECUTE PROCEDURE public.bump_app_order_pulse();

ALTER TABLE public.app_order_pulse REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_order_pulse'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_order_pulse;
  END IF;
END
$$;

ALTER TABLE public.app_order_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_order_pulse_select_all" ON public.app_order_pulse;
CREATE POLICY "app_order_pulse_select_all"
  ON public.app_order_pulse
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.app_order_pulse TO anon, authenticated;
