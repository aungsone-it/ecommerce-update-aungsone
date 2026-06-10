#!/usr/bin/env bash
# Run orphaned KBZ PWA draft reconciliation (schedule every 10–15 min via cron / GitHub Actions).
#
# Required env:
#   SUPABASE_PROJECT_REF   e.g. lmkthofnydxxgowryjcz
#   KPAY_PWA_RECONCILE_SECRET  same value as Supabase Edge secret
#
# Example crontab:
#   */15 * * * * SUPABASE_PROJECT_REF=... KPAY_PWA_RECONCILE_SECRET=... /path/to/scripts/kpay-pwa-reconcile.sh

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
SECRET="${KPAY_PWA_RECONCILE_SECRET:?Set KPAY_PWA_RECONCILE_SECRET}"
MIN_AGE="${KPAY_PWA_RECONCILE_MIN_AGE_MINUTES:-10}"
LIMIT="${KPAY_PWA_RECONCILE_LIMIT:-100}"

URL="https://${PROJECT_REF}.supabase.co/functions/v1/make-server-16010b6f/kpay/pwa/reconcile"

curl -fsS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-kpay-reconcile-secret: ${SECRET}" \
  -d "{\"minAgeMinutes\":${MIN_AGE},\"limit\":${LIMIT}}"

echo ""
