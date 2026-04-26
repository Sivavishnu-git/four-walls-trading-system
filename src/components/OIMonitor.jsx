import { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
    TrendingUp,
    TrendingDown,
    Activity,
    RefreshCw,
    LogIn,
} from "lucide-react";
import { useUpstoxPolling } from "../hooks/useUpstoxPolling";
import { apiFetch } from "../api/client.js";
// import { MarketTrendAnalysis } from './MarketTrendAnalysis';
// import { OptionEntryPlanner } from './OptionEntryPlanner';

/** Number of past trading days to load from DB on mount. */
const OI_HISTORY_DAYS = 5;
/** DB symbol name for the default Nifty futures instrument. */
const OI_DB_SYMBOL = import.meta.env.VITE_OI_SYMBOL || "NIFTY";

export const OIMonitor = ({ instrumentKey: propInstrumentKey }) => {
    const { accessToken: token, loginWithUpstox } = useAuth();
    const [isLive, setIsLive] = useState(false);
    const [oiHistory, setOiHistory] = useState([]);
    const [currentOI, setCurrentOI] = useState(null);
    const [oiTrend5Min, setOiTrend5Min] = useState(null);
    const firstSessionOIRef = useRef(null);
    const intervalRef = useRef(null);
    const prevCapturedOIRef = useRef(null);
    const [oiAlerts, setOiAlerts] = useState([]);

    const [instrumentKey, setInstrumentKey] = useState(
        propInstrumentKey || import.meta.env.VITE_INSTRUMENT_KEY || "",
    );

    useEffect(() => {
        if (propInstrumentKey) setInstrumentKey(propInstrumentKey);
    }, [propInstrumentKey]);

    // Load last 5 trading days from DB on mount and whenever the instrument key changes.
    // localStorage is not used — DB is the single source of truth.
    useEffect(() => {
        apiFetch(`/api/oi/history?days=${OI_HISTORY_DAYS}`)
            .then((r) => r.json())
            .then(({ data }) => {
                if (!Array.isArray(data) || data.length === 0) return;
                const rows = data.map((row) => {
                    const fullTime = new Date(row.ts);
                    const prevOI   = row.oi - row.oi_change;
                    return {
                        time:          row.time,
                        date:          row.date,
                        oi:            row.oi,
                        ltp:           row.ltp,
                        change:        row.oi_change,
                        changePercent: prevOI > 0 ? +((row.oi_change / prevOI) * 100).toFixed(2) : 0,
                        fullTime,
                    };
                });
                setOiHistory(rows); // already in ascending (chronological) order from DB
            })
            .catch(() => {}); // silently ignore; table stays empty until next retry
    }, [instrumentKey]);

    const {
        connect,
        data: liveData,
        status: wsStatus,
        error: pollingError,
    } = useUpstoxPolling(
        token,
        [instrumentKey],
        5000, // Faster polling (5s) to ensure data is fresh for capture
    );

    // Ref to always hold the latest data for the interval timer
    const latestDataRef = useRef(null);
    useEffect(() => {
        const feedData = liveData?.[instrumentKey];
        if (feedData) {
            latestDataRef.current = feedData;

            // NEW: Update "Current" stats immediately for the UI cards
            // This ensures the dashboard isn't empty while waiting for the 3-min interval
            setCurrentOI(feedData.oi);
        }
    }, [liveData, instrumentKey]);

    // Capture OI every 3 minutes (aligned with 15:12 start)
    useEffect(() => {
        if (!isLive) return;

        const captureOI = () => {
            const feedData = latestDataRef.current;
            if (!feedData) {
                console.log("⏳ Waiting for data before capturing history...");
                return;
            }

            const oi = feedData.oi || 0;
            const ltp = feedData.ltp || 0;
            const timestamp = new Date();

            console.log(
                `📸 [3min Capture] OI=${oi}, LTP=${ltp} at ${timestamp.toLocaleTimeString()}`,
            );

            // Set base OI on the very first capture of the session if not set
            if (firstSessionOIRef.current === null) {
                firstSessionOIRef.current = oi;
            }

            const newEntry = {
                time: timestamp.toLocaleTimeString("en-IN", { hour12: false }),
                fullTime: timestamp,
                oi: oi,
                ltp: ltp,
                change: 0,
                changePercent: 0,
            };

            // Check bar-to-bar move BEFORE updating state (using ref tracking)
            if (prevCapturedOIRef.current !== null) {
                const barChange = oi - prevCapturedOIRef.current;
                if (Math.abs(barChange) > 30000) {
                    const alertTime = timestamp.toLocaleTimeString("en-IN", { hour12: false });
                    const alertObj = {
                        id: Date.now(),
                        time: alertTime,
                        barChange,
                        oi,
                        ltp,
                    };
                    setOiAlerts((prev) => [alertObj, ...prev].slice(0, 20));

                    // Browser notification (desktop)
                    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                        new Notification(
                            `OI Alert: ${barChange > 0 ? "▲ Added" : "▼ Unwound"} ${Math.abs(barChange).toLocaleString("en-IN")}`,
                            {
                                body: `OI: ${oi.toLocaleString("en-IN")} | LTP: ₹${ltp.toFixed(2)} at ${alertTime}`,
                                tag: "oi-alert",
                            },
                        );
                    }

                    // Telegram phone alert (fire-and-forget)
                    apiFetch("/api/oi-alert", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ barChange, oi, ltp, time: alertTime }),
                    }).catch(() => {/* silently ignore if Telegram not configured */});
                }
            }
            prevCapturedOIRef.current = oi;

            setOiHistory((prev) => {
                const updated = [...prev];

                const relativeDiff = oi - firstSessionOIRef.current;
                newEntry.change = relativeDiff;

                if (updated.length > 0) {
                    const lastOI = updated[updated.length - 1].oi;
                    newEntry.changePercent =
                        lastOI !== 0 ? ((oi - lastOI) / lastOI) * 100 : 0;
                }
                updated.push(newEntry);
                return updated; // no in-memory cap — DB is the source of truth
            });

            setCurrentOI(oi);

            // Persist this snapshot to the server DB
            apiFetch("/api/oi/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ts: timestamp.getTime(), symbol: OI_DB_SYMBOL, oi, ltp }),
            }).catch(() => { /* fire-and-forget */ });
        };

        const setupSyncTimer = () => {
            // 1. Capture immediately so the table isn't empty
            captureOI();

            const now = new Date();
            const anchor = new Date();
            anchor.setHours(15, 12, 0, 0);

            // Calculate milliseconds until the next 3-minute interval relative to the anchor
            const intervalMs = 3 * 60 * 1000;
            const diff = (now.getTime() - anchor.getTime()) % intervalMs;

            // If we are before the anchor or between intervals, find the MS until the NEXT bucket
            let msToNextBucket = intervalMs - (diff < 0 ? diff + intervalMs : diff);

            console.log(
                `⏰ Syncing Capture: Next snapshot in ${Math.round(msToNextBucket / 1000)}s`,
            );

            const initialTimeout = setTimeout(() => {
                captureOI();
                intervalRef.current = setInterval(captureOI, intervalMs);
            }, msToNextBucket);

            return initialTimeout;
        };

        const initialTimeout = setupSyncTimer();

        return () => {
            clearTimeout(initialTimeout);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isLive, instrumentKey]);

    // Auto-connect on mount if token is available
    useEffect(() => {
        if (token && !isLive) {
            console.log("Auto-connecting with token...");
            setIsLive(true);
            connect();
        }
    }, [token, isLive, connect]);

    // NEW: Fetch Previous Day's OI for Daily Change Calculation
    const [previousDayOI, setPreviousDayOI] = useState(null);

    useEffect(() => {
        if (!token) return;

        const fetchHistory = async () => {
            try {
                // Fetch last 5 days of daily candles
                const today = new Date().toISOString().split("T")[0];
                const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0];

                console.log(`Fetching history for Previous OI: ${instrumentKey}`);
                const response = await apiFetch(
                    `/api/historical?instrument_key=${encodeURIComponent(instrumentKey)}&interval=day&to_date=${today}&from_date=${fiveDaysAgo}`,
                    { accessToken: token },
                );

                const json = await response.json();
                if (json.status === "success" && json.data && json.data.candles) {
                    const candles = json.data.candles;
                    // Sort by time ascending
                    candles.sort((a, b) => new Date(a[0]) - new Date(b[0]));

                    console.log("Daily Candles:", candles);

                    // We need the LAST COMPLETED trading day.
                    // If today is a trading day and market is open, the last candle MIGHT be today.
                    // If market is closed (e.g. Sat), limit is Fri.

                    // Strategy:
                    // 1. Get the last candle.
                    // 2. If its date is TODAY, then use the one before it (Yesterday).
                    // 3. If its date is NOT today, then use it as the "Previous Close" (assuming we are in a new session or weekend).

                    // However, 'Daily Change' usually implies Change from T-1 Close.

                    if (candles.length > 0) {
                        // Let's take the second last candle as T-1 if the last one is Today?
                        // Or just take the last candle if we assume historical API only updates after close?
                        // Upstox historical 'day' candles update live? Usually not immediately stable.

                        // Safe bet: The 'oi' field in the quote usually relates to the change from the Previous Close.
                        // So we want the OI of the *previous* candle relative to the current live session.

                        // Let's assume the last candle in the list is the most recent *session*.
                        // If we are LIVE trading, we want the PREVIOUS session's OI.

                        // Check if the last candle is 'Today'
                        const lastCandle = candles[candles.length - 1];
                        const lastDate = new Date(lastCandle[0]).toDateString();
                        const currentDate = new Date().toDateString();

                        let targetCandle;

                        if (lastDate === currentDate) {
                            // If last candle is today, we need the one before it
                            targetCandle =
                                candles.length > 1 ? candles[candles.length - 2] : null;
                        } else {
                            // If last candle is NOT today (e.g. yesterday), use it
                            targetCandle = lastCandle;
                        }

                        if (targetCandle) {
                            // Index 6 is OI in V3 API [timestamp, open, high, low, close, vol, oi]
                            const prevOI = targetCandle[6];
                            console.log(
                                "Found Previous Day OI:",
                                prevOI,
                                "Date:",
                                targetCandle[0],
                            );
                            setPreviousDayOI(prevOI);
                        }
                    }
                }
            } catch (err) {
                console.error("Error fetching previous OI:", err);
            }
        };

        fetchHistory();
    }, [token, instrumentKey]);

    // Calculate Daily Change (Change from Previous Day's Close)
    // If the API provides 'oi' in the quote, that's live.
    // We subtract the Previous Day's OI to get the "Daily Change".
    const dailyOIChange =
        currentOI !== null && previousDayOI !== null
            ? currentOI - previousDayOI
            : null;

    const handleConnect = async () => {
        if (!token) {
            loginWithUpstox();
            return;
        }

        console.log("Connecting with instrument:", instrumentKey);
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            Notification.requestPermission();
        }
        setIsLive(true);
        connect();
    };

    const formatNumber = (num) => {
        if (!num) return "0";
        return new Intl.NumberFormat("en-IN").format(num);
    };

    const getChangeColor = (change) => {
        if (change > 0) return "#26a69a";
        if (change < 0) return "#ef5350";
        return "#888";
    };

    const getChangeIcon = (change) => {
        if (change > 0) return <TrendingUp size={14} strokeWidth={2.25} />;
        if (change < 0) return <TrendingDown size={14} strokeWidth={2.25} />;
        return <Activity size={14} strokeWidth={2.25} />;
    };

    return (
        <div className="oi-monitor-container">
            {/* Header Section */}
            <div className="oi-header">
                <div className="header-left">
                    <h1 className="title">
                        <Activity size={28} className="title-icon" />
                        Nifty Future OI Monitor
                    </h1>
                    <div className="status-badge" data-status={wsStatus}>
                        <div className="status-dot"></div>
                        <span>
                            {isLive
                                ? wsStatus === "connected"
                                    ? "Live (Polling)"
                                    : wsStatus
                                : "Disconnected"}
                        </span>
                    </div>

                    {(isLive || instrumentKey) && (
                        <div
                            style={{
                                marginLeft: "15px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                background: "rgba(255,255,255,0.05)",
                                padding: "4px 12px",
                                borderRadius: "4px",
                                border: "1px solid rgba(255,255,255,0.1)",
                            }}
                        >
                            <span
                                style={{
                                    color: "#2962ff",
                                    fontWeight: "600",
                                    fontSize: "0.9rem",
                                }}
                            >
                                {liveData?.[instrumentKey]?.symbol || "NIFTY FUT"}
                            </span>
                            <span style={{ color: "#666", fontSize: "0.8rem" }}>|</span>
                            <span
                                style={{
                                    color: "#fff",
                                    fontSize: "0.9rem",
                                    fontFamily: "monospace",
                                    background: "rgba(0,0,0,0.3)",
                                    padding: "2px 6px",
                                    borderRadius: "3px"
                                }}
                            >
                                {instrumentKey}
                            </span>
                        </div>
                    )}

                    {pollingError && (
                        <div
                            className="error-text"
                            style={{
                                color: "#ef5350",
                                fontSize: "0.8rem",
                                marginLeft: "10px",
                            }}
                        >
                            {pollingError}
                        </div>
                    )}
                </div>

                <div className="header-right" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                        type="button"
                        onClick={loginWithUpstox}
                        className="login-btn"
                        title="Upstox OAuth: opens login, then returns with access token"
                    >
                        <LogIn size={16} strokeWidth={2.25} />
                        Login with Upstox
                    </button>
                    {!isLive && (
                        <button type="button" onClick={handleConnect} className="connect-btn" disabled={!token}>
                            Connect
                        </button>
                    )}
                </div>
            </div>

            {/* Stats — compact tiles (4 columns) */}
            <div className="stats-grid stats-grid-compact">
                <div className="stat-card">
                    <div className="stat-label">Current OI</div>
                    <div className="stat-value stat-value-compact">{formatNumber(currentOI)}</div>
                    <div className="stat-subtitle stat-subtitle-compact" style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <span>Open Interest</span>
                        <span style={{ color: "#2962ff", opacity: 0.85, fontWeight: 600 }}>{instrumentKey}</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Daily OI change</div>
                    <div
                        className="stat-value stat-value-compact"
                        style={{ color: getChangeColor(dailyOIChange) }}
                    >
                        <span className="change-icon">{getChangeIcon(dailyOIChange)}</span>
                        {dailyOIChange !== null
                            ? formatNumber(Math.abs(dailyOIChange))
                            : "--"}
                    </div>
                    <div className="stat-subtitle stat-subtitle-compact">
                        {dailyOIChange !== null
                            ? dailyOIChange > 0
                                ? "Added today"
                                : "Unwound today"
                            : "Calculating…"}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">OI trend (5 min)</div>
                    <div
                        className="stat-value stat-value-compact stat-trend-row"
                        style={{
                            color:
                                oiTrend5Min === "increasing"
                                    ? "#26a69a"
                                    : oiTrend5Min === "decreasing"
                                        ? "#ef5350"
                                        : "#e0e0e0",
                        }}
                    >
                        {oiTrend5Min === "increasing" ? (
                            <TrendingUp size={14} strokeWidth={2.25} />
                        ) : oiTrend5Min === "decreasing" ? (
                            <TrendingDown size={14} strokeWidth={2.25} />
                        ) : (
                            <Activity size={14} strokeWidth={2.25} />
                        )}
                        <span className="stat-trend-text">
                            {oiTrend5Min === "increasing"
                                ? "Increasing"
                                : oiTrend5Min === "decreasing"
                                    ? "Decreasing"
                                    : "Neutral"}
                        </span>
                    </div>
                    <div className="stat-subtitle stat-subtitle-compact">Last 5 min window</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Data points</div>
                    <div className="stat-value stat-value-compact">{oiHistory.length}</div>
                    <div className="stat-subtitle stat-subtitle-compact">
                        Up to {OI_HISTORY_MAX_ROWS} snaps · 3 min cadence
                    </div>
                </div>
            </div>

            {/* NEW: Market Trend Analysis */}
            {/* <MarketTrendAnalysis history={oiHistory} /> */}

            {/* NEW: Option Entry Planner */}
            {/* <OptionEntryPlanner /> */}

            {/* OI Alert Banner */}
            {oiAlerts.length > 0 && (
                <div
                    style={{
                        margin: "0 16px 12px",
                        borderRadius: 8,
                        border: "1px solid rgba(255,152,0,0.45)",
                        background: "rgba(255,152,0,0.08)",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 12px",
                            background: "rgba(255,152,0,0.15)",
                            borderBottom: "1px solid rgba(255,152,0,0.3)",
                        }}
                    >
                        <span style={{ color: "#ff9800", fontWeight: 700, fontSize: "0.82rem" }}>
                            ⚠ OI Alerts — moves &gt; 30,000 ({oiAlerts.length})
                        </span>
                        <button
                            type="button"
                            onClick={() => setOiAlerts([])}
                            style={{
                                background: "none",
                                border: "1px solid rgba(255,152,0,0.4)",
                                color: "#ff9800",
                                borderRadius: 4,
                                padding: "2px 8px",
                                fontSize: "0.72rem",
                                cursor: "pointer",
                            }}
                        >
                            Clear all
                        </button>
                    </div>
                    <div style={{ maxHeight: 160, overflowY: "auto" }}>
                        {oiAlerts.map((alert) => (
                            <div
                                key={alert.id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: "5px 12px",
                                    borderBottom: "1px solid rgba(255,152,0,0.1)",
                                    fontSize: "0.82rem",
                                }}
                            >
                                <span
                                    style={{
                                        fontWeight: 700,
                                        color: alert.barChange > 0 ? "#26a69a" : "#ef5350",
                                        minWidth: 110,
                                        fontFamily: "ui-monospace, monospace",
                                    }}
                                >
                                    {alert.barChange > 0 ? "▲ +" : "▼ "}
                                    {Math.abs(alert.barChange).toLocaleString("en-IN")}
                                </span>
                                <span style={{ color: "#888", minWidth: 64 }}>{alert.time}</span>
                                <span style={{ color: "#ccc" }}>
                                    OI: {alert.oi.toLocaleString("en-IN")}
                                </span>
                                <span style={{ color: "#aaa" }}>LTP: ₹{alert.ltp.toFixed(2)}</span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setOiAlerts((prev) => prev.filter((a) => a.id !== alert.id))
                                    }
                                    style={{
                                        marginLeft: "auto",
                                        background: "none",
                                        border: "none",
                                        color: "#666",
                                        cursor: "pointer",
                                        fontSize: "0.85rem",
                                        lineHeight: 1,
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* OI History Table */}
            <div className="history-section history-section-compact">
                <div className="section-header section-header-compact">
                    <h2>OI Change History</h2>
                    <div className="refresh-indicator">
                        <RefreshCw size={16} className={isLive ? "spinning" : ""} />
                        <span>Last {OI_HISTORY_DAYS} trading days · every 3 min · chronological</span>
                    </div>
                </div>

                <div className="table-container">
                    {oiHistory.length === 0 ? (
                        <div className="empty-state">
                            <Activity size={48} />
                            <p>No data yet. Connect to start monitoring OI changes.</p>
                        </div>
                    ) : (
                        <table className="oi-table oi-table-compact">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Open Interest</th>
                                    <th>Change</th>
                                    <th>Change %</th>
                                    <th>LTP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {oiHistory.map((entry, index) => (
                                    <tr
                                        key={
                                            entry.fullTime instanceof Date
                                                ? entry.fullTime.toISOString()
                                                : `${entry.time}-${index}`
                                        }
                                        className={index === oiHistory.length - 1 ? "latest-row" : ""}
                                    >
                                        <td className="time-cell">{entry.date || ""}</td>
                                        <td className="time-cell">{entry.time}</td>
                                        <td className="oi-cell">{formatNumber(entry.oi)}</td>
                                        <td
                                            className="change-cell"
                                            style={{ color: getChangeColor(entry.change) }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                {getChangeIcon(entry.change)}
                                                <span className="change-value">
                                                    {entry.change > 0 ? "+" : ""}
                                                    {formatNumber(entry.change)}
                                                </span>
                                            </div>
                                        </td>
                                        <td
                                            className="percent-cell"
                                            style={{ color: getChangeColor(entry.change) }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span className="percent-value">
                                                    {entry.changePercent > 0 ? "+" : ""}
                                                    {entry.changePercent.toFixed(2)}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="ltp-cell">₹{entry.ltp.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div >
    );
};
