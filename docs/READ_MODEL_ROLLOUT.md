# Read Model Rollout Checklist

Use this when deploying the KV-to-SQL read-model changes.

## 1. Required Secrets

Set these before exposing monitoring endpoints:

- Supabase Edge secret: `EDGE_ADMIN_OPERATION_SECRET`
- Frontend env, if using the admin diagnostics UI: `VITE_ADMIN_OPERATION_SECRET`

The values must match. Monitoring endpoints reject requests without `x-admin-operation-secret`.

## 2. Deploy Order

1. Push database migrations:

   ```bash
   npm run db:push
   ```

2. Deploy Edge Functions:

   ```bash
   npm run deploy:edge
   ```

3. Deploy the frontend through the normal Vercel flow.

## 3. Validate

Preferred repeatable check:

```bash
SUPABASE_PROJECT_REF=<project-ref> \
SUPABASE_ANON_KEY=<anon-key> \
EDGE_ADMIN_OPERATION_SECRET=<secret> \
npm run validate:read-model
```

After deployment, call:

```bash
curl -H "Authorization: Bearer <anon-key>" \
  -H "x-admin-operation-secret: <secret>" \
  "https://<project-ref>.supabase.co/functions/v1/make-server-16010b6f/read-model/validate"
```

Expected result:

- `status: "ok"`: KV and SQL read-model counts are close enough.
- `status: "warning"`: inspect the `rows` deltas before relying fully on SQL reads.
- `status: "unavailable"`: a migration/table/RPC is missing or blocked.

Then call:

```bash
curl -H "Authorization: Bearer <anon-key>" \
  -H "x-admin-operation-secret: <secret>" \
  "https://<project-ref>.supabase.co/functions/v1/make-server-16010b6f/monitoring/summary"
```

Check:

- `requests.totalErrors`
- `requests.totalTimeouts`
- `requests.slowRequests`
- `readModels.status`
- `realtime.*.available`

## 4. Supabase Dashboard Checks

Monitor these during the first production window:

- Edge Function error count and p95 duration
- Database CPU and memory
- Slow queries
- Realtime connections and messages
- `kv_store_16010b6f` writes
- `app_*` read-model table row growth

## 5. Rollback Behavior

The API keeps KV fallbacks for SQL-first endpoints. If read models are unavailable or empty, the app should continue serving from KV.

If needed, redeploy the prior Edge Function without rolling back the additive migrations. The new tables are additive and do not delete or replace KV data.
