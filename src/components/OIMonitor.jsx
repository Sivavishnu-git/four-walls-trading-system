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
import { API_BASE } from "../config";
// import { MarketTrendAnalysis } from './MarketTrendAnalysis';
// import { OptionEntryPlanner } from './OptionEntryPlanner';

export const OIMonitor = ({ token: propToken, instrumentKey: propInstrumentKey }) => {
    const [token, setToken] = useState(
        propToken ||
        localStorage.getItem("upstox_access_token") ||
        import.meta.env.VITE_UPSTOX_ACCESS_TOKEN ||
        "",
    );
    const [showTokenInput, setShowTokenInput] = useState(false);
    const [isLive, setIsLive] = useState(false);

    useEffect(() => {
        if (propToken) setToken(propToken);
    }, [propToken]);
    const [oiHistory, setOiHistory] = useState([]);
    const [currentOI, setCurrentOI] = useState(null);
    const [oiChange, setOiChange] = useState(null);
    const [oiTrend5Min, setOiTrend5Min] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [initialOIChange, setInitialOIChange] = useState(() => {
        const saved = localStorage.getItem("oi_initial_offset");
        return saved ? Number(saved) : 0;
    });
    const firstSessionOIRef = useRef(null);
    const intervalRef = useRef(null);

    const [instrumentKey, setInstrumentKey] = useState(
        propInstrumentKey || import.meta.env.VITE_INSTRUMENT_KEY || "NSE_FO|51714",
    );

    useEffect(() => {
        if (propInstrumentKey) setInstrumentKey(propInstrumentKey);
    }, [propInstrumentKey]);


    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    const handleSearch = async (query) => {
        setSearchQuery(query);
        if (query.length < 3) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        setIsSearching(true);
        setShowDropdown(true);
        try {
            const res = await fetch(`${API_BASE}/api/tools/search-master?query=${query}`);
            const result = await res.json();
            if (result.status === "success") {
                setSearchResults(result.data);
            }
        } catch (err) {
            console.error("Search failed:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const selectInstrument = (item) => {
        setInstrumentKey(item.key);
        setSearchQuery(item.symbol);
        setShowDropdown(false);
        setSearchResults([]);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest('.token-input-group')) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
        const feedData = liveData?.[instrumentKey];
        if (feedData) {
            latestDataRef.current = feedData;

            // NEW: Update "Current" stats immediately for the UI cards
            // This ensures the dashboard isn't empty while waiting for the 3-min interval
            setCurrentOI(feedData.oi);
            setOiChange(feedData.oi - (firstSessionOIRef.current || feedData.oi));
            setLastUpdate(new Date());
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
                    `${API_BASE}/api/historical?instrument_key=${encodeURIComponent(instrumentKey)}&interval=day&to_date=${today}&from_date=${fiveDaysAgo}`,
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

    // Calculate Daily Change (Change from Previous Day's Close)
    // If the API provides 'oi' in the quote, that's live.
    // We subtract the Previous Day's OI to get the "Daily Change".
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

                <div className="header-right">
                    {!isLive ? (
                        <div className="token-input-group" style={{ position: 'relative' }}>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="Search Symbol (e.g. RELIANCE, NIFTY...)"
                                    value={searchQuery}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    onFocus={() => searchQuery.length >= 3 && setShowDropdown(true)}
                                    className="token-input"
                                    style={{ width: "220px", paddingRight: isSearching ? "30px" : "10px" }}
                                />
                                {isSearching && (
                                    <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                                        <RefreshCw size={14} className="spinning" style={{ color: '#2962ff' }} />
                                    </div>
                                )}
                                {showDropdown && searchResults.length > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        background: '#1a1a1a',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '4px',
                                        zIndex: 1000,
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        marginTop: '5px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                                    }}>
                                        {searchResults.map((item, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => selectInstrument(item)}
                                                style={{
                                                    padding: '8px 12px',
                                                    cursor: 'pointer',
                                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    fontSize: '0.85rem'
                                                }}
                                                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                                                onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                            >
                                                <span style={{ fontWeight: 'bold', color: '#2962ff' }}>{item.symbol}</span>
                                                <span style={{ color: '#666', fontSize: '0.7rem' }}>{item.segment}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input
                                type="text"
                                placeholder="Key"
                                value={instrumentKey}
                                onChange={(e) => setInstrumentKey(e.target.value)}
                                className="token-input"
                                style={{ width: "120px", background: 'rgba(255,255,255,0.05)', color: '#888' }}
                                readOnly
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
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Current OI</div>
                    <div className="stat-value">{formatNumber(currentOI)}</div>
                    <div className="stat-subtitle" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Open Interest</span>
                        <span style={{ color: '#2962ff', opacity: 0.8, fontSize: '0.7rem', fontWeight: 'bold' }}>{instrumentKey}</span>
                    </div>
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
            </div >

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
        </div >
    );
};
