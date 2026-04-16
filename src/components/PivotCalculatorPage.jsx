import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../api/client.js";
import { computeIntradayPivots } from "../utils/intradayPivots.js";

// ── constants ────────────────────────────────────────────────────────────────
const CAPTURE_START_H = 9;
const CAPTURE_START_M = 15;
const CAPTURE_END_H = 9;
const CAPTURE_END_M = 30;
const POLL_MS = 3000; // 3-second polling during capture window

function toMinutes(h, m) {
  return h * 60 + m;
}

function nowMinutes() {
  const d = new Date();
  return toMinutes(d.getHours(), d.getMinutes()) + d.getSeconds() / 60;
}

const START_MIN = toMinutes(CAPTURE_START_H, CAPTURE_START_M);
const END_MIN = toMinutes(CAPTURE_END_H, CAPTURE_END_M);

function getPhase() {
  const now = nowMinutes();
  if (now < START_MIN) return "before";
  if (now <= END_MIN) return "capturing";
  return "done";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatCountdown(seconds) {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function fmt(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── styles ───────────────────────────────────────────────────────────────────
const BG = "#131722";
const CARD = "#1a1f2e";
const BORDER = "#2a2e39";
const TEXT = "#d1d4dc";
const DIM = "#787b86";
const GREEN = "#26a69a";
const RED = "#ef5350";
const BLUE = "#2962ff";
const YELLOW = "#ffc107";
const PURPLE = "#9c27b0";

const cardStyle = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: "16px 20px",
};

const labelStyle = {
  fontSize: "0.7rem",
  color: DIM,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const valueStyle = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "1.15rem",
  fontWeight: 700,
  color: TEXT,
};

function PivotRow({ label, value, color, ltp }) {
  const isActive =
    ltp != null &&
    Number.isFinite(ltp) &&
    Number.isFinite(value) &&
    Math.abs(ltp - value) < (value * 0.002); // within 0.2%

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderRadius: 7,
        background: isActive ? `${color}18` : "transparent",
        border: isActive ? `1px solid ${color}55` : `1px solid transparent`,
        transition: "background 0.3s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 3,
            height: 24,
            borderRadius: 2,
            background: color,
          }}
        />
        <span style={{ fontWeight: 700, color, fontSize: "0.88rem", minWidth: 32 }}>
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {ltp != null && Number.isFinite(value) && (
          <span
            style={{
              fontSize: "0.72rem",
              color: ltp >= value ? GREEN : RED,
              fontWeight: 600,
            }}
          >
            {ltp >= value ? `+${fmt(ltp - value)}` : `-${fmt(value - ltp)}`}
          </span>
        )}
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "1.05rem",
            fontWeight: 700,
            color: TEXT,
          }}
        >
          {fmt(value)}
        </span>
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────
export function PivotCalculatorPage({ accessToken }) {
  // instrument selection
  const [atmOptions, setAtmOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  // capture state
  const [phase, setPhase] = useState(getPhase());
  const [countdown, setCountdown] = useState(0);
  const [ohlc, setOhlc] = useState({ open: null, high: null, low: null, close: null });
  const [pivots, setPivots] = useState(null);
  const [ltp, setLtp] = useState(null);
  const [ltpSymbol, setLtpSymbol] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [lastTick, setLastTick] = useState(null);
  const [tickCount, setTickCount] = useState(0);
  const [pollError, setPollError] = useState(null);

  // manual override
  const [manualO, setManualO] = useState("");
  const [manualH, setManualH] = useState("");
  const [manualL, setManualL] = useState("");
  const [manualC, setManualC] = useState("");

  const ohlcRef = useRef({ open: null, high: null, low: null, close: null });
  const captureActiveRef = useRef(false);
  const pollRef = useRef(null);

  // ── load ATM options ────────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return;
    setOptionsLoading(true);
    apiFetch("/api/atm-options", { accessToken })
      .then((r) => r.json())
      .then((json) => {
        const opts = [];
        if (json.CE?.instrument_key) {
          opts.push({
            key: json.CE.instrument_key,
            label: `${json.CE.trading_symbol || "ATM CE"} (CE)`,
          });
        }
        if (json.PE?.instrument_key) {
          opts.push({
            key: json.PE.instrument_key,
            label: `${json.PE.trading_symbol || "ATM PE"} (PE)`,
          });
        }
        setAtmOptions(opts);
        if (opts.length > 0 && !selectedKey) setSelectedKey(opts[0].key);
        setOptionsLoading(false);
      })
      .catch((e) => {
        setOptionsError(e.message);
        setOptionsLoading(false);
      });
  }, [accessToken]);

  const activeKey = useCustom ? customKey.trim() : selectedKey;

  // ── phase clock ─────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const p = getPhase();
      setPhase(p);
      const now = nowMinutes();
      if (p === "before") {
        const secLeft = Math.ceil((START_MIN - now) * 60);
        setCountdown(secLeft);
      } else if (p === "capturing") {
        const secLeft = Math.ceil((END_MIN - now) * 60);
        setCountdown(secLeft);
      } else {
        setCountdown(0);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── polling logic ────────────────────────────────────────────────────────
  const fetchTick = useCallback(async () => {
    if (!activeKey || !accessToken) return;
    try {
      const res = await apiFetch(
        `/api/quotes?instrument_keys=${encodeURIComponent(activeKey)}`,
        { accessToken }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json?.data) return;

      const quote =
        json.data[activeKey] ||
        Object.values(json.data)[0];
      if (!quote) return;

      const price = quote.last_price ?? quote.ltp;
      if (!Number.isFinite(price) || price <= 0) return;

      const sym = quote.symbol || activeKey.split(":")[1] || activeKey;
      setLtp(price);
      setLtpSymbol(sym);
      setLastTick(new Date().toLocaleTimeString("en-IN"));
      setTickCount((c) => c + 1);
      setPollError(null);

      // accumulate OHLC only during capture window
      if (captureActiveRef.current) {
        const prev = ohlcRef.current;
        const next = {
          open: prev.open == null ? price : prev.open,
          high: prev.high == null ? price : Math.max(prev.high, price),
          low: prev.low == null ? price : Math.min(prev.low, price),
          close: price,
        };
        ohlcRef.current = next;
        setOhlc({ ...next });
      }
    } catch (e) {
      setPollError(e.message);
    }
  }, [activeKey, accessToken]);

  // manage polling lifecycle based on phase + activeKey
  useEffect(() => {
    if (!activeKey || !accessToken) return;

    const startPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      fetchTick();
      pollRef.current = setInterval(fetchTick, POLL_MS);
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    if (phase === "capturing") {
      captureActiveRef.current = true;
      setCapturing(true);
      startPolling();
    } else if (phase === "done") {
      captureActiveRef.current = false;
      setCapturing(false);
      // keep polling to show live LTP vs pivots
      startPolling();
      // compute pivots once from captured OHLC
      const { open, high, low, close } = ohlcRef.current;
      if (open != null && high != null && low != null && close != null) {
        setPivots(computeIntradayPivots(open, high, low, close));
      }
    } else {
      // before
      captureActiveRef.current = false;
      setCapturing(false);
      stopPolling();
    }

    return stopPolling;
  }, [phase, activeKey, accessToken, fetchTick]);

  // ── manual pivot recalculation ──────────────────────────────────────────
  function recalcManual() {
    const o = parseFloat(manualO);
    const h = parseFloat(manualH);
    const l = parseFloat(manualL);
    const c = parseFloat(manualC);
    if ([o, h, l, c].every(Number.isFinite)) {
      const result = computeIntradayPivots(o, h, l, c);
      setPivots(result);
      ohlcRef.current = { open: o, high: h, low: l, close: c };
      setOhlc({ open: o, high: h, low: l, close: c });
    }
  }

  function resetCapture() {
    ohlcRef.current = { open: null, high: null, low: null, close: null };
    setOhlc({ open: null, high: null, low: null, close: null });
    setPivots(null);
    setTickCount(0);
    setLastTick(null);
  }

  // ── render ───────────────────────────────────────────────────────────────
  const displayOhlc = ohlc;
  const canComputeFromCapture =
    displayOhlc.open != null &&
    displayOhlc.high != null &&
    displayOhlc.low != null &&
    displayOhlc.close != null;

  return (
    <div
      style={{
        background: BG,
        minHeight: "100%",
        padding: "20px 16px",
        boxSizing: "border-box",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        color: TEXT,
      }}
    >
      {/* ── header ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            margin: 0,
            fontSize: "1.15rem",
            fontWeight: 700,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              background: `${PURPLE}22`,
              border: `1px solid ${PURPLE}55`,
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: PURPLE,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Pivot
          </span>
          Opening Range Pivot Calculator
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: DIM }}>
          Tracks live option price from 09:15 → 09:30 and computes intraday pivot levels.
        </p>
      </div>

      {/* ── instrument selector ────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ marginBottom: 12, fontSize: "0.78rem", fontWeight: 700, color: TEXT }}>
          Select Option Instrument
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 220px" }}>
            <div style={labelStyle}>ATM Option</div>
            {optionsLoading ? (
              <span style={{ color: DIM, fontSize: "0.8rem" }}>Loading ATM options…</span>
            ) : optionsError ? (
              <span style={{ color: RED, fontSize: "0.8rem" }}>Error: {optionsError}</span>
            ) : (
              <select
                value={selectedKey}
                onChange={(e) => {
                  setSelectedKey(e.target.value);
                  setUseCustom(false);
                  resetCapture();
                }}
                style={{
                  width: "100%",
                  background: "#0d1117",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  color: TEXT,
                  padding: "7px 10px",
                  fontSize: "0.85rem",
                }}
              >
                {atmOptions.length === 0 && (
                  <option value="">— No options loaded —</option>
                )}
                {atmOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ flex: "1 1 280px" }}>
            <div style={labelStyle}>Custom Instrument Key (optional)</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                placeholder="e.g. NSE_FO|56482"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                style={{
                  flex: 1,
                  background: "#0d1117",
                  border: `1px solid ${useCustom ? BLUE : BORDER}`,
                  borderRadius: 6,
                  color: TEXT,
                  padding: "7px 10px",
                  fontSize: "0.85rem",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (customKey.trim()) {
                    setUseCustom(true);
                    resetCapture();
                  }
                }}
                style={{
                  padding: "7px 14px",
                  background: useCustom ? `${BLUE}33` : "rgba(255,255,255,0.07)",
                  border: `1px solid ${useCustom ? BLUE : BORDER}`,
                  borderRadius: 6,
                  color: useCustom ? BLUE : DIM,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Use Custom
              </button>
            </div>
          </div>
        </div>

        {activeKey && (
          <div
            style={{
              marginTop: 10,
              fontSize: "0.72rem",
              color: DIM,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            Active: <span style={{ color: GREEN }}>{activeKey}</span>
          </div>
        )}
      </div>

      {/* ── phase status ──────────────────────────────────────────────────── */}
      <div
        style={{
          ...cardStyle,
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* phase badge */}
          {phase === "before" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 14px",
                borderRadius: 20,
                background: "rgba(255,193,7,0.12)",
                border: `1px solid ${YELLOW}55`,
                color: YELLOW,
                fontWeight: 700,
                fontSize: "0.82rem",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: YELLOW,
                  display: "inline-block",
                }}
              />
              Waiting — market opens in {formatCountdown(countdown)}
            </div>
          )}
          {phase === "capturing" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 14px",
                borderRadius: 20,
                background: "rgba(38,166,154,0.12)",
                border: `1px solid ${GREEN}55`,
                color: GREEN,
                fontWeight: 700,
                fontSize: "0.82rem",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: GREEN,
                  display: "inline-block",
                  animation: "pulse 1s infinite",
                }}
              />
              Capturing 09:15 → 09:30 — {formatCountdown(countdown)} left
            </div>
          )}
          {phase === "done" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 14px",
                borderRadius: 20,
                background: `${BLUE}18`,
                border: `1px solid ${BLUE}55`,
                color: BLUE,
                fontWeight: 700,
                fontSize: "0.82rem",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: BLUE,
                  display: "inline-block",
                }}
              />
              Pivots locked — live LTP tracking
            </div>
          )}
        </div>

        {/* live LTP */}
        {ltp != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.72rem", color: DIM, fontWeight: 600 }}>LTP</span>
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "1.2rem",
                fontWeight: 800,
                color: "#fff",
              }}
            >
              {fmt(ltp)}
            </span>
            {ltpSymbol && (
              <span style={{ fontSize: "0.72rem", color: DIM }}>{ltpSymbol}</span>
            )}
          </div>
        )}

        {(pollError) && (
          <span style={{ fontSize: "0.75rem", color: RED }}>Poll error: {pollError}</span>
        )}
        {lastTick && (
          <span style={{ fontSize: "0.7rem", color: DIM }}>
            Last tick: {lastTick} ({tickCount} ticks)
          </span>
        )}
      </div>

      {/* ── OHLC capture display ──────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          { label: "Open (09:15)", value: displayOhlc.open, color: TEXT },
          { label: "High", value: displayOhlc.high, color: GREEN },
          { label: "Low", value: displayOhlc.low, color: RED },
          { label: "Close (09:30)", value: displayOhlc.close, color: YELLOW },
        ].map(({ label, value, color }) => (
          <div key={label} style={cardStyle}>
            <div style={labelStyle}>{label}</div>
            <div style={{ ...valueStyle, color }}>
              {value != null ? fmt(value) : <span style={{ color: DIM }}>—</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── compute button (when done but no pivots yet) ──────────────────── */}
      {phase === "done" && !pivots && canComputeFromCapture && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => {
              const { open, high, low, close } = ohlcRef.current;
              setPivots(computeIntradayPivots(open, high, low, close));
            }}
            style={{
              padding: "10px 22px",
              background: `${GREEN}22`,
              border: `1px solid ${GREEN}55`,
              borderRadius: 8,
              color: GREEN,
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer",
            }}
          >
            Compute Pivots from Captured OHLC
          </button>
        </div>
      )}

      {/* ── pivot levels ─────────────────────────────────────────────────── */}
      {pivots && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff" }}>
              Pivot Levels — 09:15–09:30 Opening Range
            </div>
            <div style={{ fontSize: "0.7rem", color: DIM }}>
              O:{fmt(displayOhlc.open)} H:{fmt(displayOhlc.high)} L:{fmt(displayOhlc.low)} C:{fmt(displayOhlc.close)}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <PivotRow label="R3" value={pivots.r3} color={RED} ltp={ltp} />
            <PivotRow label="R2" value={pivots.r2} color="#ff7043" ltp={ltp} />
            <PivotRow label="R1" value={pivots.r1} color="#ffb74d" ltp={ltp} />

            {/* PP separator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderRadius: 7,
                background: `${PURPLE}14`,
                border: `1px solid ${PURPLE}44`,
              }}
            >
              <div style={{ width: 3, height: 24, borderRadius: 2, background: PURPLE }} />
              <span style={{ fontWeight: 700, color: PURPLE, fontSize: "0.88rem", minWidth: 32 }}>PP</span>
              <div style={{ flex: 1 }} />
              {ltp != null && Number.isFinite(pivots.pp) && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: ltp >= pivots.pp ? GREEN : RED,
                    fontWeight: 600,
                  }}
                >
                  {ltp >= pivots.pp ? `+${fmt(ltp - pivots.pp)}` : `-${fmt(pivots.pp - ltp)}`}
                </span>
              )}
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  color: "#fff",
                }}
              >
                {fmt(pivots.pp)}
              </span>
            </div>

            <PivotRow label="S1" value={pivots.s1} color="#80cbc4" ltp={ltp} />
            <PivotRow label="S2" value={pivots.s2} color="#4db6ac" ltp={ltp} />
            <PivotRow label="S3" value={pivots.s3} color={GREEN} ltp={ltp} />
          </div>
        </div>
      )}

      {/* ── manual override ───────────────────────────────────────────────── */}
      <div style={{ ...cardStyle }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "0.82rem",
            color: TEXT,
            marginBottom: 12,
          }}
        >
          Manual Override — enter OHLC to recalculate
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          {[
            { label: "Open", val: manualO, set: setManualO },
            { label: "High", val: manualH, set: setManualH },
            { label: "Low", val: manualL, set: setManualL },
            { label: "Close", val: manualC, set: setManualC },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ flex: "1 1 100px" }}>
              <div style={labelStyle}>{label}</div>
              <input
                type="number"
                step="0.05"
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder="0.00"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "#0d1117",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  color: TEXT,
                  padding: "7px 10px",
                  fontSize: "0.9rem",
                  fontFamily: "ui-monospace, monospace",
                }}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={recalcManual}
            style={{
              padding: "8px 18px",
              background: `${PURPLE}22`,
              border: `1px solid ${PURPLE}55`,
              borderRadius: 7,
              color: PURPLE,
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              alignSelf: "flex-end",
              whiteSpace: "nowrap",
            }}
          >
            Calculate
          </button>
          <button
            type="button"
            onClick={resetCapture}
            style={{
              padding: "8px 14px",
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${BORDER}`,
              borderRadius: 7,
              color: DIM,
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: "pointer",
              alignSelf: "flex-end",
              whiteSpace: "nowrap",
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
