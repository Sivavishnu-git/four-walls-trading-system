import { useEffect, useState, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, RefreshCw, Lock, Unlock } from 'lucide-react';
import { useUpstoxPolling } from '../hooks/useUpstoxPolling';

export const OIMonitor = () => {
    const [token, setToken] = useState(import.meta.env.VITE_UPSTOX_ACCESS_TOKEN || "");
    const [showTokenInput, setShowTokenInput] = useState(false);
    const [isLive, setIsLive] = useState(false);
    const [oiHistory, setOiHistory] = useState([]);
    const [currentOI, setCurrentOI] = useState(null);
    const [oiChange, setOiChange] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const intervalRef = useRef(null);

    // Nifty Future instrument key (Current Month Future - Has OI data)
    const instrumentKey = "NSE_FO|49229";

    const { connect, disconnect, data: liveData, status: wsStatus, error: pollingError } = useUpstoxPolling(token, [instrumentKey], 2000);

    // Capture OI every 2 minutes for the history table
    useEffect(() => {
        if (!isLive || !liveData || !liveData[instrumentKey]) return;

        const captureOI = () => {
            const feedData = liveData[instrumentKey];
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

                // Keep only last 5 entries (10 minutes of data)
                if (updated.length > 5) {
                    updated.shift();
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

        // Capture immediately
        captureOI();

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
    }, []);

    // Debug: Log live data changes
    useEffect(() => {
        if (liveData && liveData[instrumentKey]) {
            console.log("Live data received:", liveData[instrumentKey]);
        }
    }, [liveData, instrumentKey]);

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
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Current OI</div>
                    <div className="stat-value">{formatNumber(currentOI)}</div>
                    <div className="stat-subtitle">Open Interest</div>
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
