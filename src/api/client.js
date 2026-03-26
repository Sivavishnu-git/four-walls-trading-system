import { API_BASE } from "../config.js";
import { bearerAuthHeaders } from "../utils/authToken.js";

/** Full URL for a path like `/api/quotes` (uses `API_BASE` from env / same-origin in prod). */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

/**
 * `fetch` to the Node proxy with consistent headers for JSON APIs.
 * Pass `accessToken` to send `Authorization: Bearer …` (from OAuth redirect → localStorage).
 */
export function apiFetch(path, { accessToken, headers: extraHeaders = {}, ...init } = {}) {
  return fetch(apiUrl(path), {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...extraHeaders,
      ...bearerAuthHeaders(accessToken ?? ""),
    },
  });
}
