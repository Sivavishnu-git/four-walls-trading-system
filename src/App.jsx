import React, { useState, useEffect } from "react";
import { API_BASE, AUTH_LOGIN_URL } from "./config";
import { Activity, BarChart3, LogIn, Target, Crosshair, ShoppingCart, TrendingUp } from "lucide-react";
import { OIMonitor } from "./components/OIMonitor";
import { HistoricalData } from "./components/HistoricalData";
import { OptionChain } from "./components/OptionChain";
import { TradeSetup } from "./components/TradeSetup";
import { OrderPanel } from "./components/OrderPanel";
import { TradingViewChart } from "./components/TradingViewChart";

class TabErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", textAlign: "center", color: "#ef5350" }}>
          <h3>Something went wrong in this tab</h3>
          <pre style={{ fontSize: "0.8rem", color: "#888", whiteSpace: "pre-wrap" }}>{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: "12px", padding: "8px 20px", background: "rgba(41,98,255,0.15)", border: "1px solid rgba(41,98,255,0.4)", color: "#2962ff", borderRadius: "6px", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [accessToken, setAccessToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      localStorage.setItem("upstox_access_token", urlToken);
      window.history.replaceState({}, "", window.location.pathname);
      return urlToken;
    }
    return (
      localStorage.getItem("upstox_access_token") ||
      import.meta.env.VITE_UPSTOX_ACCESS_TOKEN ||
      ""
    );
  });

  const [instrumentKey, setInstrumentKey] = useState(
    import.meta.env.VITE_INSTRUMENT_KEY || ""
  );
  const [instrumentSymbol, setInstrumentSymbol] = useState("");
  const [page, setPage] = useState("oi");
  const [niftyFutLtp, setNiftyFutLtp] = useState(null);
  const [niftyFutChange, setNiftyFutChange] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/tools/discover-nifty-future`)
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
    if (!accessToken || accessToken.length < 20 || !instrumentKey) {
      setNiftyFutLtp(null);
      setNiftyFutChange(null);
      return;
    }
    const token = accessToken.replace(/^Bearer\s+/i, "").trim();
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/quotes?instrument_keys=${encodeURIComponent(instrumentKey)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
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

  const handleLogin = () => {
    window.location.href = AUTH_LOGIN_URL;
  };

  const tokenExpired = !accessToken || accessToken.length < 20;

  const tabStyle = (id, color) => ({
    padding: "14px 24px",
    background: "transparent",
    border: "none",
    borderBottom: page === id ? `3px solid ${color}` : "3px solid transparent",
    color: page === id ? color : "#666",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "0.9rem",
    fontWeight: 600,
    transition: "all 0.2s",
  });

  return (
    <div className="App" style={{ height: "100vh", width: "100vw", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#131722",
        borderBottom: "2px solid #2a2e39",
        padding: "0 16px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
          <button onClick={() => setPage("oi")} style={tabStyle("oi", "#26a69a")}>
            <Activity size={16} /> OI Monitor
          </button>
          <button onClick={() => setPage("historical")} style={tabStyle("historical", "#2962ff")}>
            <BarChart3 size={16} /> Historical Data
          </button>
          <button onClick={() => setPage("optionchain")} style={tabStyle("optionchain", "#ff9800")}>
            <Target size={16} /> OI Analysis
          </button>
          <button onClick={() => setPage("tradesetup")} style={tabStyle("tradesetup", "#2962ff")}>
            <Crosshair size={16} /> Trade Setup
          </button>
          <button onClick={() => setPage("chart")} style={tabStyle("chart", "#e040fb")}>
            <TrendingUp size={16} /> Chart
          </button>
          <button onClick={() => setPage("orders")} style={tabStyle("orders", "#ff9800")}>
            <ShoppingCart size={16} /> Orders
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {instrumentSymbol && (
            <span style={{ color: "#26a69a", fontSize: "0.8rem", fontWeight: 600 }}>
              {instrumentSymbol}
            </span>
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
          <button
            onClick={handleLogin}
            style={{
              padding: "8px 16px",
              background: tokenExpired ? "rgba(239,83,80,0.2)" : "rgba(38,166,154,0.15)",
              border: `1px solid ${tokenExpired ? "rgba(239,83,80,0.4)" : "rgba(38,166,154,0.3)"}`,
              color: tokenExpired ? "#ef5350" : "#26a69a",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            <LogIn size={14} />
            {tokenExpired ? "Login Required" : "Re-Login"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <div style={{ display: page === "oi" ? "block" : "none", height: "100%", overflow: "auto" }}>
          <TabErrorBoundary><OIMonitor token={accessToken} instrumentKey={instrumentKey} /></TabErrorBoundary>
        </div>
        <div style={{ display: page === "historical" ? "block" : "none", height: "100%", overflow: "auto" }}>
          <TabErrorBoundary><HistoricalData token={accessToken} instrumentKey={instrumentKey} /></TabErrorBoundary>
        </div>
        <div style={{ display: page === "optionchain" ? "block" : "none", height: "100%", overflow: "auto" }}>
          <TabErrorBoundary><OptionChain token={accessToken} /></TabErrorBoundary>
        </div>
        <div style={{ display: page === "tradesetup" ? "block" : "none", height: "100%", overflow: "auto" }}>
          <TabErrorBoundary><TradeSetup token={accessToken} /></TabErrorBoundary>
        </div>
        <div style={{ display: page === "chart" ? "block" : "none", height: "100%", overflow: "hidden" }}>
          {page === "chart" && (
            <TabErrorBoundary><TradingViewChart token={accessToken} /></TabErrorBoundary>
          )}
        </div>
        <div style={{ display: page === "orders" ? "block" : "none", height: "100%", overflow: "auto" }}>
          <TabErrorBoundary><OrderPanel token={accessToken} /></TabErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default App;
