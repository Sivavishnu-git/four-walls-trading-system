import { useState, useEffect, useRef } from "react";
import { API_BASE } from "../config";
import { RefreshCw, Download, Search } from "lucide-react";

export const HistoricalData = ({ token, instrumentKey: propInstrumentKey }) => {
    const [instrumentKey, setInstrumentKey] = useState(
        propInstrumentKey || import.meta.env.VITE_INSTRUMENT_KEY || ""
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [showSearch, setShowSearch] = useState(false);
    const searchTimeout = useRef(null);

    useEffect(() => {
        if (propInstrumentKey) setInstrumentKey(propInstrumentKey);
    }, [propInstrumentKey]);

    useEffect(() => {
        if (searchQuery.length < 2) { setSearchResults([]); return; }
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/tools/search-master?query=${encodeURIComponent(searchQuery)}`);
                const json = await res.json();
                if (json.status === "success") setSearchResults(json.data || []);
            } catch { /* ignore */ }
        }, 300);
    }, [searchQuery]);

    const [interval, setInterval_] = useState("day");
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split("T")[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [candles, setCandles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = async () => {
        if (!token) {
            setError("No access token. Please set it in the OI Monitor page first.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const url = `${API_BASE}/api/historical?instrument_key=${encodeURIComponent(instrumentKey)}&interval=${interval}&to_date=${toDate}&from_date=${fromDate}`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = await res.json();

            if (json.status === "success" && json.data?.candles) {
                // Sort ascending by time
                const sorted = [...json.data.candles].sort(
                    (a, b) => new Date(a[0]) - new Date(b[0])
                );
                setCandles(sorted);
            } else {
                setError(json.errors?.[0]?.message || JSON.stringify(json));
                setCandles([]);
            }
        } catch (err) {
            setError(err.message);
            setCandles([]);
        } finally {
            setLoading(false);
        }
    };

    const formatNum = (n) => {
        if (n == null) return "--";
        return new Intl.NumberFormat("en-IN").format(n);
    };

    const formatTime = (ts) => {
        const d = new Date(ts);
        if (interval === "1minute" || interval === "30minute") {
            return d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
        }
        return d.toLocaleDateString("en-IN");
    };

    const getChangeColor = (change) => {
        if (change > 0) return "#26a69a";
        if (change < 0) return "#ef5350";
        return "#888";
    };

    const downloadCSV = () => {
        if (candles.length === 0) return;
        const header = "Timestamp,Open,High,Low,Close,Volume,OI\n";
        const rows = candles
            .map((c) => `${c[0]},${c[1]},${c[2]},${c[3]},${c[4]},${c[5]},${c[6] ?? ""}`)
            .join("\n");
        const blob = new Blob([header + rows], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `historical_${instrumentKey.replace("|", "_")}_${interval}_${fromDate}_${toDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="oi-monitor-container">
            {/* Controls */}
            <div className="oi-header" style={{ flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, color: "#fff", fontSize: "1.3rem", fontWeight: 700 }}>
                        📊 Historical Data Explorer
                    </h2>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ position: "relative" }}>
                        <input
                            type="text"
                            value={showSearch ? searchQuery : instrumentKey}
                            onChange={(e) => {
                                if (showSearch) setSearchQuery(e.target.value);
                                else setInstrumentKey(e.target.value);
                            }}
                            onFocus={() => setShowSearch(true)}
                            onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                            placeholder={showSearch ? "Search (e.g. NIFTY, RELIANCE)..." : "Instrument Key"}
                            className="token-input"
                            style={{ minWidth: "220px" }}
                        />
                        {showSearch && searchResults.length > 0 && (
                            <div style={{
                                position: "absolute", top: "100%", left: 0, right: 0,
                                background: "#1e222d", border: "1px solid rgba(255,255,255,0.15)",
                                borderRadius: "0 0 8px 8px", maxHeight: "250px", overflowY: "auto", zIndex: 100,
                            }}>
                                {searchResults.map((r, i) => (
                                    <div key={i}
                                        onMouseDown={() => { setInstrumentKey(r.key); setSearchQuery(""); setSearchResults([]); setShowSearch(false); }}
                                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.85rem" }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                    >
                                        <div style={{ color: "#fff", fontWeight: 600 }}>{r.symbol}</div>
                                        <div style={{ color: "#666", fontSize: "0.75rem" }}>
                                            {r.key} {r.expiry ? `• ${new Date(r.expiry).toLocaleDateString()}` : ""} {r.type || ""}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <select
                        value={interval}
                        onChange={(e) => setInterval_(e.target.value)}
                        style={{
                            padding: "10px 14px",
                            background: "rgba(0,0,0,0.3)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            color: "#fff",
                            borderRadius: "8px",
                            fontSize: "0.9rem",
                            cursor: "pointer",
                        }}
                    >
                        <option value="1minute">1 Minute</option>
                        <option value="30minute">30 Minute</option>
                        <option value="day">Daily</option>
                        <option value="week">Weekly</option>
                        <option value="month">Monthly</option>
                    </select>

                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        style={{
                            padding: "10px 14px",
                            background: "rgba(0,0,0,0.3)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            color: "#fff",
                            borderRadius: "8px",
                            fontSize: "0.9rem",
                        }}
                    />
                    <span style={{ color: "#666" }}>→</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        style={{
                            padding: "10px 14px",
                            background: "rgba(0,0,0,0.3)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            color: "#fff",
                            borderRadius: "8px",
                            fontSize: "0.9rem",
                        }}
                    />

                    <button onClick={fetchData} className="connect-btn" disabled={loading}>
                        {loading ? <RefreshCw size={16} className="spinning" /> : <Search size={16} />}
                        <span style={{ marginLeft: "6px" }}>{loading ? "Fetching..." : "Fetch"}</span>
                    </button>

                    {candles.length > 0 && (
                        <button
                            onClick={downloadCSV}
                            style={{
                                padding: "10px 16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                color: "#aaa",
                                borderRadius: "8px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                transition: "all 0.2s",
                            }}
                            title="Download as CSV"
                        >
                            <Download size={14} />
                            CSV
                        </button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div
                    style={{
                        padding: "14px 20px",
                        background: "rgba(239,83,80,0.12)",
                        border: "1px solid rgba(239,83,80,0.3)",
                        borderRadius: "8px",
                        color: "#ef5350",
                        marginBottom: "20px",
                        fontSize: "0.9rem",
                    }}
                >
                    ⚠️ {error}
                </div>
            )}

            {/* Summary */}
            {candles.length > 0 && (
                <div className="stats-grid" style={{ marginBottom: "24px" }}>
                    <div className="stat-card">
                        <div className="stat-label">Total Candles</div>
                        <div className="stat-value">{candles.length}</div>
                        <div className="stat-subtitle">{interval} interval</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Date Range</div>
                        <div className="stat-value small">
                            {formatTime(candles[0][0])}
                        </div>
                        <div className="stat-subtitle">to {formatTime(candles[candles.length - 1][0])}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Latest Close</div>
                        <div className="stat-value">₹{candles[candles.length - 1][4].toFixed(2)}</div>
                        <div className="stat-subtitle">
                            {(() => {
                                if (candles.length < 2) return "Single candle";
                                const diff = candles[candles.length - 1][4] - candles[candles.length - 2][4];
                                return (
                                    <span style={{ color: getChangeColor(diff) }}>
                                        {diff > 0 ? "+" : ""}{diff.toFixed(2)} from prev
                                    </span>
                                );
                            })()}
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Latest OI</div>
                        <div className="stat-value">
                            {formatNum(candles[candles.length - 1][6])}
                        </div>
                        <div className="stat-subtitle">Open Interest</div>
                    </div>
                </div>
            )}

            {/* Data Table */}
            <div className="history-section">
                <div className="section-header">
                    <h2>Candle Data</h2>
                    {candles.length > 0 && (
                        <span style={{ color: "#888", fontSize: "0.85rem" }}>
                            {candles.length} rows • {instrumentKey}
                        </span>
                    )}
                </div>
                <div className="table-container" style={{ maxHeight: "600px" }}>
                    {candles.length === 0 ? (
                        <div className="empty-state">
                            <Search size={48} />
                            <p>Select parameters and click Fetch to load historical data.</p>
                        </div>
                    ) : (
                        <table className="oi-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Time</th>
                                    <th>Open</th>
                                    <th>High</th>
                                    <th>Low</th>
                                    <th>Close</th>
                                    <th>Volume</th>
                                    <th>OI</th>
                                    <th>OI Chg</th>
                                </tr>
                            </thead>
                            <tbody>
                                {candles.map((c, idx) => {
                                    const oiChange = idx > 0 && c[6] != null && candles[idx - 1][6] != null
                                        ? c[6] - candles[idx - 1][6]
                                        : null;
                                    const priceChange = c[4] - c[1]; // close - open
                                    return (
                                        <tr key={idx} className={idx === candles.length - 1 ? "latest-row" : ""}>
                                            <td style={{ color: "#555", fontSize: "0.8rem" }}>{idx + 1}</td>
                                            <td className="time-cell">{formatTime(c[0])}</td>
                                            <td>₹{c[1].toFixed(2)}</td>
                                            <td style={{ color: "#26a69a" }}>₹{c[2].toFixed(2)}</td>
                                            <td style={{ color: "#ef5350" }}>₹{c[3].toFixed(2)}</td>
                                            <td style={{ color: getChangeColor(priceChange), fontWeight: 600 }}>
                                                ₹{c[4].toFixed(2)}
                                            </td>
                                            <td>{formatNum(c[5])}</td>
                                            <td style={{ fontWeight: 600 }}>{formatNum(c[6])}</td>
                                            <td style={{ color: getChangeColor(oiChange), fontWeight: 600 }}>
                                                {oiChange != null
                                                    ? `${oiChange > 0 ? "+" : ""}${formatNum(oiChange)}`
                                                    : "--"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
