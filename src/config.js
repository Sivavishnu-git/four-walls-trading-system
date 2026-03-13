const isDev = import.meta.env.DEV;

export const API_BASE = isDev ? "http://localhost:3000" : "";
export const AUTH_LOGIN_URL = `${API_BASE}/api/auth/login`;
