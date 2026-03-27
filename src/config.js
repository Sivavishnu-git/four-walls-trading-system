const isDev = import.meta.env.DEV;
const envApi = import.meta.env.VITE_API_BASE;

/** Node proxy base (no trailing slash). Dev defaults to localhost:3000; prod uses same-origin /api unless VITE_API_BASE is set. */
export const API_BASE =
  typeof envApi === "string" && envApi.trim() !== ""
    ? envApi.trim().replace(/\/$/, "")
    : isDev
      ? "http://localhost:3000"
      : "";

/** Opens your Node proxy → redirect to Upstox OAuth → callback issues access token → ?token= on FRONTEND_URI */
export const AUTH_LOGIN_URL = `${API_BASE}/api/auth/login`;
