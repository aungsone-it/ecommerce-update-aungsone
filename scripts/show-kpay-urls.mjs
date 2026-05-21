#!/usr/bin/env node

const PROJECT_REF = "lmkthofnydxxgowryjcz";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!TOKEN) {
  console.error("Set SUPABASE_ACCESS_TOKEN first (Dashboard → Account → Access Tokens).");
  console.error("  export SUPABASE_ACCESS_TOKEN=sbp_...");
  console.error("  npm run kpay:urls");
  process.exit(1);
}

const URL_SECRET = /^(KPAY_|KBZ_).*(URL|PATH|NOTIFY|REFUND|BASE)/i;
const SKIP = /SIGN|SECRET|KEY|APPID|MERCH|TOKEN|TIMEOUT|WRAP|AUTO|STRICT|ENV|TRADE|SUB_|IDENTIFIER|CURRENCY|TYPE/i;

function pick(secrets, ...names) {
  for (const name of names) {
    const hit = secrets.find((s) => s.name === name);
    if (hit?.value) return hit.value.trim();
  }
  return "";
}

function fullUrl(base, pathOrUrl) {
  const p = (pathOrUrl || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const b = (base || "").trim();
  if (!b) return p;
  try {
    return new URL(p, b.endsWith("/") ? b : `${b}/`).toString();
  } catch {
    return `${b.replace(/\/$/, "")}/${p.replace(/^\//, "")}`;
  }
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});

if (!res.ok) {
  console.error(`Failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}

const secrets = await res.json();
const base = pick(secrets, "KPAY_PROXY_BASE_URL", "KPAY_BASE_URL");

const rows = [
  ["Proxy base", base],
  ["QR create", fullUrl(base, pick(secrets, "KPAY_PATH_CREATE_QR", "KPAY_CREATE_QR_PATH"))],
  ["Order query", fullUrl(base, pick(secrets, "KPAY_PATH_QUERY_ORDER", "KPAY_QUERY_ORDER_PATH"))],
  ["Refund", pick(secrets, "KPAY_PATH_REFUND", "KPAY_REFUND_PATH", "KPAY_REFUND_URL", "KBZ_VPS_REFUND_URL") || fullUrl(base, pick(secrets, "KPAY_PATH_REFUND", "KPAY_REFUND_PATH"))],
  ["Payment webhook (notify)", pick(secrets, "KPAY_NOTIFY_URL")],
  ["PWA return (frontend)", pick(secrets, "KPAY_PWA_FRONTEND_RETURN_URL")],
];

console.log("\nKPay endpoint URLs\n");
for (const [label, url] of rows) {
  console.log(`${label.padEnd(24)} ${url || "(not set)"}`);
}

const extras = secrets.filter(
  (s) =>
    URL_SECRET.test(s.name) &&
    !SKIP.test(s.name) &&
    !rows.some(([, url]) => url && url === s.value.trim()) &&
    !["KPAY_PROXY_BASE_URL", "KPAY_BASE_URL", "KPAY_PATH_CREATE_QR", "KPAY_CREATE_QR_PATH", "KPAY_PATH_QUERY_ORDER", "KPAY_QUERY_ORDER_PATH", "KPAY_PATH_REFUND", "KPAY_REFUND_PATH", "KPAY_REFUND_URL", "KBZ_VPS_REFUND_URL", "KPAY_NOTIFY_URL", "KPAY_PWA_FRONTEND_RETURN_URL"].includes(s.name),
);

if (extras.length) {
  console.log("\nOther URL secrets\n");
  for (const { name, value } of extras) {
    console.log(`${name.padEnd(24)} ${value}`);
  }
}

console.log("");
