-- Public-safe realtime heartbeat rows for broad KV domains.
--
-- This replaces the frontend's unfiltered kv_store_16010b6f subscription with
-- a tiny pulse table. Browsers receive only domain names + non-PII detail, not
-- every KV row payload.

CREATE TABLE IF NOT EXISTS public.app_kv_domain_pulse (
  domain text PRIMARY KEY CHECK (
    domain IN ('products', 'categories', 'customers', 'vendors', 'marketing')
  ),
  bump bigint NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_kv_domain_pulse (domain, bump, detail, updated_at)
VALUES
  ('products', 0, '{}'::jsonb, now()),
  ('categories', 0, '{}'::jsonb, now()),
  ('customers', 0, '{}'::jsonb, now()),
  ('vendors', 0, '{}'::jsonb, now()),
  ('marketing', 0, '{}'::jsonb, now())
ON CONFLICT (domain) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_app_kv_domain_pulse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kv_key text := COALESCE(NEW.key, OLD.key);
  kv_domain text := NULL;
  kv_detail jsonb := '{}'::jsonb;
  audience_vendor_id text;
BEGIN
  IF kv_key IS NULL OR kv_key = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF kv_key LIKE 'product:%' THEN
    kv_domain := 'products';
  ELSIF kv_key LIKE 'category:%' THEN
    kv_domain := 'categories';
  ELSIF kv_key LIKE 'vendor:audience:%' THEN
    kv_domain := 'customers';
    audience_vendor_id := btrim(substr(kv_key, length('vendor:audience:') + 1));
    IF audience_vendor_id <> '' THEN
      kv_detail := jsonb_build_object('event', 'audience', 'vendorIds', jsonb_build_array(audience_vendor_id));
    ELSE
      kv_detail := jsonb_build_object('event', 'audience');
    END IF;
  ELSIF kv_key LIKE 'customer:%'
     OR kv_key LIKE 'user:%'
     OR kv_key LIKE 'auth:user:%'
     OR kv_key LIKE 'userId:%' THEN
    kv_domain := 'customers';
    kv_detail := jsonb_build_object('event', 'audience');
  ELSIF kv_key LIKE 'vendor_application:%' THEN
    -- app_vendor_application_pulse handles this domain with faster debounce.
    RETURN COALESCE(NEW, OLD);
  ELSIF kv_key LIKE 'vendor:%'
     OR kv_key LIKE 'vendor_settings:%'
     OR kv_key LIKE 'vendor_storefront_%'
     OR kv_key LIKE 'vendor_slug_%' THEN
    kv_domain := 'vendors';
  ELSIF kv_key LIKE 'campaign:%'
     OR kv_key LIKE 'coupon:%' THEN
    kv_domain := 'marketing';
  END IF;

  IF kv_domain IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.app_kv_domain_pulse
  SET bump = bump + 1,
      detail = kv_detail,
      updated_at = now()
  WHERE domain = kv_domain;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_kv_store_domain_pulse_iu ON public.kv_store_16010b6f;
CREATE TRIGGER trg_kv_store_domain_pulse_iu
  AFTER INSERT OR UPDATE ON public.kv_store_16010b6f
  FOR EACH ROW
  EXECUTE PROCEDURE public.bump_app_kv_domain_pulse();

DROP TRIGGER IF EXISTS trg_kv_store_domain_pulse_del ON public.kv_store_16010b6f;
CREATE TRIGGER trg_kv_store_domain_pulse_del
  AFTER DELETE ON public.kv_store_16010b6f
  FOR EACH ROW
  EXECUTE PROCEDURE public.bump_app_kv_domain_pulse();

ALTER TABLE public.app_kv_domain_pulse REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_kv_domain_pulse'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_kv_domain_pulse;
  END IF;
END
$$;

ALTER TABLE public.app_kv_domain_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_kv_domain_pulse_select_all" ON public.app_kv_domain_pulse;
CREATE POLICY "app_kv_domain_pulse_select_all"
  ON public.app_kv_domain_pulse
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.app_kv_domain_pulse TO anon, authenticated;

COMMENT ON TABLE public.app_kv_domain_pulse IS 'Small non-PII heartbeat table for broad KV realtime invalidation domains.';
