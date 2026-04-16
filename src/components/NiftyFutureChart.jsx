/**
 * NiftyFutureChart.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * TradingView-style candlestick chart for the nearest NIFTY future.
 *
 * Data flow:
 *  1. Fetch historical OHLC from /api/historical on mount / interval change
 *  2. Subscribe to the NIFTY future instrument key via proxy WebSocket
 *  3. Every tick from Upstox → aggregate into current candle → update chart
 *
 * Candle aggregation:
 *  - Each tick carries ltp (price) and ltt (last-traded-time in ms)
 *  - Tick is bucketed into the current interval window (1m, 5m, …)
 *  - If the tick falls into a NEW window → close current candle, open a new one
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  CrosshairMode,
} from "lightweight-charts";
import { apiFetch } from "../api/client.js";
import { useLiveWS } from "../hooks/useLiveWS.js";

// ── theme ─────────────────────────────────────────────────────────────────────
const BG     = "#131722";
const CARD   = "#1a1f2e";
const BORDER = "#2a2e39";
const TEXT   = "#d1d4dc";
const DIM    = "#787b86";
const GREEN  = "#26a69a";
const RED    = "#ef5350";
const BLUE   = "#2962ff";
const YELLOW = "#ffc107";

// ── interval config ───────────────────────────────────────────────────────────
const INTERVALS = [
  { label: "1m",  value: "1minute",  days: 1,   bucketSec: 60      },
  { label: "5m",  value: "5minute",  days: 3,   bucketSec: 300     },
  { label: "15m", value: "15minute", days: 5,   bucketSec: 900     },
  { label: "30m", value: "30minute", days: 10,  bucketSec: 1800    },
  { label: "1D",  value: "day",      days: 365, bucketSec: 86400   },
];

// ── helpers ───────────────────────────────────────────────────────────────────
function padDate(d) { return d.toLocaleDateString("en-CA"); }
function n(v)       { return Number(v || 0); }
function inr(v)     {
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Unix seconds bucketed to interval (IST-aligned for intraday) */
function bucketTime(tsMs, bucketSec) {
  const sec = Math.floor(tsMs / 1000);
  return Math.floor(sec / bucketSec) * bucketSec;
}

/** Convert Upstox candle array [ts, o, h, l, c, vol, oi] to chart objects */
function parseCandleData(raw) {
  const candles = [];
  const volumes = [];
  const sorted  = [...raw].reverse(); // Upstox sends newest-first

  for (const c of sorted) {
    const [ts, o, h, l, cl, vol] = c;
    if (!o && !h && !l && !cl) continue;
    const time = Math.floor(new Date(ts).getTime() / 1000);
    candles.push({ time, open: n(o), high: n(h), low: n(l), close: n(cl) });
    volumes.push({ time, value: n(vol), color: n(cl) >= n(o) ? `${GREEN}99` : `${RED}99` });
  }
  return { candles, volumes };
}

// ── main component ────────────────────────────────────────────────────────────
export function NiftyFutureChart({ accessToken }) {
  const containerRef      = useRef(null);
  const chartRef          = useRef(null);
  const candleSeriesRef   = useRef(null);
  const volSeriesRef      = useRef(null);
  const liveCandle        = useRef(null);  // current in-progress candle
  const liveVolume        = useRef(null);  // current in-progress volume bar

  const [interval, setIntervalVal] = useState(INTERVALS[0]);
  const [instrument, setInstrument] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [ohlcInfo, setOhlcInfo]     = useState(null);
  const [ltp, setLtp]               = useState(null);
  const [ltpChange, setLtpChange]   = useState(null);
  const [tickCount, setTickCount]   = useState(0); // for status badge

  // ── discover instrument key ───────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/tools/discover-nifty-future")
      .then((r) => r.json())
      .then((j) => {
        if (j.status === "success" && j.data?.instrument_key) {
          setInstrument({
            instrument_key: j.data.instrument_key,
            trading_symbol: j.data.trading_symbol || j.data.display_name || "NIFTY FUT",
            expiry:         j.data.expiry || "",
          });
        }
      })
      .catch(() => setError("Could not discover NIFTY future"));
  }, []);

  // ── subscribe to live ticks via proxy WebSocket ───────────────────────────
  const keys = useMemo(
    () => (instrument?.instrument_key ? [instrument.instrument_key] : []),
    [instrument?.instrument_key]
  );
  const { lastTick, status: wsStatus } = useLiveWS(keys, accessToken);

  // ── process each incoming tick ────────────────────────────────────────────
  useEffect(() => {
    if (!lastTick || !candleSeriesRef.current || !volSeriesRef.current) return;
    if (lastTick.instrument_key !== instrument?.instrument_key) return;

    const { ltp: tickLtp, ltt, ltq, oi, cp } = lastTick;
    if (!tickLtp) return;

    setLtp(tickLtp);
    setLtpChange(tickLtp - (cp || tickLtp));
    setTickCount((c) => c + 1);

    // ltt from Upstox is epoch ms (int64 — protobufjs Long → .toNumber())
    const tsMs   = ltt
      ? (typeof ltt === "object" ? ltt.toNumber?.() ?? Number(ltt) : Number(ltt))
      : Date.now();
    const time   = bucketTime(tsMs, interval.bucketSec);

    const cur = liveCandle.current;

    if (cur && cur.time === time) {
      // ── update current candle ─────────────────────────────────────────────
      cur.high  = Math.max(cur.high,  tickLtp);
      cur.low   = Math.min(cur.low,   tickLtp);
      cur.close = tickLtp;
      liveVolume.current.value += n(ltq);
      liveVolume.current.color  = cur.close >= cur.open ? `${GREEN}99` : `${RED}99`;
    } else {
      // ── new candle bucket ─────────────────────────────────────────────────
      liveCandle.current = { time, open: tickLtp, high: tickLtp, low: tickLtp, close: tickLtp };
      liveVolume.current = { time, value: n(ltq), color: `${GREEN}99` };
    }

    candleSeriesRef.current.update(liveCandle.current);
    volSeriesRef.current.update(liveVolume.current);
  }, [lastTick, interval.bucketSec, instrument?.instrument_key]);

  // ── fetch historical OHLC ─────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!instrument || !accessToken) return;
    setLoading(true);
    setError(null);
    liveCandle.current = null;
    liveVolume.current = null;
    try {
      const today = new Date();
      const from  = new Date(today);
      from.setDate(from.getDate() - interval.days);

      const params = new URLSearchParams({
        instrument_key: instrument.instrument_key,
        interval:       interval.value,
        from_date:      padDate(from),
        to_date:        padDate(today),
      });

      const res  = await apiFetch(`/api/historical?${params}`, { accessToken });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      const raw = json?.data?.candles || [];
      const { candles, volumes } = parseCandleData(raw);

      candleSeriesRef.current?.setData(candles);
      volSeriesRef.current?.setData(volumes);
      chartRef.current?.timeScale().fitContent();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [instrument, accessToken, interval]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // ── create lightweight-charts instance ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: BG },
        textColor:  TEXT,
        fontFamily: "'Inter','Segoe UI',sans-serif",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: "#1e2330" },
        horzLines: { color: "#1e2330" },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: "#758696", width: 1, style: 1, labelBackgroundColor: CARD },
        horzLine: { color: "#758696", width: 1, style: 1, labelBackgroundColor: CARD },
      },
      rightPriceScale: {
        borderColor:  BORDER,
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        borderColor:    BORDER,
        timeVisible:    true,
        secondsVisible: false,
        fixLeftEdge:    true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale:  { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         GREEN, downColor:         RED,
      borderUpColor:   GREEN, borderDownColor:   RED,
      wickUpColor:     GREEN, wickDownColor:     RED,
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      color:        `${GREEN}88`,
      priceFormat:  { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setOhlcInfo(null); return; }
      const bar = param.seriesData.get(candleSeries);
      if (bar) setOhlcInfo(bar);
    });

    chartRef.current       = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current    = volSeries;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  // ── WS status colour ──────────────────────────────────────────────────────
  const wsColor = wsStatus === "connected"
    ? GREEN : wsStatus === "connecting" ? YELLOW : RED;

  const isUp = n(ltpChange) >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG, fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ── toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap", gap: 8 }}>

        {/* left: symbol + live price + WS status */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <span style={{ fontWeight: 800, color: "#fff", fontSize: "0.95rem" }}>
              {instrument?.trading_symbol || "NIFTY FUT"}
            </span>
            {instrument?.expiry && (
              <span style={{ marginLeft: 6, fontSize: "0.68rem", color: DIM }}>
                Exp: {instrument.expiry}
              </span>
            )}
          </div>

          {ltp != null && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "1.1rem", fontWeight: 800, color: isUp ? GREEN : RED, fontFamily: "ui-monospace,monospace" }}>
                {inr(ltp)}
              </span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: isUp ? GREEN : RED }}>
                {isUp ? "▲" : "▼"} {Math.abs(n(ltpChange)).toFixed(2)}
              </span>
            </div>
          )}

          {/* live feed badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, background: `${wsColor}18`, border: `1px solid ${wsColor}44` }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: wsColor, display: "inline-block",
              animation: wsStatus === "connected" ? "pulse 1.5s infinite" : "none" }} />
            <span style={{ fontSize: "0.65rem", fontWeight: 700, color: wsColor, textTransform: "uppercase" }}>
              {wsStatus === "connected" ? `Live · ${tickCount} ticks` : wsStatus}
            </span>
          </div>
        </div>

        {/* centre: OHLC crosshair */}
        {ohlcInfo && (
          <div style={{ display: "flex", gap: 10, fontSize: "0.75rem", fontFamily: "ui-monospace,monospace" }}>
            {[["O", ohlcInfo.open], ["H", ohlcInfo.high], ["L", ohlcInfo.low], ["C", ohlcInfo.close]].map(([k, v]) => (
              <span key={k}>
                <span style={{ color: DIM }}>{k} </span>
                <span style={{ color: n(ohlcInfo.close) >= n(ohlcInfo.open) ? GREEN : RED, fontWeight: 700 }}>{inr(v)}</span>
              </span>
            ))}
          </div>
        )}

        {/* right: interval + refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {INTERVALS.map((iv) => (
            <button key={iv.value} type="button" onClick={() => setIntervalVal(iv)}
              style={{
                padding: "4px 10px", fontSize: "0.72rem", fontWeight: 700, borderRadius: 5, cursor: "pointer",
                background: interval.value === iv.value ? `${BLUE}33` : "rgba(255,255,255,0.06)",
                border: interval.value === iv.value ? `1px solid ${BLUE}88` : `1px solid ${BORDER}`,
                color:  interval.value === iv.value ? BLUE : DIM,
              }}>
              {iv.label}
            </button>
          ))}
          <button type="button" onClick={fetchHistory} disabled={loading}
            style={{ padding: "4px 10px", fontSize: "0.72rem", fontWeight: 700, borderRadius: 5,
              cursor: loading ? "wait" : "pointer", background: `${GREEN}22`,
              border: `1px solid ${GREEN}44`, color: GREEN }}>
            {loading ? "…" : "↺"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "8px 14px", background: `${RED}12`, border: `1px solid ${RED}33`, color: RED, fontSize: "0.8rem" }}>
          {error}
        </div>
      )}

      {/* ── chart canvas ── */}
      <div ref={containerRef} style={{ flex: 1, position: "relative", minHeight: 0 }} />

      {/* pulse keyframe */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
