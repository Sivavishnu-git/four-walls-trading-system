/**
 * NiftyFutureChart.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * TradingView-style candlestick chart for the nearest NIFTY future.
 * • Auto-discovers the instrument key via /api/tools/discover-nifty-future
 * • Fetches OHLC history from /api/historical (Upstox v2)
 * • Live LTP updates every 5 s via /api/chart-quote (updates last candle)
 * • Volume pane, OHLC info bar, interval selector (1m 5m 15m 30m 1D)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  PriceScaleMode,
} from "lightweight-charts";
import { apiFetch } from "../api/client.js";

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

// ── intervals ─────────────────────────────────────────────────────────────────
const INTERVALS = [
  { label: "1m",  value: "1minute",  days: 1  },
  { label: "5m",  value: "5minute",  days: 3  },
  { label: "15m", value: "15minute", days: 5  },
  { label: "30m", value: "30minute", days: 10 },
  { label: "1D",  value: "day",      days: 365 },
];

// ── helpers ───────────────────────────────────────────────────────────────────
function toIST(isoStr) {
  return new Date(new Date(isoStr).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function fmtDate(d, isIntraday) {
  if (isIntraday) {
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function padDate(d) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function n(v) { return Number(v || 0); }

function inr(v) {
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── main component ────────────────────────────────────────────────────────────
export function NiftyFutureChart({ accessToken }) {
  const chartContainerRef = useRef(null);
  const chartRef          = useRef(null);
  const candleSeriesRef   = useRef(null);
  const volSeriesRef      = useRef(null);
  const liveTimerRef      = useRef(null);
  const resizeObRef       = useRef(null);

  const [interval, setIntervalVal] = useState(INTERVALS[0]);
  const [instrument, setInstrument] = useState(null); // { instrument_key, trading_symbol, expiry }
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [ohlcInfo, setOhlcInfo]     = useState(null); // crosshair OHLC
  const [ltp, setLtp]               = useState(null);
  const [ltpChange, setLtpChange]   = useState(null);
  const [candles, setCandles]       = useState([]);   // raw candle array

  // ── discover instrument ───────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/tools/discover-nifty-future")
      .then((r) => r.json())
      .then((j) => {
        if (j.status === "success" && j.data?.instrument_key) {
          setInstrument({
            instrument_key: j.data.instrument_key,
            trading_symbol: j.data.trading_symbol || j.data.display_name || "NIFTY FUT",
            expiry: j.data.expiry || "",
          });
        }
      })
      .catch(() => setError("Could not discover NIFTY future"));
  }, []);

  // ── fetch OHLC history ────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!instrument || !accessToken) return;
    setLoading(true);
    setError(null);
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

      // Upstox format: [[timestamp, open, high, low, close, volume, oi], ...]
      const raw = json?.data?.candles || [];

      // Convert to lightweight-charts format
      const isIntraday = interval.value !== "day";

      const candleData = [];
      const volData    = [];

      // Upstox returns newest first → reverse
      const sorted = [...raw].reverse();

      for (const c of sorted) {
        const [ts, o, h, l, cl, vol] = c;
        const d    = toIST(ts);
        const time = Math.floor(d.getTime() / 1000); // Unix seconds

        if (!o && !h && !l && !cl) continue; // skip empty bars

        candleData.push({ time, open: n(o), high: n(h), low: n(l), close: n(cl) });
        volData.push({
          time,
          value: n(vol),
          color: n(cl) >= n(o) ? `${GREEN}99` : `${RED}99`,
        });
      }

      setCandles(candleData);

      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(candleData);
        volSeriesRef.current?.setData(volData);
        chartRef.current?.timeScale().fitContent();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [instrument, accessToken, interval]);

  // ── live LTP update (updates last candle) ────────────────────────────────
  const fetchLive = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res  = await apiFetch("/api/chart-quote", { accessToken });
      const json = await res.json();
      if (!res.ok || !json?.data) return;

      const q = json.data;
      setLtp(q.ltp);
      setLtpChange(q.net_change ?? null);

      if (!candleSeriesRef.current || !q.ltp) return;

      // Update last candle's close with current LTP
      const now  = Math.floor(Date.now() / 1000);
      const last = candleSeriesRef.current.dataByIndex(
        candleSeriesRef.current.data()?.length - 1
      );
      if (last) {
        candleSeriesRef.current.update({
          time:  last.time,
          open:  last.open,
          high:  Math.max(last.high, q.ltp),
          low:   Math.min(last.low,  q.ltp),
          close: q.ltp,
        });
      }
    } catch { /* network blip */ }
  }, [accessToken]);

  // ── create chart ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background:  { color: BG },
        textColor:   TEXT,
        fontFamily:  "'Inter','Segoe UI',sans-serif",
        fontSize:    11,
      },
      grid: {
        vertLines:  { color: "#1e2330" },
        horzLines:  { color: "#1e2330" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#758696", width: 1, style: 1, labelBackgroundColor: CARD },
        horzLine: { color: "#758696", width: 1, style: 1, labelBackgroundColor: CARD },
      },
      rightPriceScale: {
        borderColor: BORDER,
        scaleMargins: { top: 0.08, bottom: 0.28 }, // leave room for volume
      },
      timeScale: {
        borderColor:     BORDER,
        timeVisible:     true,
        secondsVisible:  false,
        fixLeftEdge:     true,
        fixRightEdge:    false,
      },
      handleScroll:   { mouseWheel: true, pressedMouseMove: true },
      handleScale:    { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      width:  chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:          GREEN,
      downColor:        RED,
      borderUpColor:    GREEN,
      borderDownColor:  RED,
      wickUpColor:      GREEN,
      wickDownColor:    RED,
    });

    // Volume series (overlaid on bottom 25%)
    const volSeries = chart.addSeries(HistogramSeries, {
      color:      `${GREEN}88`,
      priceFormat:{ type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    // Crosshair OHLC tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setOhlcInfo(null); return; }
      const bar = param.seriesData.get(candleSeries);
      if (bar) setOhlcInfo(bar);
    });

    chartRef.current       = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current    = volSeries;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width:  chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    });
    ro.observe(chartContainerRef.current);
    resizeObRef.current = ro;

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // ── fetch history when instrument or interval changes ─────────────────────
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // ── live polling every 5 s ────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return;
    fetchLive();
    liveTimerRef.current = setInterval(fetchLive, 5000);
    return () => clearInterval(liveTimerRef.current);
  }, [fetchLive]);

  const isUp = n(ltpChange) >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG, fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ── toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap", gap: 8 }}>

        {/* left: symbol + price */}
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
              {ltpChange != null && (
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: isUp ? GREEN : RED }}>
                  {isUp ? "▲" : "▼"} {Math.abs(ltpChange).toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* centre: OHLC crosshair info */}
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

        {/* right: interval buttons + refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              type="button"
              onClick={() => setIntervalVal(iv)}
              style={{
                padding: "4px 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                borderRadius: 5,
                cursor: "pointer",
                background: interval.value === iv.value ? `${BLUE}33` : "rgba(255,255,255,0.06)",
                border: interval.value === iv.value ? `1px solid ${BLUE}88` : `1px solid ${BORDER}`,
                color: interval.value === iv.value ? BLUE : DIM,
              }}
            >
              {iv.label}
            </button>
          ))}
          <button
            type="button"
            onClick={fetchHistory}
            disabled={loading}
            style={{ padding: "4px 10px", fontSize: "0.72rem", fontWeight: 700, borderRadius: 5, cursor: loading ? "wait" : "pointer", background: `${GREEN}22`, border: `1px solid ${GREEN}44`, color: GREEN }}
          >
            {loading ? "…" : "↺"}
          </button>
        </div>
      </div>

      {/* ── error banner ── */}
      {error && (
        <div style={{ padding: "8px 14px", background: `${RED}12`, border: `1px solid ${RED}33`, color: RED, fontSize: "0.8rem" }}>
          {error}
        </div>
      )}

      {/* ── loading overlay ── */}
      {loading && candles.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${BG}cc`, zIndex: 10, pointerEvents: "none" }}>
          <span style={{ color: DIM, fontSize: "0.85rem" }}>Loading chart…</span>
        </div>
      )}

      {/* ── chart canvas ── */}
      <div ref={chartContainerRef} style={{ flex: 1, position: "relative", minHeight: 0 }} />
    </div>
  );
}
