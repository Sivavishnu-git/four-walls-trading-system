/** Strip optional "Bearer " prefix and trim (Upstox accepts raw JWT in Authorization header). */
export function normalizeAccessToken(raw) {
  if (raw == null || typeof raw !== "string") return "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

/** Headers for Upstox REST calls; empty token yields no Authorization key. */
export function bearerAuthHeaders(raw) {
  const t = normalizeAccessToken(raw);
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

export const MIN_ACCESS_TOKEN_LEN = 20;

/** Values from docs/templates that must not count as a real session token. */
const PLACEHOLDER_TOKENS = new Set([
  "your_access_token_here",
  "your_access_token",
]);

export function isValidAccessToken(raw) {
  const t = normalizeAccessToken(raw);
  if (t.length < MIN_ACCESS_TOKEN_LEN) return false;
  if (PLACEHOLDER_TOKENS.has(t.toLowerCase())) return false;
  return true;
}
