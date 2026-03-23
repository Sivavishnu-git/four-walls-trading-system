import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, ColorType, LineStyle, CandlestickSeries, HistogramSeries } from "lightweight-charts";
import { RefreshCw, Calculator } from "lucide-react";
import { API_BASE } from "../config";

const PIVOT_COLORS = {
  pp: { color: "#ff9800", label: "Pivot" },
  r1: { color: "#e57373", label: "R1" },
  r2: { color: "#ef5350", label: "R2" },
  r3: { color: "#c62828", label: "R3" },
  s1: { color: "#81c784", label: "S1" },
  s2: { color: "#26a69a", label: "S2" },
  s3: { color: "#00897b", label: "S3" },
};

const calculatePivots = (high, low, close) => {
  const H = parseFloat(high);
  const L = parseFloat(low);
  const C = parseFloat(close);
  if (isNaN(H) || isNaN(L) || isNaN(C) || H === 0) return null;

  const P = (H + L + C) / 3;
  return {
    pp: Math.round(P * 100) / 100,
    r1: Math.round((2 * P - L) * 100) / 100,
    r2: Math.round((P + (H - L)) * 100) / 100,
    r3: Math.round((H + 2 * (P - L)) * 100) / 100,
    s1: Math.round((2 * P - H) * 100) / 100,
    s2: Math.round((P - (H - L)) * 100) / 100,
    s3: Math.round((L - 2 * (H - P)) * 100) / 100,
  };
};

export const TradingViewChart = ({ token }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const priceLineRefs = useRef([]);
  const timerRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [chartMessage, setChartMessage] = useState("");
  const [pivotData, setPivotData] = useState(null);
  const [showPivots, setShowPivots] = useState(true);
  const [futSymbol, setFutSymbol] = useState("");

  const [inputOpen, setInputOpen] = useState(() => localStorage.getItem("pivot_open") || "");
  const [inputHigh, setInputHigh] = useState(() => localStorage.getItem("pivot_high") || "");
  const [inputLow, setInputLow] = useState(() => localStorage.getItem("pivot_low") || "");
  const [inputClose, setInputClose] = useState(() => localStorage.getItem("pivot_close") || "");
  const [showInput, setShowInput] = useState(true);

  /** Avoid re-applying opening OHLC on every 15s poll; reset when session_date changes (new day). */
  const lastOpeningSessionRef = useRef(null);

  const initChart = useCallback(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#d1d4dc",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(42, 46, 57, 0.3)" },
        horzLines: { color: "rgba(42, 46, 57, 0.3)" },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "rgba(255,255,255,0.2)", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "rgba(255,255,255,0.2)", width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: "rgba(42, 46, 57, 0.5)",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "rgba(42, 46, 57, 0.5)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cleanup = initChart();
    return cleanup;
  }, [initChart]);

  const drawPivotLines = useCallback((pivots) => {
    if (!candleSeriesRef.current) return;

    priceLineRefs.current.forEach((line) => {
      try { candleSeriesRef.current.removePriceLine(line); } catch {}
    });
    priceLineRefs.current = [];

    if (!pivots || !showPivots) return;

    for (const [key, config] of Object.entries(PIVOT_COLORS)) {
      const value = pivots[key];
      if (value == null) continue;

      const line = candleSeriesRef.current.createPriceLine({
        price: value,
        color: config.color,
        lineWidth: key === "pp" ? 2 : 1,
        lineStyle: key === "pp" ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: config.label,
        lineVisible: true,
        axisLabelColor: config.color,
        axisLabelTextColor: "#fff",
      });
      priceLineRefs.current.push(line);
    }
  }, [showPivots]);

  /** Recompute classic pivots from displayed OHLC (H/L/C) and redraw horizontal PP, R1–R3, S1–S3 on the chart. */
  const applyPivots = useCallback(() => {
    if (!inputHigh || !inputLow || !inputClose) return;
    const pivots = calculatePivots(inputHigh, inputLow, inputClose);
    if (!pivots) return;
    setPivotData(pivots);
    drawPivotLines(pivots);
    if (inputOpen) localStorage.setItem("pivot_open", inputOpen);
    localStorage.setItem("pivot_high", inputHigh);
    localStorage.setItem("pivot_low", inputLow);
    localStorage.setItem("pivot_close", inputClose);
  }, [inputOpen, inputHigh, inputLow, inputClose, drawPivotLines]);

  useEffect(() => {
    const h = localStorage.getItem("pivot_high");
    const l = localStorage.getItem("pivot_low");
    const c = localStorage.getItem("pivot_close");
    if (h && l && c) {
      const pivots = calculatePivots(h, l, c);
      if (pivots) setPivotData(pivots);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) {
      setChartMessage("Token missing or expired. Please click Re-Login.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/trade-setup`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();

      if (json.status !== "success" || !json.data) {
        setChartMessage(json.error || "Unable to load chart data. Please re-login.");
        return;
      }

      const { five_min_candles, future, opening_15m_ohlc: opening15m } = json.data;

      if (future?.display_name) setFutSymbol(future.display_name);
      else if (future?.symbol) setFutSymbol(future.symbol);

      if (
        opening15m?.session_date &&
        lastOpeningSessionRef.current !== opening15m.session_date
      ) {
        lastOpeningSessionRef.current = opening15m.session_date;
        const oStr = String(opening15m.open);
        const hStr = String(opening15m.high);
        const lStr = String(opening15m.low);
        const cStr = String(opening15m.close);
        setInputOpen(oStr);
        setInputHigh(hStr);
        setInputLow(lStr);
        setInputClose(cStr);
        localStorage.setItem("pivot_open", oStr);
        localStorage.setItem("pivot_high", hStr);
        localStorage.setItem("pivot_low", lStr);
        localStorage.setItem("pivot_close", cStr);
        const pivots = calculatePivots(hStr, lStr, cStr);
        if (pivots) {
          setPivotData(pivots);
          drawPivotLines(pivots);
        }
      }

      if (five_min_candles && five_min_candles.length > 0 && candleSeriesRef.current) {
        const candleData = five_min_candles.map((c) => {
          const t = Math.floor(new Date(c.time).getTime() / 1000);
          return { time: t, open: c.open, high: c.high, low: c.low, close: c.close };
        });

        const volumeData = five_min_candles.map((c) => {
          const t = Math.floor(new Date(c.time).getTime() / 1000);
          return {
            time: t,
            value: c.volume,
            color: c.close >= c.open ? "rgba(38,166,154,0.3)" : "rgba(239,83,80,0.3)",
          };
        });

        candleSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);

        drawPivotLines(pivotData);
        setLastUpdate(new Date());

        if (candleData.length > 0) {
          chartRef.current?.timeScale().scrollToPosition(3, false);
        }
        setChartMessage("");
      } else {
        setChartMessage("No 5-min candle data available for current mode/date.");
      }
    } catch (err) {
      console.error("Chart data error:", err.message);
      setChartMessage("Chart request failed. Check token or network.");
    } finally {
      setLoading(false);
    }
  }, [token, drawPivotLines, pivotData]);

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    drawPivotLines(pivotData);
  }, [showPivots, pivotData, drawPivotLines]);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchData, 15000);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchData]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#131722" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: "1px solid rgba(42,46,57,0.5)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "#fff", fontSize: "1rem", fontWeight: 700 }}>
            {futSymbol || "NIFTY FUT"}
          </span>
          <span style={{ color: "#888", fontSize: "0.8rem" }}>5 min</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={() => setShowInput(!showInput)} style={{
            ...btnStyle,
            background: showInput ? "rgba(41,98,255,0.15)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${showInput ? "rgba(41,98,255,0.4)" : "rgba(255,255,255,0.1)"}`,
            color: showInput ? "#2962ff" : "#666",
          }}>
            <Calculator size={13} style={{ marginRight: "4px" }} />
            OHLC Input
          </button>

          <button onClick={() => setShowPivots(!showPivots)} style={{
            ...btnStyle,
            background: showPivots ? "rgba(255,152,0,0.15)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${showPivots ? "rgba(255,152,0,0.4)" : "rgba(255,255,255,0.1)"}`,
            color: showPivots ? "#ff9800" : "#666",
          }}>
            {showPivots ? "Pivots ON" : "Pivots OFF"}
          </button>

          <button onClick={() => setAutoRefresh(!autoRefresh)} style={{
            ...btnStyle,
            background: autoRefresh ? "rgba(38,166,154,0.15)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${autoRefresh ? "rgba(38,166,154,0.4)" : "rgba(255,255,255,0.1)"}`,
            color: autoRefresh ? "#26a69a" : "#666",
          }}>
            {autoRefresh ? "Auto 15s" : "Auto OFF"}
          </button>

          <button onClick={fetchData} disabled={loading} style={{
            ...btnStyle, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa",
          }}>
            <RefreshCw size={13} className={loading ? "spinning" : ""} />
          </button>

          {lastUpdate && (
            <span style={{ color: "#555", fontSize: "0.7rem" }}>
              {lastUpdate.toLocaleTimeString("en-IN", { hour12: false })}
            </span>
          )}
        </div>
      </div>

      {/* OHLC Input Panel */}
      {showInput && (
        <div style={{
          display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px",
          borderBottom: "1px solid rgba(42,46,57,0.3)", flexShrink: 0, flexWrap: "wrap",
          background: "rgba(41,98,255,0.03)",
        }}>
          <span style={{ color: "#2962ff", fontSize: "0.78rem", fontWeight: 700 }}>
            Opening 15m OHLC (9:15–9:30 IST)
          </span>
          <span style={{ color: "#666", fontSize: "0.72rem" }}>
            Auto-filled from NIFTY fut 1m data (read-only)
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <label style={labelStyle}>O</label>
            <input type="text" readOnly tabIndex={-1} value={inputOpen} placeholder="—" style={ohlcInputReadOnly} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <label style={labelStyle}>H</label>
            <input type="text" readOnly tabIndex={-1} value={inputHigh} placeholder="—" style={{ ...ohlcInputReadOnly, borderColor: "rgba(239,83,80,0.3)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <label style={labelStyle}>L</label>
            <input type="text" readOnly tabIndex={-1} value={inputLow} placeholder="—" style={{ ...ohlcInputReadOnly, borderColor: "rgba(38,166,154,0.3)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <label style={labelStyle}>C</label>
            <input type="text" readOnly tabIndex={-1} value={inputClose} placeholder="—" style={ohlcInputReadOnly} />
          </div>

          <button type="button" onClick={applyPivots} style={{
            padding: "6px 16px", borderRadius: "5px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700,
            background: "rgba(41,98,255,0.2)", border: "1px solid rgba(41,98,255,0.5)", color: "#2962ff",
          }}>
            Calculate &amp; Draw
          </button>
        </div>
      )}

      {/* Pivot Legend */}
      {showPivots && pivotData && (
        <div style={{
          display: "flex", gap: "16px", padding: "5px 16px", flexWrap: "wrap",
          borderBottom: "1px solid rgba(42,46,57,0.3)", flexShrink: 0,
          background: "rgba(255,152,0,0.02)",
        }}>
          {Object.entries(PIVOT_COLORS).map(([key, config]) => (
            <span key={key} style={{ fontSize: "0.75rem", color: config.color, fontWeight: 600, fontFamily: "monospace" }}>
              {config.label}: {pivotData[key]?.toFixed(1)}
            </span>
          ))}
          {inputOpen && (
            <span style={{ fontSize: "0.72rem", color: "#555", marginLeft: "auto" }}>
              Source: O:{inputOpen} H:{inputHigh} L:{inputLow} C:{inputClose}
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div ref={chartContainerRef} style={{ height: "100%" }} />
        {chartMessage && !loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#ccc",
                fontSize: "0.85rem",
              }}
            >
              {chartMessage}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const btnStyle = {
  padding: "5px 12px", borderRadius: "5px", cursor: "pointer",
  fontSize: "0.78rem", fontWeight: 600, display: "flex", alignItems: "center",
};

const ohlcInputReadOnly = {
  width: "90px", padding: "5px 8px", background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: "5px",
  color: "#ccc", fontSize: "0.82rem", outline: "none", fontFamily: "monospace",
  cursor: "default", userSelect: "none",
};

const labelStyle = {
  color: "#888", fontSize: "0.75rem", fontWeight: 700, minWidth: "12px",
};
