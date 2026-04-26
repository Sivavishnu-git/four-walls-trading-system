import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../api/client.js";
import { computeIntradayPivots } from "../utils/intradayPivots.js";

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function nowISTMinutes() {
  const now = new Date();
  const ist = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = Number(ist.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(ist.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function getPhase() {
  const min = nowISTMinutes();
  if (min < 9 * 60 + 15) return "before";   // before 09:15
  if (min < 9 * 60 + 30) return "forming";   // 09:15–09:29 (candle building)
  return "complete";                          // 09:30+ (candle is final)
}

// ── styles ───────────────────────────────────────────────────────────────────
const BG     = "#131722";
const CARD   = "#1a1f2e";
const BORDER = "#2a2e39";
const TEXT   = "#d1d4dc";
const DIM    = "#787b86";
const GREEN  = "#26a69a";
const RED    = "#ef5350";
const BLUE   = "#2962ff";
const YELLOW = "#ffc107";
const PURPLE = "#9c27b0";
const ORANGE = "#ff7043";

const card = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: "16px 20px",
};

const label = {
  fontSize: "0.68rem",
  color: DIM,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
};

// ── pivot row ─────────────────────────────────────────────────────────────────
function PivotRow({ name, value, color, ltp, isCenter }) {
  const near =
    ltp != null && Number.isFinite(value) && Math.abs(ltp - value) / value < 0.002;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: isCenter ? "12px 16px" : "9px 16px",
        borderRadius: 7,
        background: near
          ? `${color}18`
          : isCenter
          ? `${color}10`
          : "transparent",
        border: near
          ? `1px solid ${color}66`
          : isCenter
          ? `1px solid ${color}44`
          : "1px solid transparent",
        transition: "background 0.3s",
      }}
    >
      {/* color bar */}
      <div
        style={{
          width: 3,
          height: isCenter ? 28 : 20,
          borderRadius: 2,
          background: color,
          marginRight: 12,
          flexShrink: 0,
        }}
      />

      {/* label */}
      <span
        style={{
          fontWeight: 800,
          color,
          fontSize: isCenter ? "0.92rem" : "0.82rem",
          minWidth: 34,
        }}
      >
        {name}
      </span>

      <div style={{ flex: 1 }} />

      {/* distance from LTP */}
      {ltp != null && Number.isFinite(value) && (
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            color: ltp >= value ? GREEN : RED,
            marginRight: 14,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {ltp >= value ? "+" : "-"}
          {fmt(Math.abs(ltp - value))}
        </span>
      )}

      {/* value */}
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: isCenter ? "1.1rem" : "1rem",
          fontWeight: 800,
          color: isCenter ? "#fff" : TEXT,
        }}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

function fmtOI(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN");
}

// ── main ─────────────────────────────────────────────────────────────────────
export function PivotCalculatorPage({ accessToken }) {
  const [phase, setPhase]           = useState(getPhase());
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [lastFetch, setLastFetch]   = useState(null);

  const [futureLabel, setFutureLabel] = useState("");
  const [ohlc, setOhlc]             = useState(null);   // { open, high, low, close, volume }
  const [pivots, setPivots]         = useState(null);
  const [ltp, setLtp]               = useState(null);
  const [ltpOI, setLtpOI]          = useState(null);

  // ── sentiment state ───────────────────────────────────────────────────────
  const [sentDate, setSentDate]       = useState(todayIST);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError, setSentError]     = useState(null);
  const [sentiment, setSentiment]     = useState(null);
  const [trend, setTrend]             = useState(null);

  const timerRef = useRef(null);

  // ── phase clock (1s) ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setPhase(getPhase()), 10_000);
    return () => clearInterval(id);
  }, []);

  // ── fetch trade-setup ─────────────────────────────────────────────────────
  async function load() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await apiFetch("/api/trade-setup", { accessToken });
      const json = await res.json();

      if (!res.ok || json.status === "error") {
        throw new Error(json.error || json.message || `HTTP ${res.status}`);
      }

      const { future, opening_15m_ohlc, live } = json.data ?? {};

      // ── future label ────────────────────────────────────────────────────
      if (future) {
        setFutureLabel(future.display_name || future.trading_symbol || "Nifty Future");
      }

      // ── live LTP + OI ───────────────────────────────────────────────────
      if (live) {
        setLtp(live.ltp ?? live.last_price ?? null);
        setLtpOI(live.oi ?? null);
      }

      // ── 15-min opening candle OHLC ──────────────────────────────────────
      if (opening_15m_ohlc) {
        const { open, high, low, close, volume } = opening_15m_ohlc;
        setOhlc({ open, high, low, close, volume });
        const result = computeIntradayPivots(open, high, low, close);
        if (result) setPivots(result);
      } else {
        // Candle not yet available (pre-market or API gap)
        setOhlc(null);
        setPivots(null);
      }

      setLastFetch(new Date().toLocaleTimeString("en-IN"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── sentiment fetch ───────────────────────────────────────────────────────
  async function loadSentiment(date) {
    if (!accessToken) return;
    setSentLoading(true);
    setSentError(null);
    try {
      const res  = await apiFetch(`/api/sentiment?date=${date || sentDate}`, { accessToken });
      const json = await res.json();
      if (!res.ok || json.status !== "success") throw new Error(json.error || `HTTP ${res.status}`);
      setSentiment(json.data.sentiment);
      setTrend(json.data.trend);
    } catch (e) {
      setSentError(e.message);
      setSentiment(null);
      setTrend(null);
    } finally {
      setSentLoading(false);
    }
  }

  useEffect(() => {
    if (accessToken) loadSentiment(sentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, sentDate]);

  // ── auto-refresh ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return;
    load();

    // Refresh every 60s after 09:30 (candle is final); every 15s while forming
    const interval = phase === "forming" ? 15_000 : 60_000;
    timerRef.current = setInterval(load, interval);
    return () => clearInterval(timerRef.current);
  }, [accessToken, phase]);

  // ── render ────────────────────────────────────────────────────────────────
  const phaseMeta = {
    before:   { color: YELLOW, dot: YELLOW, text: "Market not open yet — waiting for 09:15 IST" },
    forming:  { color: GREEN,  dot: GREEN,  text: "Candle forming — 09:15 → 09:29 IST (refreshes every 15s)" },
    complete: { color: BLUE,   dot: BLUE,   text: "Candle complete — pivots are final for today" },
  }[phase];

  return (
    <div
      style={{
        background: BG,
        minHeight: "100%",
        padding: "20px 16px 40px",
        boxSizing: "border-box",
        fontFamily: "'Inter','Segoe UI',sans-serif",
        color: TEXT,
        maxWidth: 760,
        margin: "0 auto",
      }}
    >
      {/* ── header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: `${PURPLE}22`, border: `1px solid ${PURPLE}55`,
            borderRadius: 6, padding: "2px 10px",
            fontSize: "0.7rem", fontWeight: 700, color: PURPLE,
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            Pivot
          </span>
          Opening Range Pivot Calculator
        </h2>
        <p style={{ margin: "5px 0 0", fontSize: "0.78rem", color: DIM, lineHeight: 1.5 }}>
          Uses the Nifty Future 15-minute candle O / H / L / C (Open at 09:15, Close at 09:30 IST)
          to compute intraday pivot levels PP · R1 · R2 · R3 · S1 · S2 · S3.
        </p>
      </div>

      {/* ── status bar ──────────────────────────────────────────────────── */}
      <div style={{ ...card, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: phaseMeta.dot, display: "inline-block",
            animation: phase === "forming" ? "pulse 1.2s infinite" : "none",
          }} />
          <span style={{ fontSize: "0.82rem", color: phaseMeta.color, fontWeight: 600 }}>
            {phaseMeta.text}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {futureLabel && (
            <span style={{ fontSize: "0.75rem", color: DIM, fontWeight: 600 }}>
              {futureLabel}
            </span>
          )}
          {ltp != null && (
            <span style={{ fontFamily: "ui-monospace,monospace", fontSize: "1.05rem", fontWeight: 800, color: "#fff" }}>
              <span style={{ fontSize: "0.68rem", color: DIM, marginRight: 5 }}>LTP</span>
              {fmt(ltp)}
            </span>
          )}
          {ltpOI != null && (
            <span style={{ fontSize: "0.75rem", color: DIM, fontFamily: "ui-monospace,monospace" }}>
              OI {Number(ltpOI).toLocaleString("en-IN")}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              padding: "5px 12px",
              background: loading ? "rgba(255,255,255,0.04)" : `${BLUE}22`,
              border: `1px solid ${BLUE}44`,
              borderRadius: 6, color: BLUE,
              fontSize: "0.75rem", fontWeight: 700, cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── error ───────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          ...card, marginBottom: 14,
          background: "rgba(239,83,80,0.08)", border: `1px solid ${RED}44`,
          color: RED, fontSize: "0.82rem",
        }}>
          {error}
        </div>
      )}

      {/* ── OHLC cards ──────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 10, marginBottom: 14,
      }}>
        {[
          { l: "Open  (09:15)",  v: ohlc?.open,   c: TEXT   },
          { l: "High",           v: ohlc?.high,   c: GREEN  },
          { l: "Low",            v: ohlc?.low,    c: RED    },
          { l: "Close (09:30)", v: ohlc?.close,  c: YELLOW },
        ].map(({ l, v, c }) => (
          <div key={l} style={card}>
            <div style={label}>{l}</div>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "1.1rem", fontWeight: 800, color: c }}>
              {v != null ? fmt(v) : <span style={{ color: DIM, fontSize: "0.85rem" }}>waiting…</span>}
            </div>
          </div>
        ))}
      </div>

      {ohlc?.volume != null && (
        <div style={{ marginBottom: 14, fontSize: "0.72rem", color: DIM, textAlign: "right" }}>
          Volume (09:15–09:30):{" "}
          <span style={{ color: TEXT, fontFamily: "ui-monospace,monospace" }}>
            {Number(ohlc.volume).toLocaleString("en-IN")}
          </span>
          {lastFetch && (
            <span style={{ marginLeft: 14 }}>Last updated: {lastFetch}</span>
          )}
        </div>
      )}

      {/* ── pivot table ─────────────────────────────────────────────────── */}
      {pivots ? (
        <div style={{ ...card }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 12, flexWrap: "wrap", gap: 8,
          }}>
            <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fff" }}>
              Intraday Pivot Levels
            </div>
            <div style={{ fontSize: "0.68rem", color: DIM, fontFamily: "ui-monospace,monospace" }}>
              Formula: PP = (O+H+L+C)/4
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <PivotRow name="R3" value={pivots.r3} color={RED}    ltp={ltp} />
            <PivotRow name="R2" value={pivots.r2} color={ORANGE} ltp={ltp} />
            <PivotRow name="R1" value={pivots.r1} color={YELLOW} ltp={ltp} />

            {/* PP */}
            <div style={{ margin: "4px 0" }}>
              <PivotRow name="PP" value={pivots.pp} color={PURPLE} ltp={ltp} isCenter />
            </div>

            <PivotRow name="S1" value={pivots.s1} color="#80cbc4" ltp={ltp} />
            <PivotRow name="S2" value={pivots.s2} color="#4db6ac" ltp={ltp} />
            <PivotRow name="S3" value={pivots.s3} color={GREEN}   ltp={ltp} />
          </div>

          {/* LTP position indicator */}
          {ltp != null && (
            <div style={{
              marginTop: 14,
              padding: "8px 14px",
              borderRadius: 7,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`,
              fontSize: "0.78rem",
              color: DIM,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span>Current LTP</span>
              <span style={{ fontFamily: "ui-monospace,monospace", color: "#fff", fontWeight: 700 }}>
                {fmt(ltp)}
              </span>
              <span>is</span>
              <span style={{ color: ltp >= pivots.pp ? GREEN : RED, fontWeight: 700 }}>
                {ltp >= pivots.pp ? "ABOVE" : "BELOW"} PP
              </span>
              {(() => {
                // Identify which zone LTP sits in
                if (ltp >= pivots.r3) return <span style={{ color: RED }}>— above R3 (extreme resistance)</span>;
                if (ltp >= pivots.r2) return <span style={{ color: ORANGE }}>— between R2 and R3</span>;
                if (ltp >= pivots.r1) return <span style={{ color: YELLOW }}>— between R1 and R2</span>;
                if (ltp >= pivots.pp) return <span style={{ color: GREEN }}>— between PP and R1</span>;
                if (ltp >= pivots.s1) return <span style={{ color: "#80cbc4" }}>— between S1 and PP</span>;
                if (ltp >= pivots.s2) return <span style={{ color: "#4db6ac" }}>— between S2 and S1</span>;
                if (ltp >= pivots.s3) return <span style={{ color: GREEN }}>— between S3 and S2</span>;
                return <span style={{ color: GREEN }}>— below S3 (extreme support)</span>;
              })()}
            </div>
          )}
        </div>
      ) : !loading && !error && (
        <div style={{
          ...card,
          textAlign: "center", color: DIM, fontSize: "0.85rem", padding: "32px",
        }}>
          {phase === "before"
            ? "Opening range candle not yet available. Come back after 09:15 IST."
            : "Fetching candle data from Upstox…"}
        </div>
      )}

      {/* ── Market Sentiment ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 22 }}>
        {/* header + date picker */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 10, marginBottom: 12,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>
              Market Sentiment &amp; Trend
            </div>
            <div style={{ fontSize: "0.72rem", color: DIM, marginTop: 2 }}>
              9:15–9:30 OI &amp; LTP analysis · Dow Theory (last 5 daily candles)
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="date"
              value={sentDate}
              max={todayIST()}
              onChange={(e) => setSentDate(e.target.value)}
              style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6,
                color: TEXT, fontSize: "0.8rem", padding: "5px 10px", outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => loadSentiment(sentDate)}
              disabled={sentLoading}
              style={{
                padding: "5px 14px",
                background: sentLoading ? "rgba(255,255,255,0.04)" : `${PURPLE}22`,
                border: `1px solid ${PURPLE}44`,
                borderRadius: 6, color: PURPLE,
                fontSize: "0.75rem", fontWeight: 700, cursor: sentLoading ? "wait" : "pointer",
              }}
            >
              {sentLoading ? "Loading…" : "Fetch"}
            </button>
          </div>
        </div>

        {sentError && (
          <div style={{
            ...card, marginBottom: 12,
            background: "rgba(239,83,80,0.08)", border: `1px solid ${RED}44`,
            color: RED, fontSize: "0.8rem",
          }}>{sentError}</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Sentiment card */}
          <div style={{
            ...card,
            borderColor: sentiment ? `${sentiment.color}55` : BORDER,
            background: sentiment ? `${sentiment.color}0d` : CARD,
          }}>
            <div style={label}>Opening Sentiment (9:15–9:30)</div>
            {sentiment ? (
              <>
                <div style={{
                  fontSize: "1.2rem", fontWeight: 800,
                  color: sentiment.color, marginBottom: 6,
                }}>
                  {sentiment.type}
                </div>
                <div style={{ fontSize: "0.75rem", color: DIM, marginBottom: 10, lineHeight: 1.5 }}>
                  {sentiment.description}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {[
                    { l: "LTP at 9:15", v: fmt(sentiment.ltp_start) },
                    { l: "LTP at 9:30", v: fmt(sentiment.ltp_end) },
                    { l: "LTP Change",  v: `${sentiment.ltp_change >= 0 ? "+" : ""}${fmt(sentiment.ltp_change)}`,
                      c: sentiment.ltp_change >= 0 ? GREEN : RED },
                    { l: "OI at 9:15", v: fmtOI(sentiment.oi_start) },
                    { l: "OI at 9:30", v: fmtOI(sentiment.oi_end) },
                    { l: "OI Change",  v: `${sentiment.oi_change >= 0 ? "+" : ""}${fmtOI(sentiment.oi_change)}`,
                      c: sentiment.oi_change >= 0 ? RED : GREEN },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                      <span style={{ color: DIM }}>{l}</span>
                      <span style={{ fontFamily: "ui-monospace,monospace", fontWeight: 700, color: c || TEXT }}>{v}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: DIM, fontSize: "0.8rem", marginTop: 8 }}>
                {sentLoading ? "Fetching candle data…" : "No 9:15–9:30 candle data for this date."}
              </div>
            )}
          </div>

          {/* Dow Theory card */}
          <div style={{
            ...card,
            borderColor: trend ? `${trend.color}55` : BORDER,
            background: trend ? `${trend.color}0d` : CARD,
          }}>
            <div style={label}>Trend — Dow Theory</div>
            {trend ? (
              <>
                <div style={{
                  fontSize: "1.2rem", fontWeight: 800,
                  color: trend.color, marginBottom: 6,
                }}>
                  {trend.direction === "Uptrend"   ? "▲ Uptrend"   :
                   trend.direction === "Downtrend" ? "▼ Downtrend" :
                                                     "↔ Sideways"}
                </div>
                <div style={{ fontSize: "0.75rem", color: DIM, marginBottom: 10 }}>
                  {trend.description}
                </div>
                <div style={{ fontSize: "0.72rem", color: DIM, marginBottom: 6 }}>
                  Last 3 daily candles:
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {trend.recent_highs.map((h, i) => (
                    <div key={i} style={{
                      flex: 1, background: "rgba(255,255,255,0.04)",
                      borderRadius: 6, padding: "6px 8px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: "0.62rem", color: DIM, marginBottom: 2 }}>D-{trend.recent_highs.length - i}</div>
                      <div style={{ fontSize: "0.7rem", color: GREEN, fontFamily: "ui-monospace,monospace" }}>H {fmt(h)}</div>
                      <div style={{ fontSize: "0.7rem", color: RED,   fontFamily: "ui-monospace,monospace" }}>L {fmt(trend.recent_lows[i])}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: DIM, fontSize: "0.8rem", marginTop: 8 }}>
                {sentLoading ? "Fetching daily candles…" : "Not enough daily candle data."}
              </div>
            )}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.25; }
        }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
      `}</style>
    </div>
  );
}
