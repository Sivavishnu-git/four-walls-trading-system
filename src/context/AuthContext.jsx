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

function readInitialAccessToken() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    const t = normalizeAccessToken(urlToken);
    window.history.replaceState({}, "", window.location.pathname);
    if (isValidAccessToken(t)) {
      localStorage.setItem(STORAGE_KEY, t);
      return t;
    }
    return "";
  }
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

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessTokenState] = useState(readInitialAccessToken);

  const loginRedirect = useCallback(() => {
    window.location.href = AUTH_LOGIN_URL;
  }, []);

  const value = useMemo(
    () => ({
      accessToken,
      loginRedirect,
    }),
    [accessToken, loginRedirect],
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
