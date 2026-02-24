import { useEffect, useState, useRef } from "react";
import {
    TrendingUp,
    TrendingDown,
    Activity,
    RefreshCw,
    Lock,
    Unlock,
} from "lucide-react";
import { useUpstoxPolling } from "../hooks/useUpstoxPolling";
// import { MarketTrendAnalysis } from './MarketTrendAnalysis';
// import { OptionEntryPlanner } from './OptionEntryPlanner';

export const OIMonitor = ({ token: propToken }) => {
    const [token, setToken] = useState(
        propToken ||
        localStorage.getItem("upstox_access_token") ||
        import.meta.env.VITE_UPSTOX_ACCESS_TOKEN ||
        "",
    );
    const [showTokenInput, setShowTokenInput] = useState(false);
    const [isLive, setIsLive] = useState(false);

    // Sync token from props
    useEffect(() => {
        if (propToken) setToken(propToken);
    }, [propToken]);
    const [oiHistory, setOiHistory] = useState([]);
    const [currentOI, setCurrentOI] = useState(null);
    const [oiChange, setOiChange] = useState(null);
    const [oiTrend5Min, setOiTrend5Min] = useState(null); // 'increasing', 'decreasing', 'neutral'
    const [lastUpdate, setLastUpdate] = useState(null);
    const [initialOIChange, setInitialOIChange] = useState(() => {
        const saved = localStorage.getItem("oi_initial_offset");
        return saved ? Number(saved) : 0;
    });
    const firstSessionOIRef = useRef(null);
    const intervalRef = useRef(null);

    // Nifty Future instrument key (Current Month Future - Has OI data)
    const [instrumentKey, setInstrumentKey] = useState(
        import.meta.env.VITE_INSTRUMENT_KEY || "NSE_FO|49229",
    );

    const {
        connect,
        disconnect,
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
        latestDataRef.current = liveData?.[instrumentKey];
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

            setOiHistory((prev) => {
                const updated = [...prev];

                // Cumulative Change = User Initial Value + (Current Market OI - Starting Session OI)
                const relativeDiff = oi - firstSessionOIRef.current;
                newEntry.change = Number(initialOIChange) + relativeDiff;

                if (updated.length > 0) {
                    const lastOI = updated[updated.length - 1].oi;
                    newEntry.changePercent =
                        lastOI !== 0 ? ((oi - lastOI) / lastOI) * 100 : 0;
                }
                updated.push(newEntry);
                return updated.slice(-5);
            });

            setCurrentOI(oi);
            setLastUpdate(timestamp);
        };

        const setupSyncTimer = () => {
            const now = new Date();
            const startAt = new Date();
            startAt.setHours(15, 12, 0, 0);

            let msToStart = startAt.getTime() - now.getTime();

            // If it's already past 15:12 today, find next 3-min aligned slot
            if (msToStart < 0) {
                const diff = (now.getTime() - startAt.getTime()) % (3 * 60 * 1000);
                msToStart = 3 * 60 * 1000 - diff;
            }

            console.log(
                `⏰ Syncing Capture: Starting in ${Math.round(msToStart / 1000)}s`,
            );

            const initialTimeout = setTimeout(() => {
                captureOI();
                intervalRef.current = setInterval(captureOI, 3 * 60 * 1000);
            }, msToStart);

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
    }, [isLive, instrumentKey, initialOIChange]);

    // Auto-connect on mount if token is available
    useEffect(() => {
        if (token && !isLive) {
            console.log("Auto-connecting with token...");
            handleConnect();
        }
    }, [token]);

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
                const response = await fetch(
                    `http://localhost:3000/api/historical?instrument_key=${encodeURIComponent(instrumentKey)}&interval=day&to_date=${today}&from_date=${fiveDaysAgo}`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    },
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

    // Calculate Daily Change
    const dailyOIChange =
        currentOI !== null && previousDayOI !== null
            ? currentOI - previousDayOI
            : null;

    const handleConnect = async () => {
        if (!token) {
            alert("Please enter a valid Upstox Access Token.");
            return;
        }

        // Persist values so they aren't lost on refresh
        localStorage.setItem("upstox_access_token", token);
        localStorage.setItem("oi_initial_offset", initialOIChange.toString());

        console.log("Connecting with instrument:", instrumentKey);
        setIsLive(true);
        connect();
    };

    const handleDisconnect = () => {
        setIsLive(false);
        disconnect();
        firstSessionOIRef.current = null; // Reset session base
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
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
        if (change > 0) return <TrendingUp size={20} />;
        if (change < 0) return <TrendingDown size={20} />;
        return <Activity size={20} />;
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

                    {isLive && liveData && liveData[instrumentKey] && (
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
                                {liveData[instrumentKey].symbol || "Instrument"}
                            </span>
                            <span style={{ color: "#666", fontSize: "0.8rem" }}>|</span>
                            <span
                                style={{
                                    color: "#aaa",
                                    fontSize: "0.8rem",
                                    fontFamily: "monospace",
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

                <div className="header-right">
                    {!isLive ? (
                        <div className="token-input-group">
                            <input
                                type="text"
                                placeholder="Instrument Key (e.g. NSE_FO|49229)"
                                value={instrumentKey}
                                onChange={(e) => setInstrumentKey(e.target.value)}
                                className="token-input"
                                style={{ width: "160px" }}
                            />
                            <input
                                type="password"
                                placeholder="Upstox Access Token"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                className="token-input"
                            />
                            <input
                                type="number"
                                placeholder="Initial OI Change"
                                value={initialOIChange}
                                onChange={(e) =>
                                    setInitialOIChange(Number(e.target.value))
                                }
                                className="token-input"
                                style={{ width: "120px" }}
                                title="Starting OI Change (Offset)"
                            />
                            <button onClick={handleConnect} className="connect-btn">
                                Connect
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            <div
                                style={{
                                    fontSize: "0.8rem",
                                    color: "#888",
                                    paddingRight: "10px",
                                }}
                            >
                                Base Offset: {formatNumber(initialOIChange)}
                            </div>
                            <button onClick={handleDisconnect} className="disconnect-btn">
                                Disconnect
                            </button>
                        </div>
                    )}
                    <button
                        onClick={async () => {
                            try {
                                const res = await fetch(
                                    "http://localhost:3000/api/tools/find-nifty-future",
                                );
                                const data = await res.json();

                                if (data.status === "info") {
                                    let msg = `${data.message}\n\n`;
                                    msg += `🚀 Common Keys:\n`;
                                    data.common_keys.forEach(
                                        (k) => (msg += `- ${k.symbol}: ${k.key}\n`),
                                    );
                                    msg += `\n📋 Instructions:\n`;
                                    data.instructions.forEach((i) => (msg += `${i}\n`));
                                    alert(msg);
                                } else if (data.data) {
                                    console.log("--- Active Nifty Futures ---");
                                    data.data.forEach((f) => {
                                        console.log(
                                            `${f.trading_symbol} (${f.expiry}): ${f.instrument_key}`,
                                        );
                                    });
                                    alert(
                                        `Check Console for Keys!\nCurrent Configured Key: ${instrumentKey}`,
                                    );
                                } else {
                                    alert(
                                        "Error fetching keys: " + (data.error || "Unknown error"),
                                    );
                                }
                            } catch (e) {
                                alert("Failed to fetch keys. Ensure Proxy Server is running.");
                                console.error(e);
                            }
                        }}
                        style={{
                            padding: "10px",
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: "8px",
                            cursor: "pointer",
                            color: "#aaa",
                        }}
                        title="Check Active Nifty Future Keys"
                    >
                        🔍
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Current OI</div>
                    <div className="stat-value">{formatNumber(currentOI)}</div>
                    <div className="stat-subtitle">Open Interest</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Daily OI Change</div>
                    <div
                        className="stat-value"
                        style={{ color: getChangeColor(dailyOIChange) }}
                    >
                        <span className="change-icon">{getChangeIcon(dailyOIChange)}</span>
                        {dailyOIChange !== null
                            ? formatNumber(Math.abs(dailyOIChange))
                            : "--"}
                    </div>
                    <div className="stat-subtitle">
                        {dailyOIChange !== null
                            ? dailyOIChange > 0
                                ? "Added Today"
                                : "Unwound Today"
                            : "Calculating..."}
                    </div>
                </div>

                <div
                    className="stat-card"
                    style={{ borderColor: getChangeColor(oiChange) }}
                >
                    <div className="stat-label">OI Change (2 min)</div>
                    <div
                        className="stat-value"
                        style={{ color: getChangeColor(oiChange) }}
                    >
                        <span className="change-icon">{getChangeIcon(oiChange)}</span>
                        {oiChange !== null ? formatNumber(Math.abs(oiChange)) : "0"}
                    </div>
                    <div className="stat-subtitle">
                        {oiChange !== null && oiChange !== 0
                            ? `${oiChange > 0 ? "+" : "-"}${Math.abs(oiChange).toFixed(2)}`
                            : "No Change"}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">OI Trend (5 min)</div>
                    <div
                        className="stat-value"
                        style={{
                            color:
                                oiTrend5Min === "increasing"
                                    ? "#26a69a"
                                    : oiTrend5Min === "decreasing"
                                        ? "#ef5350"
                                        : "#fff",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        {oiTrend5Min === "increasing" ? (
                            <TrendingUp size={24} />
                        ) : oiTrend5Min === "decreasing" ? (
                            <TrendingDown size={24} />
                        ) : (
                            <Activity size={24} />
                        )}
                        <span style={{ fontSize: "1.2rem", fontWeight: "normal" }}>
                            {oiTrend5Min === "increasing"
                                ? "INCREASING"
                                : oiTrend5Min === "decreasing"
                                    ? "DECREASING"
                                    : "NEUTRAL"}
                        </span>
                    </div>
                    <div className="stat-subtitle">Based on last 5 min</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Last Update</div>
                    <div className="stat-value small">
                        {lastUpdate
                            ? lastUpdate.toLocaleTimeString("en-IN", { hour12: false })
                            : "--:--:--"}
                    </div>
                    <div className="stat-subtitle">
                        {lastUpdate
                            ? lastUpdate.toLocaleDateString("en-IN")
                            : "Not Connected"}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Data Points</div>
                    <div className="stat-value">{oiHistory.length}</div>
                    <div className="stat-subtitle">Captured Intervals</div>
                </div>
            </div>

            {/* NEW: Market Trend Analysis */}
            {/* <MarketTrendAnalysis history={oiHistory} /> */}

            {/* NEW: Option Entry Planner */}
            {/* <OptionEntryPlanner /> */}

            {/* OI History Table */}
            <div className="history-section">
                <div className="section-header">
                    <h2>OI Change History</h2>
                    <div className="refresh-indicator">
                        <RefreshCw size={16} className={isLive ? "spinning" : ""} />
                        <span>Updates every 3 minutes</span>
                    </div>
                </div>

                <div className="table-container">
                    {oiHistory.length === 0 ? (
                        <div className="empty-state">
                            <Activity size={48} />
                            <p>No data yet. Connect to start monitoring OI changes.</p>
                        </div>
                    ) : (
                        <table className="oi-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Open Interest</th>
                                    <th>Change</th>
                                    <th>Change %</th>
                                    <th>LTP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...oiHistory].reverse().map((entry, index) => (
                                    <tr key={index} className={index === 0 ? "latest-row" : ""}>
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
        </div>
    );
};
