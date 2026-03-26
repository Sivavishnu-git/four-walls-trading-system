import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AUTH_LOGIN_URL } from "../config";
import { normalizeAccessToken, isValidAccessToken } from "../utils/authToken";

const STORAGE_KEY = "upstox_access_token";

function readStoredToken() {
  const fromLs = localStorage.getItem(STORAGE_KEY) || "";
  /** In production, never seed session from Vite env (avoids skipping login when token is baked into the bundle). */
  const fromEnv = import.meta.env.DEV ? (import.meta.env.VITE_UPSTOX_ACCESS_TOKEN || "") : "";
  const candidate = normalizeAccessToken(fromLs || fromEnv);
  if (!isValidAccessToken(candidate)) {
    if (fromLs) localStorage.removeItem(STORAGE_KEY);
    return "";
  }
  return candidate;
}

/**
 * OAuth callback lands on FRONTEND_URI with ?token=... or ?error=...
 * That query is the source of truth on load; we persist token to localStorage and strip the URL.
 */
function readAuthFromRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken != null && urlToken !== "") {
    const t = normalizeAccessToken(urlToken);
    const path = window.location.pathname;
    window.history.replaceState({}, "", path);
    if (isValidAccessToken(t)) {
      localStorage.setItem(STORAGE_KEY, t);
      return { accessToken: t, oauthError: "" };
    }
    localStorage.removeItem(STORAGE_KEY);
    return { accessToken: "", oauthError: "" };
  }

  const err = params.get("error");
  if (err) {
    const path = window.location.pathname;
    window.history.replaceState({}, "", path);
    return { accessToken: readStoredToken(), oauthError: err };
  }

  return { accessToken: readStoredToken(), oauthError: "" };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [{ accessToken, oauthError }, setAuth] = useState(readAuthFromRedirectUrl);

  const clearOAuthError = useCallback(() => {
    setAuth((prev) => ({ ...prev, oauthError: "" }));
  }, []);

  const loginRedirect = useCallback(() => {
    clearOAuthError();
    window.location.href = AUTH_LOGIN_URL;
  }, [clearOAuthError]);

  const value = useMemo(
    () => ({
      accessToken,
      oauthError,
      clearOAuthError,
      loginRedirect,
    }),
    [accessToken, oauthError, clearOAuthError, loginRedirect],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
