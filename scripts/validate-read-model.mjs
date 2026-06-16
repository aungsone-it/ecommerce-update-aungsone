const projectRef = process.env.SUPABASE_PROJECT_REF || process.env.VITE_SUPABASE_PROJECT_ID || "";
const supabaseUrl =
  process.env.SUPABASE_URL ||
  (projectRef ? `https://${projectRef}.supabase.co` : "");
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const adminSecret = process.env.EDGE_ADMIN_OPERATION_SECRET || process.env.VITE_ADMIN_OPERATION_SECRET || "";

if (!supabaseUrl || !anonKey || !adminSecret) {
  console.error(
    [
      "Missing validation env.",
      "Required: SUPABASE_URL or SUPABASE_PROJECT_REF, SUPABASE_ANON_KEY, EDGE_ADMIN_OPERATION_SECRET.",
      "Example:",
      "SUPABASE_PROJECT_REF=xxxx SUPABASE_ANON_KEY=... EDGE_ADMIN_OPERATION_SECRET=... npm run validate:read-model",
    ].join("\n")
  );
  process.exit(2);
}

const base = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/make-server-16010b6f`;

async function requestJson(path) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "x-admin-operation-secret": adminSecret,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const readModel = await requestJson("/read-model/validate");
const monitoring = await requestJson("/monitoring/summary");

console.log("Read model validation:");
console.log(JSON.stringify(readModel, null, 2));
console.log("\nMonitoring summary:");
console.log(JSON.stringify(
  {
    uptimeSeconds: monitoring.uptimeSeconds,
    requests: monitoring.requests,
    readModels: monitoring.readModels,
    realtime: monitoring.realtime,
  },
  null,
  2
));

const status = String(readModel.status || readModel.summary?.status || "").toLowerCase();
if (status && !["ok", "healthy"].includes(status)) {
  console.error(`Read model validation status is ${status}.`);
  process.exit(1);
}
