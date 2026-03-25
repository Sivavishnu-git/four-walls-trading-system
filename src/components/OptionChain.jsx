import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "../config";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Shield,
  AlertTriangle,
  Activity,
  ArrowUpCircle,
  ArrowDownCircle,
  Target,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { bearerAuthHeaders } from "../utils/authToken";

const NIFTY_STEP = 50;
const VISIBLE_RANGE = 15;

export const OptionChain = () => {
  const { accessToken: token } = useAuth();
  const [chain, setChain] = useState([]);
  const [spotPrice, setSpotPrice] = useState(0);
  const [expiryDate, setExpiryDate] = useState("");
  const [futureSymbol, setFutureSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expiryType, setExpiryType] = useState("weekly");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [prevChain, setPrevChain] = useState([]);
  const timerRef = useRef(null);

  const fetchChain = useCallback(async () => {
    if (!token) {
      setError("No access token. Please login first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/option-chain?expiry_type=${expiryType}`,
        { headers: bearerAuthHeaders(token) }
      );
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        const html = text.trimStart().startsWith("<");
        setError(
          html
            ? `Got HTML instead of JSON (${res.status}). Start the API proxy (port 3000) and ensure /api is proxied, or set VITE_API_BASE=http://localhost:3000 when using vite preview.`
            : `Invalid JSON response (${res.status}): ${text.slice(0, 120)}`
        );
        setChain([]);
        setSpotPrice(0);
        return;
      }
      if (json.status === "success" && json.data) {
        setPrevChain(chain);
        setChain(json.data.chain || []);
        setSpotPrice(json.data.spot_price || 0);
        setExpiryDate(json.data.expiry_date || "");
        setFutureSymbol(json.data.future_symbol || "");
        setLastRefresh(new Date());
      } else {
        setError(json.error || "Failed to fetch option chain");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, expiryType, chain]);

  useEffect(() => {
    fetchChain();
  }, [expiryType]);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchChain, 30000);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchChain]);

  const atmStrike = spotPrice > 0 ? Math.round(spotPrice / NIFTY_STEP) * NIFTY_STEP : 0;

  const filteredChain = chain.filter((row) => {
    if (!atmStrike) return true;
    return row.strike >= atmStrike - VISIBLE_RANGE * NIFTY_STEP && row.strike <= atmStrike + VISIBLE_RANGE * NIFTY_STEP;
  });

  const prevMap = {};
  prevChain.forEach((r) => (prevMap[r.strike] = r));

  let totalCallOI = 0, totalPutOI = 0;
  let atmCallOI = 0, atmPutOI = 0;
  let otmCallOI = 0, otmPutOI = 0;
  let itmCallOI = 0, itmPutOI = 0;
  let maxCallOI = { strike: 0, oi: 0 };
  let maxPutOI = { strike: 0, oi: 0 };

  chain.forEach((row) => {
    totalCallOI += row.ce.oi;
    totalPutOI += row.pe.oi;
    if (row.ce.oi > maxCallOI.oi) maxCallOI = { strike: row.strike, oi: row.ce.oi };
    if (row.pe.oi > maxPutOI.oi) maxPutOI = { strike: row.strike, oi: row.pe.oi };
    if (!atmStrike) return;
    const diff = row.strike - atmStrike;
    if (Math.abs(diff) <= NIFTY_STEP) {
      atmCallOI += row.ce.oi;
      atmPutOI += row.pe.oi;
    } else if (row.strike > atmStrike) {
      otmCallOI += row.ce.oi;
      itmPutOI += row.pe.oi;
    } else {
      itmCallOI += row.ce.oi;
      otmPutOI += row.pe.oi;
    }
  });

  const pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : "N/A";
  const pcrValue = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

  const resistanceStrike = maxCallOI.strike;
  const supportStrike = maxPutOI.strike;
  const distToResistance = spotPrice > 0 ? resistanceStrike - spotPrice : 0;
  const distToSupport = spotPrice > 0 ? spotPrice - supportStrike : 0;

  const resistanceRow = chain.find((r) => r.strike === resistanceStrike);
  const resistancePrev = prevMap[resistanceStrike];
  const resistanceOIChange = resistanceRow && resistancePrev ? resistanceRow.ce.oi - resistancePrev.ce.oi : null;

  const supportRow = chain.find((r) => r.strike === supportStrike);
  const supportPrev = prevMap[supportStrike];
  const supportOIChange = supportRow && supportPrev ? supportRow.pe.oi - supportPrev.pe.oi : null;

  let resistanceVerdict = "HOLDING";
  let supportVerdict = "HOLDING";

  if (resistanceOIChange !== null) {
    if (resistanceOIChange < 0 && distToResistance < 100) resistanceVerdict = "LIKELY TO BREAK";
    else if (resistanceOIChange < 0) resistanceVerdict = "WEAKENING";
    else if (resistanceOIChange > 0) resistanceVerdict = "STRENGTHENING";
  }
  if (supportOIChange !== null) {
    if (supportOIChange < 0 && distToSupport < 100) supportVerdict = "LIKELY TO BREAK";
    else if (supportOIChange < 0) supportVerdict = "WEAKENING";
    else if (supportOIChange > 0) supportVerdict = "STRENGTHENING";
  }

  const fmt = (n) => {
    if (!n) return "0";
    if (n >= 10000000) return (n / 10000000).toFixed(2) + " Cr";
    if (n >= 100000) return (n / 100000).toFixed(2) + " L";
    if (n >= 1000) return (n / 1000).toFixed(1) + " K";
    return new Intl.NumberFormat("en-IN").format(n);
  };

  const getVerdictColor = (v) => {
    if (v === "LIKELY TO BREAK") return "#ef5350";
    if (v === "WEAKENING") return "#ffab40";
    if (v === "STRENGTHENING") return "#26a69a";
    return "#888";
  };

  const getVerdictIcon = (v) => {
    if (v === "LIKELY TO BREAK") return <AlertTriangle size={16} />;
    if (v === "WEAKENING") return <TrendingDown size={16} />;
    if (v === "STRENGTHENING") return <Shield size={16} />;
    return <Activity size={16} />;
  };

  return (
    <div className="oi-monitor-container">
      {/* Header */}
      <div className="oi-header" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: "1.3rem", fontWeight: 700 }}>
            <Target size={22} style={{ verticalAlign: "middle", marginRight: "8px", color: "#ff9800" }} />
            Option Chain OI Analysis
          </h2>
          {futureSymbol && (
            <span style={{
              background: "rgba(255,152,0,0.15)", border: "1px solid rgba(255,152,0,0.3)",
              padding: "4px 10px", borderRadius: "4px", color: "#ff9800", fontSize: "0.8rem", fontWeight: 600,
            }}>{futureSymbol}</span>
          )}
          {spotPrice > 0 && (
            <span style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, fontFamily: "monospace" }}>
              {spotPrice.toFixed(2)}
            </span>
          )}
          {expiryDate && <span style={{ color: "#666", fontSize: "0.8rem" }}>Exp: {expiryDate}</span>}
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select value={expiryType} onChange={(e) => setExpiryType(e.target.value)}
            style={{ padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
            <option value="weekly">Weekly Expiry</option>
            <option value="monthly">Monthly Expiry</option>
          </select>
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: "8px 14px",
              background: autoRefresh ? "rgba(38,166,154,0.2)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${autoRefresh ? "rgba(38,166,154,0.4)" : "rgba(255,255,255,0.15)"}`,
              color: autoRefresh ? "#26a69a" : "#888", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
            }}>
            {autoRefresh ? "Auto ON (30s)" : "Auto OFF"}
          </button>
          <button onClick={fetchChain} className="connect-btn" disabled={loading}>
            {loading ? <RefreshCw size={16} className="spinning" /> : <RefreshCw size={16} />}
            <span style={{ marginLeft: "6px" }}>{loading ? "Loading..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "14px 20px", background: "rgba(239,83,80,0.12)", border: "1px solid rgba(239,83,80,0.3)", borderRadius: "8px", color: "#ef5350", marginBottom: "16px", fontSize: "0.9rem" }}>
          {error}
        </div>
      )}

      {/* Resistance / Support Cards */}
      {spotPrice > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
          {/* Resistance */}
          <div style={{ background: "linear-gradient(135deg, rgba(239,83,80,0.08), rgba(239,83,80,0.02))", border: "1px solid rgba(239,83,80,0.2)", borderRadius: "12px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
              <div>
                <div style={{ color: "#ef5350", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
                  <ArrowUpCircle size={14} style={{ verticalAlign: "middle", marginRight: "4px" }} />Resistance (Max Call OI)
                </div>
                <div style={{ color: "#fff", fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{resistanceStrike.toLocaleString("en-IN")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#888", fontSize: "0.75rem" }}>Call OI</div>
                <div style={{ color: "#ef5350", fontSize: "1.1rem", fontWeight: 600 }}>{fmt(maxCallOI.oi)}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ color: "#888", fontSize: "0.8rem" }}>Distance: </span>
                <span style={{ color: "#fff", fontWeight: 600 }}>{distToResistance.toFixed(0)} pts</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", color: getVerdictColor(resistanceVerdict), fontWeight: 700, fontSize: "0.85rem", background: `${getVerdictColor(resistanceVerdict)}15`, padding: "4px 10px", borderRadius: "4px" }}>
                {getVerdictIcon(resistanceVerdict)} {resistanceVerdict}
              </div>
            </div>
            {resistanceOIChange !== null && (
              <div style={{ marginTop: "8px", color: "#888", fontSize: "0.75rem" }}>
                OI Change: <span style={{ color: resistanceOIChange >= 0 ? "#26a69a" : "#ef5350", fontWeight: 600 }}>
                  {resistanceOIChange >= 0 ? "+" : ""}{fmt(resistanceOIChange)}
                </span>
                {resistanceOIChange < 0 ? " (Unwinding)" : " (Building)"}
              </div>
            )}
          </div>

          {/* Support */}
          <div style={{ background: "linear-gradient(135deg, rgba(38,166,154,0.08), rgba(38,166,154,0.02))", border: "1px solid rgba(38,166,154,0.2)", borderRadius: "12px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
              <div>
                <div style={{ color: "#26a69a", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
                  <ArrowDownCircle size={14} style={{ verticalAlign: "middle", marginRight: "4px" }} />Support (Max Put OI)
                </div>
                <div style={{ color: "#fff", fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{supportStrike.toLocaleString("en-IN")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#888", fontSize: "0.75rem" }}>Put OI</div>
                <div style={{ color: "#26a69a", fontSize: "1.1rem", fontWeight: 600 }}>{fmt(maxPutOI.oi)}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ color: "#888", fontSize: "0.8rem" }}>Distance: </span>
                <span style={{ color: "#fff", fontWeight: 600 }}>{distToSupport.toFixed(0)} pts</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", color: getVerdictColor(supportVerdict), fontWeight: 700, fontSize: "0.85rem", background: `${getVerdictColor(supportVerdict)}15`, padding: "4px 10px", borderRadius: "4px" }}>
                {getVerdictIcon(supportVerdict)} {supportVerdict}
              </div>
            </div>
            {supportOIChange !== null && (
              <div style={{ marginTop: "8px", color: "#888", fontSize: "0.75rem" }}>
                OI Change: <span style={{ color: supportOIChange >= 0 ? "#26a69a" : "#ef5350", fontWeight: 600 }}>
                  {supportOIChange >= 0 ? "+" : ""}{fmt(supportOIChange)}
                </span>
                {supportOIChange < 0 ? " (Unwinding)" : " (Building)"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="stats-grid" style={{ marginBottom: "20px" }}>
        <div className="stat-card">
          <div className="stat-label">PCR (Put/Call Ratio)</div>
          <div className="stat-value" style={{ color: pcrValue > 1.2 ? "#26a69a" : pcrValue < 0.8 ? "#ef5350" : "#ff9800" }}>{pcr}</div>
          <div className="stat-subtitle">{pcrValue > 1.2 ? "Bullish" : pcrValue < 0.8 ? "Bearish" : "Neutral"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ATM OI</div>
          <div className="stat-value small">
            <span style={{ color: "#ef5350" }}>C: {fmt(atmCallOI)}</span>{" / "}
            <span style={{ color: "#26a69a" }}>P: {fmt(atmPutOI)}</span>
          </div>
          <div className="stat-subtitle">At {atmStrike}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OTM Call OI (Above ATM)</div>
          <div className="stat-value" style={{ color: "#ef5350" }}>{fmt(otmCallOI)}</div>
          <div className="stat-subtitle">Resistance pressure</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OTM Put OI (Below ATM)</div>
          <div className="stat-value" style={{ color: "#26a69a" }}>{fmt(otmPutOI)}</div>
          <div className="stat-subtitle">Support cushion</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Call OI</div>
          <div className="stat-value" style={{ color: "#ef5350" }}>{fmt(totalCallOI)}</div>
          <div className="stat-subtitle">All strikes</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Put OI</div>
          <div className="stat-value" style={{ color: "#26a69a" }}>{fmt(totalPutOI)}</div>
          <div className="stat-subtitle">All strikes</div>
        </div>
      </div>

      {/* Option Chain Table */}
      <div className="history-section">
        <div className="section-header">
          <h2>Option Chain</h2>
          {lastRefresh && (
            <span style={{ color: "#888", fontSize: "0.8rem" }}>
              Updated: {lastRefresh.toLocaleTimeString("en-IN", { hour12: false })} • {filteredChain.length} strikes
            </span>
          )}
        </div>
        <div className="table-container" style={{ maxHeight: "600px" }}>
          {filteredChain.length === 0 ? (
            <div className="empty-state">
              <Target size={48} />
              <p>{loading ? "Loading option chain..." : "Click Refresh to load option chain data."}</p>
            </div>
          ) : (
            <table className="oi-table" style={{ fontSize: "0.82rem" }}>
              <thead>
                <tr>
                  <th colSpan={4} style={{ background: "rgba(239,83,80,0.1)", color: "#ef5350", textAlign: "center", borderRight: "2px solid #333" }}>CALLS (CE)</th>
                  <th style={{ background: "rgba(255,152,0,0.15)", color: "#ff9800", textAlign: "center" }}>STRIKE</th>
                  <th colSpan={4} style={{ background: "rgba(38,166,154,0.1)", color: "#26a69a", textAlign: "center", borderLeft: "2px solid #333" }}>PUTS (PE)</th>
                </tr>
                <tr>
                  <th>OI</th><th>OI Chg</th><th>Vol</th><th style={{ borderRight: "2px solid #333" }}>LTP</th>
                  <th style={{ textAlign: "center" }}>Price</th>
                  <th style={{ borderLeft: "2px solid #333" }}>LTP</th><th>Vol</th><th>OI Chg</th><th>OI</th>
                </tr>
              </thead>
              <tbody>
                {filteredChain.map((row) => {
                  const isATM = row.strike === atmStrike;
                  const isR = row.strike === resistanceStrike;
                  const isS = row.strike === supportStrike;
                  const prev = prevMap[row.strike];
                  const ceOIChg = prev ? row.ce.oi - prev.ce.oi : null;
                  const peOIChg = prev ? row.pe.oi - prev.pe.oi : null;
                  const ceITM = row.strike < spotPrice;
                  const peITM = row.strike > spotPrice;

                  return (
                    <tr key={row.strike} style={{
                      background: isATM ? "rgba(255,152,0,0.08)" : "transparent",
                      borderLeft: isATM ? "3px solid #ff9800" : "none",
                    }}>
                      <td style={{ fontWeight: 600, color: "#ef5350", background: ceITM ? "rgba(239,83,80,0.05)" : "transparent" }}>
                        {fmt(row.ce.oi)}{isR && <span style={{ marginLeft: "4px", color: "#ff9800", fontSize: "0.7rem" }}>MAX</span>}
                      </td>
                      <td style={{ color: ceOIChg > 0 ? "#26a69a" : ceOIChg < 0 ? "#ef5350" : "#555" }}>
                        {ceOIChg !== null ? `${ceOIChg >= 0 ? "+" : ""}${fmt(ceOIChg)}` : "-"}
                      </td>
                      <td style={{ color: "#aaa" }}>{fmt(row.ce.volume)}</td>
                      <td style={{ borderRight: "2px solid #333", color: "#ddd" }}>{row.ce.ltp > 0 ? row.ce.ltp.toFixed(2) : "-"}</td>
                      <td style={{
                        textAlign: "center", fontWeight: 700, fontSize: "0.9rem",
                        color: isATM ? "#ff9800" : "#fff",
                        background: isATM ? "rgba(255,152,0,0.15)" : "rgba(255,255,255,0.02)",
                      }}>
                        {row.strike.toLocaleString("en-IN")}
                        {isATM && <div style={{ fontSize: "0.6rem", color: "#ff9800" }}>ATM</div>}
                        {isR && !isATM && <div style={{ fontSize: "0.6rem", color: "#ef5350" }}>R</div>}
                        {isS && !isATM && <div style={{ fontSize: "0.6rem", color: "#26a69a" }}>S</div>}
                      </td>
                      <td style={{ borderLeft: "2px solid #333", color: "#ddd" }}>{row.pe.ltp > 0 ? row.pe.ltp.toFixed(2) : "-"}</td>
                      <td style={{ color: "#aaa" }}>{fmt(row.pe.volume)}</td>
                      <td style={{ color: peOIChg > 0 ? "#26a69a" : peOIChg < 0 ? "#ef5350" : "#555" }}>
                        {peOIChg !== null ? `${peOIChg >= 0 ? "+" : ""}${fmt(peOIChg)}` : "-"}
                      </td>
                      <td style={{ fontWeight: 600, color: "#26a69a", background: peITM ? "rgba(38,166,154,0.05)" : "transparent" }}>
                        {fmt(row.pe.oi)}{isS && <span style={{ marginLeft: "4px", color: "#ff9800", fontSize: "0.7rem" }}>MAX</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "20px", padding: "12px 16px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", marginTop: "16px", fontSize: "0.75rem", color: "#888", flexWrap: "wrap" }}>
        <span><span style={{ color: "#ff9800" }}>ATM</span> = At The Money</span>
        <span><span style={{ color: "#ef5350" }}>ITM CE</span> / <span style={{ color: "#26a69a" }}>ITM PE</span> = In The Money (shaded)</span>
        <span><strong>R</strong> = Resistance (Max Call OI)</span>
        <span><strong>S</strong> = Support (Max Put OI)</span>
        <span>PCR &gt; 1.2 = Bullish, PCR &lt; 0.8 = Bearish</span>
      </div>
    </div>
  );
};
