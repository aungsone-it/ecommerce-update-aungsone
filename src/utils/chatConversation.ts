/**
 * Main storefront chat IDs (see FloatingChat). Must match server fallback
 * `conv-${sanitizedEmail}` when sending the first message.
 */
export function mainStoreConversationIdFromEmail(email: string): string {
  return `conv-${email.trim().replace(/[^a-zA-Z0-9]/g, "-")}`;
}

/** Must match Edge `normalizeChatEmail` / `sanitizeChatToken` / `normalizeChatVendorThreadToken` / `canonicalConversationIdFor`. */
export function normalizeChatEmailClient(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

export function sanitizeChatTokenClient(input: unknown): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function normalizeChatVendorThreadTokenClient(vendorId: unknown, vendorSource?: unknown): string {
  const rawId = String(vendorId || "").trim();
  const lowerId = rawId.toLowerCase();
  const looksTechnical =
    /^vendor[_-]vendor_/i.test(rawId) ||
    /^vendor-vendor_/i.test(rawId) ||
    /^vendor_\d/i.test(rawId);

  const sourceToken = sanitizeChatTokenClient(vendorSource);
  const idToken = sanitizeChatTokenClient(rawId);

  if (rawId && !looksTechnical && idToken) return idToken;
  if (sourceToken && sourceToken !== "secure") return sourceToken;
  if (lowerId === "secure" || sourceToken === "secure") return "secure";
  return idToken || sourceToken || "secure";
}

/** Same thread key as Edge `canonicalConversationIdFor` (FloatingChat + admin must use this when email is known). */
export function canonicalChatThreadId(
  customerEmail: unknown,
  vendorId?: unknown,
  vendorSource?: unknown
): string | null {
  const normalizedEmail = normalizeChatEmailClient(customerEmail);
  if (!normalizedEmail) return null;
  const emailToken = sanitizeChatTokenClient(normalizedEmail);
  if (!emailToken) return null;
  const vendorToken = normalizeChatVendorThreadTokenClient(vendorId, vendorSource);
  if (!vendorToken || vendorToken === "secure") return `conv-${emailToken}`;
  return `conv-vendor-${vendorToken}-${emailToken}`;
}

/** Same bucket as Edge `conversationBucketKeyFor` (admin inbox merge when Realtime id ≠ row id). */
export function conversationBucketKeyClient(conv: {
  customerEmail?: unknown;
  vendorId?: unknown;
  vendorSource?: unknown;
  id?: unknown;
}): string {
  const normalizedEmail = normalizeChatEmailClient(conv?.customerEmail);
  if (!normalizedEmail) return `conv-id:${String(conv?.id || "")}`;
  const vendorToken = normalizeChatVendorThreadTokenClient(conv?.vendorId, conv?.vendorSource);
  return `${normalizedEmail}::${vendorToken || "secure"}`;
}
