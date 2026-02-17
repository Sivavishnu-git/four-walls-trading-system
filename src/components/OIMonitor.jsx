import { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, RefreshCw, Lock, Unlock } from 'lucide-react';
import { useUpstoxPolling } from '../hooks/useUpstoxPolling';
// import { MarketTrendAnalysis } from './MarketTrendAnalysis';
// import { OptionEntryPlanner } from './OptionEntryPlanner';

export const OIMonitor = ({ token: propToken }) => {
    const [token, setToken] = useState(propToken || import.meta.env.VITE_UPSTOX_ACCESS_TOKEN || "");
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
    const intervalRef = useRef(null);

    // Nifty Future instrument key (Current Month Future - Has OI data)
    const instrumentKey = import.meta.env.VITE_INSTRUMENT_KEY || "NSE_FO|49229";

    const { connect, disconnect, data: liveData, status: wsStatus, error: pollingError } = useUpstoxPolling(token, [instrumentKey], parseInt(import.meta.env.VITE_POLLING_INTERVAL) || 120000);

    // Capture OI every 2 minutes for the history table
    useEffect(() => {
        if (!isLive || !liveData || !liveData[instrumentKey]) return;

        const captureOI = () => {
            const feedData = liveData?.[instrumentKey];
            if (!feedData) return;

            // OI is now directly available in the feedData object
            const oi = feedData.oi || 0;
            const ltp = feedData.ltp || 0;

            const timestamp = new Date();
            const newEntry = {
                time: timestamp.toLocaleTimeString('en-IN', { hour12: false }),
                fullTime: timestamp,
                oi: oi,
                ltp: ltp,
                change: 0,
                changePercent: 0
            };

            setOiHistory(prev => {
                const updated = [...prev];

                // Calculate change from previous entry
                if (updated.length > 0) {
                    const lastOI = updated[updated.length - 1].oi;
                    newEntry.change = oi - lastOI;
                    newEntry.changePercent = lastOI !== 0 ? ((oi - lastOI) / lastOI) * 100 : 0;
                }

                updated.push(newEntry);

                // Keep only last 10 entries (20 minutes of data) to allow 5min calc
                if (updated.length > 10) {
                    updated.shift();
                }

                // Calculate 5-minute trend
                if (updated.length >= 3) {
                    // Get entry from roughly 5-6 mins ago (index: length - 3 or length - 4)
                    const compareIndex = Math.max(0, updated.length - 3);
                    const pastEntry = updated[compareIndex];
                    const diff = oi - pastEntry.oi;

                    if (diff > 0) setOiTrend5Min('increasing');
                    else if (diff < 0) setOiTrend5Min('decreasing');
                    else setOiTrend5Min('neutral');
                }

                return updated;
            });

            setCurrentOI(oi);
            setLastUpdate(timestamp);

            if (oiHistory.length > 0) {
                const lastOI = oiHistory[oiHistory.length - 1].oi;
                setOiChange(oi - lastOI);
            }
        };

        // Capture immediately ONLY if we don't have recent data
        // This prevents double entries on re-renders
        if (oiHistory.length === 0) {
            captureOI();
        }

        // Then capture every 2 minutes
        intervalRef.current = setInterval(captureOI, 2 * 60 * 1000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isLive, liveData, instrumentKey]);

    // Auto-connect on mount if token is available
    useEffect(() => {
        if (token && !isLive) {
            console.log("Auto-connecting with token...");
            handleConnect();
        }
    }, [token]); // Added token dependency to ensure it runs when token loads

    // Debug: Log live data changes
    useEffect(() => {
        if (liveData && liveData[instrumentKey]) {
            console.log("Live data received:", liveData[instrumentKey]);
        }
    }, [liveData, instrumentKey]);

    // NEW: Fetch Previous Day's OI for Daily Change Calculation
    const [previousDayOI, setPreviousDayOI] = useState(null);

    useEffect(() => {
        if (!token) return;

        const fetchHistory = async () => {
            try {
                // Fetch last 5 days of daily candles
                const today = new Date().toISOString().split('T')[0];
                const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                console.log(`Fetching history for Previous OI: ${instrumentKey}`);
                const response = await fetch(`http://localhost:3000/api/historical?instrument_key=${encodeURIComponent(instrumentKey)}&interval=day&to_date=${today}&from_date=${fiveDaysAgo}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                const json = await response.json();
                if (json.status === 'success' && json.data && json.data.candles) {
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
                            targetCandle = candles.length > 1 ? candles[candles.length - 2] : null;
                        } else {
                            // If last candle is NOT today (e.g. yesterday), use it
                            targetCandle = lastCandle;
                        }

                        if (targetCandle) {
                            // Index 6 is OI in V3 API [timestamp, open, high, low, close, vol, oi]
                            const prevOI = targetCandle[6];
                            console.log("Found Previous Day OI:", prevOI, "Date:", targetCandle[0]);
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
    const dailyOIChange = (currentOI !== null && previousDayOI !== null) ? (currentOI - previousDayOI) : null;

    const handleConnect = async () => {
        if (!token) {
            alert("Please enter a valid Upstox Access Token.");
            return;
        }
        console.log("Connecting with instrument:", instrumentKey);
        setIsLive(true);
        connect();
    };

    const handleDisconnect = () => {
        setIsLive(false);
        disconnect();
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
    };

    const formatNumber = (num) => {
        if (!num) return '0';
        return new Intl.NumberFormat('en-IN').format(num);
    };

    const getChangeColor = (change) => {
        if (change > 0) return '#26a69a';
        if (change < 0) return '#ef5350';
        return '#888';
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
                        <span>{isLive ? (wsStatus === 'connected' ? 'Live (Polling)' : wsStatus) : 'Disconnected'}</span>
                    </div>
                    {pollingError && <div className="error-text" style={{ color: '#ef5350', fontSize: '0.8rem', marginLeft: '10px' }}>{pollingError}</div>}
                </div>

                <div className="header-right">
                    {!isLive ? (
                        <>
                            <button
                                className="token-toggle-btn"
                                onClick={() => setShowTokenInput(!showTokenInput)}
                            >
                                {showTokenInput ? <Unlock size={18} /> : <Lock size={18} />}
                                <span>{showTokenInput ? 'Hide Token' : 'Enter Token'}</span>
                            </button>

                            {showTokenInput && (
                                <div className="token-input-group">
                                    <input
                                        type="password"
                                        placeholder="Upstox Access Token"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        className="token-input"
                                    />
                                    <button onClick={handleConnect} className="connect-btn">
                                        Go Live
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <button onClick={handleDisconnect} className="disconnect-btn">
                            Disconnect
                        </button>
                    )}
                    <button
                        onClick={async () => {
                            try {
                                const res = await fetch('http://localhost:3000/api/tools/find-nifty-future');
                                const data = await res.json();
                                console.log("--- Active Nifty Futures ---");
                                if (data.data) {
                                    data.data.forEach(f => {
                                        console.log(`${f.trading_symbol} (${f.expiry}): ${f.instrument_key}`);
                                    });
                                    alert(`Check Console for Keys!\nCurrent Configured Key: ${instrumentKey}`);
                                } else {
                                    alert("Error fetching keys: " + (data.error || "Unknown error"));
                                }
                            } catch (e) {
                                alert("Failed to fetch keys. Ensure Proxy Server is running.");
                                console.error(e);
                            }
                        }}
                        style={{
                            padding: '10px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#aaa'
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
                    <div className="stat-value" style={{ color: getChangeColor(dailyOIChange) }}>
                        <span className="change-icon">{getChangeIcon(dailyOIChange)}</span>
                        {dailyOIChange !== null ? formatNumber(Math.abs(dailyOIChange)) : '--'}
                    </div>
                    <div className="stat-subtitle">
                        {dailyOIChange !== null ? (dailyOIChange > 0 ? 'Added Today' : 'Unwound Today') : 'Calculating...'}
                    </div>
                </div>

                <div className="stat-card" style={{ borderColor: getChangeColor(oiChange) }}>
                    <div className="stat-label">OI Change (2 min)</div>
                    <div className="stat-value" style={{ color: getChangeColor(oiChange) }}>
                        <span className="change-icon">{getChangeIcon(oiChange)}</span>
                        {oiChange !== null ? formatNumber(Math.abs(oiChange)) : '0'}
                    </div>
                    <div className="stat-subtitle">
                        {oiChange !== null && oiChange !== 0 ? `${oiChange > 0 ? '+' : '-'}${Math.abs(oiChange).toFixed(2)}` : 'No Change'}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">OI Trend (5 min)</div>
                    <div className="stat-value" style={{
                        color: oiTrend5Min === 'increasing' ? '#26a69a' : oiTrend5Min === 'decreasing' ? '#ef5350' : '#fff',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        {oiTrend5Min === 'increasing' ? <TrendingUp size={24} /> :
                            oiTrend5Min === 'decreasing' ? <TrendingDown size={24} /> :
                                <Activity size={24} />}
                        <span style={{ fontSize: '1.2rem', fontWeight: 'normal' }}>
                            {oiTrend5Min === 'increasing' ? 'INCREASING' :
                                oiTrend5Min === 'decreasing' ? 'DECREASING' : 'NEUTRAL'}
                        </span>
                    </div>
                    <div className="stat-subtitle">Based on last 5 min</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Last Update</div>
                    <div className="stat-value small">
                        {lastUpdate ? lastUpdate.toLocaleTimeString('en-IN', { hour12: false }) : '--:--:--'}
                    </div>
                    <div className="stat-subtitle">
                        {lastUpdate ? lastUpdate.toLocaleDateString('en-IN') : 'Not Connected'}
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
                        <RefreshCw size={16} className={isLive ? 'spinning' : ''} />
                        <span>Updates every 2 minutes</span>
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
                                    <tr key={index} className={index === 0 ? 'latest-row' : ''}>
                                        <td className="time-cell">{entry.time}</td>
                                        <td className="oi-cell">{formatNumber(entry.oi)}</td>
                                        <td className="change-cell" style={{ color: getChangeColor(entry.change) }}>
                                            <span className="change-value">
                                                {entry.change > 0 ? '+' : ''}{formatNumber(entry.change)}
                                            </span>
                                        </td>
                                        <td className="percent-cell" style={{ color: getChangeColor(entry.change) }}>
                                            {entry.changePercent > 0 ? '+' : ''}{entry.changePercent.toFixed(2)}%
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
