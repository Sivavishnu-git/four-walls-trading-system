import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AUTH_LOGIN_URL } from "../config";
import { normalizeAccessToken, MIN_ACCESS_TOKEN_LEN } from "../utils/authToken";

const STORAGE_KEY = "upstox_access_token";

function readInitialAccessToken() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    const t = normalizeAccessToken(urlToken);
    localStorage.setItem(STORAGE_KEY, t);
    window.history.replaceState({}, "", window.location.pathname);
    return t;
  }
  const fromLs = localStorage.getItem(STORAGE_KEY) || "";
  const fromEnv = import.meta.env.VITE_UPSTOX_ACCESS_TOKEN || "";
  return normalizeAccessToken(fromLs || fromEnv);
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessTokenState] = useState(readInitialAccessToken);

  const saveAccessToken = useCallback((raw) => {
    const t = typeof raw === "string" ? normalizeAccessToken(raw) : "";
    if (t.length < MIN_ACCESS_TOKEN_LEN) return;
    localStorage.setItem(STORAGE_KEY, t);
    setAccessTokenState(t);
  }, []);

  const loginRedirect = useCallback(() => {
    window.location.href = AUTH_LOGIN_URL;
  }, []);

  const value = useMemo(
    () => ({
      accessToken,
      saveAccessToken,
      loginRedirect,
    }),
    [accessToken, saveAccessToken, loginRedirect],
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
