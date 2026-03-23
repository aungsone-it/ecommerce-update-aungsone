/**
 * Main storefront chat IDs (see FloatingChat). Must match server fallback
 * `conv-${sanitizedEmail}` when sending the first message.
 */
export function mainStoreConversationIdFromEmail(email: string): string {
  return `conv-${email.trim().replace(/[^a-zA-Z0-9]/g, "-")}`;
}
