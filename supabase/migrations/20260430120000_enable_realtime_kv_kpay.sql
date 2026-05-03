-- Enable Supabase Realtime broadcasts on the kv_store_16010b6f table so the
-- frontend can subscribe to live changes for `kpay_txn:{merchantOrderId}` rows.
-- When the public `kpay-webhook` Edge Function processes a KBZ webhook callback
-- and upserts the row, this publication causes Postgres to push the new row
-- value over Realtime to any subscribed client (the checkout page), which lets
-- the UI flip the "I've Completed Payment" button from disabled -> enabled
-- without any client-side polling.
--
-- ALTER PUBLICATION ... ADD TABLE is idempotent only if the table is not already
-- in the publication; this DO block tolerates re-runs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kv_store_16010b6f'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kv_store_16010b6f;
  END IF;
END
$$;

-- Realtime requires REPLICA IDENTITY FULL to broadcast UPDATE row contents
-- (otherwise Postgres only sends the primary key in update events, which means
-- our `value` JSONB column would not arrive to the client).
ALTER TABLE public.kv_store_16010b6f REPLICA IDENTITY FULL;
