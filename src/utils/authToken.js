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

export function isValidAccessToken(raw) {
  return normalizeAccessToken(raw).length >= MIN_ACCESS_TOKEN_LEN;
}
