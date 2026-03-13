import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "../config";
import {
  RefreshCw, TrendingUp, TrendingDown, Activity, Target,
  ArrowUpCircle, ArrowDownCircle, Crosshair, Zap, Shield,
} from "lucide-react";

const STEP = 50;

const detectMarketPhase = (priceChange, oiChange) => {
  if (priceChange > 0 && oiChange > 0) return { phase: "LONG BUILDUP", color: "#26a69a", icon: "bull", desc: "Fresh longs — Bullish" };
  if (priceChange < 0 && oiChange > 0) return { phase: "SHORT BUILDUP", color: "#ef5350", icon: "bear", desc: "Fresh shorts — Bearish" };
  if (priceChange > 0 && oiChange < 0) return { phase: "SHORT COVERING", color: "#ffab40", icon: "weak-bull", desc: "Shorts exiting — Weak Bullish" };
  if (priceChange < 0 && oiChange < 0) return { phase: "PROFIT BOOKING", color: "#ff7043", icon: "weak-bear", desc: "Longs exiting — Weak Bearish" };
  return { phase: "NEUTRAL", color: "#888", icon: "neutral", desc: "No clear signal" };
};

const detectTrend = (candles) => {
  if (!candles || candles.length < 3) return { trend: "INSUFFICIENT DATA", color: "#888" };
  const first3 = candles.slice(0, 3);
  const highs = first3.map(c => c.high);
  const lows = first3.map(c => c.low);
  const closes = first3.map(c => c.close);

  const allHigher = highs[2] > highs[0] && lows[2] > lows[0];
  const allLower = highs[2] < highs[0] && lows[2] < lows[0];
  const closeUp = closes[2] > closes[0];
  const closeDown = closes[2] < closes[0];
  const range = Math.max(...highs) - Math.min(...lows);
  const bodyRange = Math.abs(closes[2] - closes[0]);

  if (allHigher && closeUp) return { trend: "UPTREND", color: "#26a69a", emoji: "🟢" };
  if (allLower && closeDown) return { trend: "DOWNTREND", color: "#ef5350", emoji: "🔴" };
  if (bodyRange < range * 0.3) return { trend: "SIDEWAYS", color: "#ff9800", emoji: "🟡" };
  if (closeUp) return { trend: "WEAK UPTREND", color: "#81c784", emoji: "🟢" };
  if (closeDown) return { trend: "WEAK DOWNTREND", color: "#e57373", emoji: "🔴" };
  return { trend: "SIDEWAYS", color: "#ff9800", emoji: "🟡" };
};

const findPosition = (ltp, pivots) => {
  if (!pivots || !ltp) return null;
  const levels = [
    { name: "R3", val: pivots.r3 },
    { name: "R2", val: pivots.r2 },
    { name: "R1", val: pivots.r1 },
    { name: "Pivot", val: pivots.pp },
    { name: "S1", val: pivots.s1 },
    { name: "S2", val: pivots.s2 },
    { name: "S3", val: pivots.s3 },
  ];
  for (let i = 0; i < levels.length - 1; i++) {
    if (ltp >= levels[i + 1].val && ltp <= levels[i].val) {
      return { above: levels[i], below: levels[i + 1] };
    }
  }
  if (ltp > levels[0].val) return { above: { name: "Above R3", val: ltp }, below: levels[0] };
  return { above: levels[levels.length - 1], below: { name: "Below S3", val: ltp } };
};

const generateTradeSignal = (trend, phase, position, atmOI, ltp, pivots) => {
  if (!position || !pivots || !ltp) return null;

  const signals = [];
  const below = position.below;
  const above = position.above;

  // Check ATM OI for confirmation
  let putOITotal = 0, callOITotal = 0;
  if (atmOI?.strikes) {
    atmOI.strikes.forEach(s => {
      putOITotal += s.put_oi || 0;
      callOITotal += s.call_oi || 0;
    });
  }
  const oiBullish = putOITotal > callOITotal;
  const oiBearish = callOITotal > putOITotal;

  // BULLISH SETUPS
  if ((trend.trend.includes("UPTREND") || trend.trend === "SIDEWAYS") &&
      (phase.phase === "LONG BUILDUP" || phase.phase === "SHORT COVERING")) {

    if (below.name === "Pivot" || below.name === "S1" || below.name === "S2") {
      const target = above.name;
      const targetVal = above.val;
      const pts = Math.round(targetVal - ltp);

      if (oiBullish) {
        signals.push({
          type: "BUY",
          action: `BUY CE when price stabilizes above ${below.name} (${below.val.toFixed(0)})`,
          target: `Target: ${target} (${targetVal.toFixed(0)}) → ~${pts} pts profit`,
          confidence: "HIGH",
          color: "#26a69a",
          reason: `${trend.trend} + ${phase.phase} + Put OI > Call OI (Bullish OI) + Price near ${below.name}`,
        });
      } else {
        signals.push({
          type: "BUY",
          action: `BUY CE when price stabilizes above ${below.name} (${below.val.toFixed(0)})`,
          target: `Target: ${target} (${targetVal.toFixed(0)}) → ~${pts} pts profit`,
          confidence: "MEDIUM",
          color: "#81c784",
          reason: `${trend.trend} + ${phase.phase} + Price near ${below.name} (OI not fully confirming)`,
        });
      }
    }
  }

  // BEARISH SETUPS
  if ((trend.trend.includes("DOWNTREND") || trend.trend === "SIDEWAYS") &&
      (phase.phase === "SHORT BUILDUP" || phase.phase === "PROFIT BOOKING")) {

    if (above.name === "Pivot" || above.name === "R1" || above.name === "R2") {
      const target = below.name;
      const targetVal = below.val;
      const pts = Math.round(ltp - targetVal);

      if (oiBearish) {
        signals.push({
          type: "SELL",
          action: `BUY PE when price rejects below ${above.name} (${above.val.toFixed(0)})`,
          target: `Target: ${target} (${targetVal.toFixed(0)}) → ~${pts} pts profit`,
          confidence: "HIGH",
          color: "#ef5350",
          reason: `${trend.trend} + ${phase.phase} + Call OI > Put OI (Bearish OI) + Price near ${above.name}`,
        });
      } else {
        signals.push({
          type: "SELL",
          action: `BUY PE when price rejects below ${above.name} (${above.val.toFixed(0)})`,
          target: `Target: ${target} (${targetVal.toFixed(0)}) → ~${pts} pts profit`,
          confidence: "MEDIUM",
          color: "#e57373",
          reason: `${trend.trend} + ${phase.phase} + Price near ${above.name}`,
        });
      }
    }
  }

  // NO TRADE
  if (signals.length === 0) {
    signals.push({
      type: "WAIT",
      action: "No clear setup — Wait for better price action confirmation",
      target: `Price between ${below.name} (${below.val.toFixed(0)}) and ${above.name} (${above.val.toFixed(0)})`,
      confidence: "LOW",
      color: "#888",
      reason: `${trend.trend} + ${phase.phase} — Conditions not fully aligned`,
    });
  }

  return signals;
};

export const TradeSetup = ({ token }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const fetchSetup = useCallback(async () => {
    if (!token) { setError("No access token. Please login first."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/trade-setup`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === "success") {
        setData(json.data);
        setLastRefresh(new Date());
      } else {
        setError(json.error || "Failed to load trade setup");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchSetup(); }, []);

  useEffect(() => {
    if (autoRefresh) timerRef.current = setInterval(fetchSetup, 15000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchSetup]);

  const pivots = data?.pivots;
  const live = data?.live;
  const candles = data?.five_min_candles;
  const atmOI = data?.atm_oi;

  const trend = detectTrend(candles);
  const priceChange = live ? (live.ltp - (live.open || live.ltp)) : 0;
  const oiChange = candles?.length >= 2 ? (candles[candles.length - 1].oi - candles[0].oi) : 0;
  const phase = detectMarketPhase(priceChange, oiChange);
  const position = findPosition(live?.ltp, pivots);
  const signals = generateTradeSignal(trend, phase, position, atmOI, live?.ltp, pivots);

  const fmt = (n) => {
    if (n == null) return "--";
    return n.toFixed(2);
  };

  const fmtOI = (n) => {
    if (!n) return "0";
    if (n >= 100000) return (n / 100000).toFixed(2) + " L";
    if (n >= 1000) return (n / 1000).toFixed(1) + " K";
    return n.toLocaleString("en-IN");
  };

  const pivotLevels = pivots ? [
    { name: "R3", val: pivots.r3, color: "#ef5350" },
    { name: "R2", val: pivots.r2, color: "#ef5350" },
    { name: "R1", val: pivots.r1, color: "#e57373" },
    { name: "Pivot", val: pivots.pp, color: "#ff9800" },
    { name: "S1", val: pivots.s1, color: "#81c784" },
    { name: "S2", val: pivots.s2, color: "#26a69a" },
    { name: "S3", val: pivots.s3, color: "#26a69a" },
  ] : [];

  return (
    <div className="oi-monitor-container">
      {/* Header */}
      <div className="oi-header" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: "1.3rem", fontWeight: 700 }}>
            <Crosshair size={22} style={{ verticalAlign: "middle", marginRight: "8px", color: "#2962ff" }} />
            Trade Setup
          </h2>
          {data?.future && (
            <span style={{ background: "rgba(41,98,255,0.15)", border: "1px solid rgba(41,98,255,0.3)", padding: "4px 10px", borderRadius: "4px", color: "#2962ff", fontSize: "0.8rem", fontWeight: 600 }}>
              {data.future.symbol}
            </span>
          )}
          {live && (
            <span style={{ color: "#fff", fontSize: "1.2rem", fontWeight: 700, fontFamily: "monospace" }}>
              {fmt(live.ltp)}
              <span style={{ color: live.change >= 0 ? "#26a69a" : "#ef5350", fontSize: "0.85rem", marginLeft: "8px" }}>
                {live.change >= 0 ? "+" : ""}{fmt(live.change)} ({live.change_pct?.toFixed(2)}%)
              </span>
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: "8px 14px",
              background: autoRefresh ? "rgba(38,166,154,0.2)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${autoRefresh ? "rgba(38,166,154,0.4)" : "rgba(255,255,255,0.15)"}`,
              color: autoRefresh ? "#26a69a" : "#888", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
            }}>
            {autoRefresh ? "Auto ON (15s)" : "Auto OFF"}
          </button>
          <button onClick={fetchSetup} className="connect-btn" disabled={loading}>
            {loading ? <RefreshCw size={16} className="spinning" /> : <RefreshCw size={16} />}
            <span style={{ marginLeft: "6px" }}>{loading ? "Loading..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "14px 20px", background: "rgba(239,83,80,0.12)", border: "1px solid rgba(239,83,80,0.3)", borderRadius: "8px", color: "#ef5350", marginBottom: "16px", fontSize: "0.9rem" }}>{error}</div>
      )}

      {/* Row 1: Trend + Market Phase */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        {/* Opening Range Trend */}
        <div style={{ background: `linear-gradient(135deg, ${trend.color}12, ${trend.color}05)`, border: `1px solid ${trend.color}40`, borderRadius: "12px", padding: "20px" }}>
          <div style={{ color: trend.color, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
            Opening Range Trend (First 15 min)
          </div>
          <div style={{ color: "#fff", fontSize: "1.6rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
            {trend.trend.includes("UP") ? <TrendingUp size={28} /> : trend.trend.includes("DOWN") ? <TrendingDown size={28} /> : <Activity size={28} />}
            {trend.trend}
          </div>
          {candles && candles.length >= 3 && (
            <div style={{ marginTop: "10px", fontSize: "0.8rem", color: "#aaa" }}>
              Candle 1: {candles[0].open.toFixed(0)}→{candles[0].close.toFixed(0)} |
              Candle 2: {candles[1].open.toFixed(0)}→{candles[1].close.toFixed(0)} |
              Candle 3: {candles[2].open.toFixed(0)}→{candles[2].close.toFixed(0)}
            </div>
          )}
        </div>

        {/* Market Phase */}
        <div style={{ background: `linear-gradient(135deg, ${phase.color}12, ${phase.color}05)`, border: `1px solid ${phase.color}40`, borderRadius: "12px", padding: "20px" }}>
          <div style={{ color: phase.color, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
            Market Phase (Price + OI)
          </div>
          <div style={{ color: "#fff", fontSize: "1.6rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
            <Zap size={28} style={{ color: phase.color }} />
            {phase.phase}
          </div>
          <div style={{ marginTop: "8px", color: "#aaa", fontSize: "0.8rem" }}>{phase.desc}</div>
          <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "#666" }}>
            Price: {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)} | OI: {oiChange >= 0 ? "+" : ""}{fmtOI(oiChange)}
          </div>
        </div>
      </div>

      {/* Row 2: Trade Signal */}
      {signals && signals.map((sig, i) => (
        <div key={i} style={{
          background: `linear-gradient(135deg, ${sig.color}15, ${sig.color}05)`,
          border: `2px solid ${sig.color}60`,
          borderRadius: "12px", padding: "20px", marginBottom: "16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{
                  background: sig.color, color: "#fff", padding: "4px 12px", borderRadius: "4px",
                  fontSize: "0.85rem", fontWeight: 700,
                }}>
                  {sig.type === "BUY" ? "▲ BUY CE" : sig.type === "SELL" ? "▼ BUY PE" : "⏸ WAIT"}
                </span>
                <span style={{
                  background: sig.confidence === "HIGH" ? "rgba(38,166,154,0.2)" : sig.confidence === "MEDIUM" ? "rgba(255,152,0,0.2)" : "rgba(136,136,136,0.2)",
                  color: sig.confidence === "HIGH" ? "#26a69a" : sig.confidence === "MEDIUM" ? "#ff9800" : "#888",
                  padding: "4px 10px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700,
                }}>
                  {sig.confidence} CONFIDENCE
                </span>
              </div>
              <div style={{ color: "#fff", fontSize: "1.05rem", fontWeight: 600, marginBottom: "4px" }}>{sig.action}</div>
              <div style={{ color: sig.color, fontSize: "0.95rem", fontWeight: 600 }}>{sig.target}</div>
            </div>
          </div>
          <div style={{ marginTop: "12px", padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", fontSize: "0.8rem", color: "#aaa" }}>
            <strong>Reason:</strong> {sig.reason}
          </div>
        </div>
      ))}

      {/* Row 3: Pivot Points + ATM OI */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        {/* Pivot Points */}
        <div className="history-section">
          <div className="section-header">
            <h2>Pivot Points</h2>
            {pivots && <span style={{ color: "#888", fontSize: "0.75rem" }}>Prev Day: {new Date(pivots.date).toLocaleDateString("en-IN")}</span>}
          </div>
          <div className="table-container">
            {pivotLevels.length === 0 ? (
              <div className="empty-state"><Shield size={36} /><p>Loading pivot data...</p></div>
            ) : (
              <table className="oi-table" style={{ fontSize: "0.85rem" }}>
                <thead>
                  <tr><th>Level</th><th>Price</th><th>Distance</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {pivotLevels.map((lv) => {
                    const dist = live ? live.ltp - lv.val : 0;
                    const isNearest = position && (position.above.name === lv.name || position.below.name === lv.name);
                    return (
                      <tr key={lv.name} style={{ background: isNearest ? `${lv.color}15` : "transparent" }}>
                        <td style={{ color: lv.color, fontWeight: 700 }}>{lv.name}</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{lv.val.toFixed(2)}</td>
                        <td style={{ color: dist > 0 ? "#26a69a" : "#ef5350", fontWeight: 600 }}>
                          {dist > 0 ? "+" : ""}{dist.toFixed(0)} pts
                        </td>
                        <td>
                          {isNearest && position.below.name === lv.name && (
                            <span style={{ color: "#26a69a", fontSize: "0.75rem", fontWeight: 700 }}>▲ SUPPORT</span>
                          )}
                          {isNearest && position.above.name === lv.name && (
                            <span style={{ color: "#ef5350", fontSize: "0.75rem", fontWeight: 700 }}>▼ RESISTANCE</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ATM OI */}
        <div className="history-section">
          <div className="section-header">
            <h2>ATM Option OI</h2>
            {atmOI && <span style={{ color: "#888", fontSize: "0.75rem" }}>ATM: {atmOI.atm_strike}</span>}
          </div>
          <div className="table-container">
            {!atmOI?.strikes ? (
              <div className="empty-state"><Target size={36} /><p>Loading ATM OI...</p></div>
            ) : (
              <table className="oi-table" style={{ fontSize: "0.85rem" }}>
                <thead>
                  <tr>
                    <th style={{ color: "#ef5350" }}>Call OI</th>
                    <th>Strike</th>
                    <th style={{ color: "#26a69a" }}>Put OI</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {atmOI.strikes.map((s) => {
                    const isATM = s.strike === atmOI.atm_strike;
                    const putDominant = (s.put_oi || 0) > (s.call_oi || 0);
                    return (
                      <tr key={s.strike} style={{ background: isATM ? "rgba(255,152,0,0.08)" : "transparent" }}>
                        <td style={{ color: "#ef5350", fontWeight: 600 }}>{fmtOI(s.call_oi)}</td>
                        <td style={{ fontWeight: 700, color: isATM ? "#ff9800" : "#fff", textAlign: "center" }}>
                          {s.strike}{isATM && <span style={{ fontSize: "0.65rem", color: "#ff9800" }}> ATM</span>}
                        </td>
                        <td style={{ color: "#26a69a", fontWeight: 600 }}>{fmtOI(s.put_oi)}</td>
                        <td style={{ fontSize: "0.75rem", color: putDominant ? "#26a69a" : "#ef5350", fontWeight: 600 }}>
                          {putDominant ? "▲ Bullish" : "▼ Bearish"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {atmOI?.strikes && (() => {
            let tCall = 0, tPut = 0;
            atmOI.strikes.forEach(s => { tCall += s.call_oi || 0; tPut += s.put_oi || 0; });
            const pcr = tCall > 0 ? (tPut / tCall).toFixed(2) : "N/A";
            return (
              <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", marginTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                <span style={{ color: "#888" }}>Near ATM PCR: <strong style={{ color: parseFloat(pcr) > 1 ? "#26a69a" : "#ef5350" }}>{pcr}</strong></span>
                <span style={{ color: parseFloat(pcr) > 1 ? "#26a69a" : "#ef5350", fontWeight: 700 }}>
                  {parseFloat(pcr) > 1.2 ? "Strong Bullish" : parseFloat(pcr) > 1 ? "Mild Bullish" : parseFloat(pcr) > 0.8 ? "Neutral" : "Bearish"}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 5-Min Candle Table */}
      {candles && candles.length > 0 && (
        <div className="history-section">
          <div className="section-header">
            <h2>5-Min Candles (Today)</h2>
            <span style={{ color: "#888", fontSize: "0.8rem" }}>{candles.length} candles</span>
          </div>
          <div className="table-container" style={{ maxHeight: "300px" }}>
            <table className="oi-table" style={{ fontSize: "0.82rem" }}>
              <thead>
                <tr><th>#</th><th>Time</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Vol</th><th>OI</th><th>OI Chg</th></tr>
              </thead>
              <tbody>
                {candles.map((c, i) => {
                  const bullish = c.close > c.open;
                  const oiChg = i > 0 ? c.oi - candles[i - 1].oi : 0;
                  return (
                    <tr key={i} style={{ background: i < 3 ? "rgba(41,98,255,0.05)" : "transparent" }}>
                      <td style={{ color: i < 3 ? "#2962ff" : "#555", fontSize: "0.75rem", fontWeight: i < 3 ? 700 : 400 }}>
                        {i + 1}{i < 3 && " *"}
                      </td>
                      <td className="time-cell">{new Date(c.time).toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit" })}</td>
                      <td>{c.open.toFixed(2)}</td>
                      <td style={{ color: "#26a69a" }}>{c.high.toFixed(2)}</td>
                      <td style={{ color: "#ef5350" }}>{c.low.toFixed(2)}</td>
                      <td style={{ color: bullish ? "#26a69a" : "#ef5350", fontWeight: 600 }}>{c.close.toFixed(2)}</td>
                      <td>{c.volume.toLocaleString("en-IN")}</td>
                      <td style={{ fontWeight: 600 }}>{fmtOI(c.oi)}</td>
                      <td style={{ color: oiChg > 0 ? "#26a69a" : oiChg < 0 ? "#ef5350" : "#555", fontWeight: 600 }}>
                        {oiChg !== 0 ? `${oiChg > 0 ? "+" : ""}${fmtOI(oiChg)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {candles.length >= 3 && (
            <div style={{ padding: "8px 14px", background: "rgba(41,98,255,0.08)", borderRadius: "6px", marginTop: "8px", fontSize: "0.75rem", color: "#2962ff" }}>
              * First 3 candles (15 min) used for Opening Range trend detection
            </div>
          )}
        </div>
      )}

      {lastRefresh && (
        <div style={{ textAlign: "center", color: "#555", fontSize: "0.75rem", marginTop: "12px" }}>
          Last updated: {lastRefresh.toLocaleTimeString("en-IN", { hour12: false })}
        </div>
      )}
    </div>
  );
};
