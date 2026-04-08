import React, { useState, useEffect } from "react";
import { apiFetch } from "./api/client.js";
import { useAuth } from "./context/AuthContext.jsx";
import { isValidAccessToken } from "./utils/authToken";
import { Activity, LogIn, TrendingUp } from "lucide-react";
import { OIMonitor } from "./components/OIMonitor";
import { OrderPlacementPanel } from "./components/OrderPlacementPanel";

class TabErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", textAlign: "center", color: "#ef5350" }}>
          <h3>Something went wrong in this tab</h3>
          <pre style={{ fontSize: "0.8rem", color: "#888", whiteSpace: "pre-wrap" }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: "12px",
              padding: "8px 20px",
              background: "rgba(41,98,255,0.15)",
              border: "1px solid rgba(41,98,255,0.4)",
              color: "#2962ff",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const OAUTH_ERROR_HINTS = {
  token_exchange_failed: "Could not exchange the login code for a token. Check API secret and redirect URL on the server.",
  no_code: "Upstox did not return an authorization code. Try signing in again.",
};

function formatOAuthError(code) {
  if (!code) return "";
  const hint = OAUTH_ERROR_HINTS[code];
  return hint ? `${hint} (${code})` : code;
}

function App() {
  const { accessToken, loginWithUpstox, oauthError, clearOAuthError } = useAuth();

  const [instrumentKey, setInstrumentKey] = useState(import.meta.env.VITE_INSTRUMENT_KEY || "");
  const [instrumentSymbol, setInstrumentSymbol] = useState("");
  const [niftyFutLtp, setNiftyFutLtp] = useState(null);
  const [niftyFutChange, setNiftyFutChange] = useState(null);

  useEffect(() => {
    apiFetch("/api/tools/discover-nifty-future")
      .then((r) => r.json())
      .then((json) => {
        if (json.status === "success" && json.data?.instrument_key) {
          setInstrumentKey(json.data.instrument_key);
          setInstrumentSymbol(json.data.display_name || json.data.trading_symbol || "");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isValidAccessToken(accessToken) || !instrumentKey) {
      setNiftyFutLtp(null);
      setNiftyFutChange(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiFetch(
          `/api/quotes?instrument_keys=${encodeURIComponent(instrumentKey)}`,
          { accessToken },
        );
        const json = await res.json();
        if (cancelled || !json?.data) return;
        const quote = json.data[instrumentKey] || Object.values(json.data)[0];
        if (quote && typeof quote.last_price === "number") {
          setNiftyFutLtp(quote.last_price);
          setNiftyFutChange(typeof quote.net_change === "number" ? quote.net_change : null);
        }
      } catch {
        if (!cancelled) {
          setNiftyFutLtp(null);
          setNiftyFutChange(null);
        }
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [accessToken, instrumentKey]);

  const tokenExpired = !isValidAccessToken(accessToken);

  if (tokenExpired) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            background: "#131722",
            borderBottom: "2px solid #2a2e39",
            padding: "0 16px",
            minHeight: 52,
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TrendingUp size={22} color="#26a69a" strokeWidth={2} />
            <div>
              <div
                style={{ fontWeight: 700, color: "#fff", fontSize: "1rem", letterSpacing: "-0.02em" }}
              >
                Four Walls Trading
              </div>
              <div style={{ fontSize: "0.7rem", color: "#888", fontWeight: 500 }}>OI Monitor</div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 6,
              background: "rgba(239,83,80,0.15)",
              border: "1px solid rgba(239,83,80,0.35)",
              color: "#ef5350",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            <LogIn size={14} />
            Login required
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
            background: "#131722",
          }}
        >
          {oauthError ? (
            <div
              style={{
                marginBottom: 20,
                padding: "12px 16px",
                maxWidth: 440,
                borderRadius: 8,
                background: "rgba(239,83,80,0.12)",
                border: "1px solid rgba(239,83,80,0.35)",
                color: "#ffb4b4",
                fontSize: "0.88rem",
                lineHeight: 1.5,
              }}
            >
              {formatOAuthError(oauthError)}
              <button
                type="button"
                onClick={clearOAuthError}
                style={{
                  display: "block",
                  marginTop: 10,
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "#ccc",
                  borderRadius: 6,
                }}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "0.95rem",
              color: "#b0b3c0",
              textAlign: "center",
              maxWidth: 400,
              lineHeight: 1.55,
            }}
          >
            Sign in with <strong style={{ color: "#e0e0e0" }}>Upstox</strong>. After you approve access, you are sent
            back to this app with a token in the redirect URL; that token is saved here for API calls.
          </p>
          <button
            type="button"
            onClick={loginWithUpstox}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "12px 24px",
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(180deg, #2a7d6e 0%, #1e6b5e 100%)",
              border: "1px solid rgba(38,166,154,0.5)",
              borderRadius: 10,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(38, 166, 154, 0.25)",
            }}
          >
            <LogIn size={18} strokeWidth={2.5} />
            Login with Upstox
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="App"
      style={{
        minHeight: "100vh",
        height: "auto",
        width: "100%",
        maxWidth: "100vw",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#131722",
          borderBottom: "2px solid #2a2e39",
          padding: "0 16px",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Activity size={20} color="#26a69a" strokeWidth={2} />
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>OI Monitor</div>
            <div style={{ fontSize: "0.7rem", color: "#888" }}>Four Walls Trading</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {instrumentSymbol && (
            <span style={{ color: "#26a69a", fontSize: "0.8rem", fontWeight: 600 }}>{instrumentSymbol}</span>
          )}
          {niftyFutLtp != null && (
            <span
              title="NIFTY future last traded price (LTP)"
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "8px",
                fontFamily: "ui-monospace, monospace",
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "#fff",
              }}
            >
              <span style={{ color: "#888", fontSize: "0.7rem", fontWeight: 600 }}>LTP</span>
              {niftyFutLtp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {niftyFutChange != null && (
                <span
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: niftyFutChange >= 0 ? "#26a69a" : "#ef5350",
                  }}
                >
                  {niftyFutChange >= 0 ? "+" : ""}
                  {niftyFutChange.toFixed(2)}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          flex: "1 1 auto",
          minHeight: "calc(100vh - 52px)",
          overflow: "visible",
          position: "relative",
        }}
      >
        <OrderPlacementPanel instrumentKey={instrumentKey} accessToken={accessToken} />
        <TabErrorBoundary>
          <OIMonitor instrumentKey={instrumentKey} />
        </TabErrorBoundary>
      </div>
    </div>
  );
}

export default App;
