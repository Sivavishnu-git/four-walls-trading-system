import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import { RefreshCcw, TrendingUp, Lock } from 'lucide-react';
import { useUpstoxPolling } from '../hooks/useUpstoxPolling';

// --- MOCK DATA GENERATOR ---
function generateData(count = 200) {
    let basePrice = 24300; // Adjusted to current Nifty levels
    let data = [];
    let date = new Date();
    // Start from 9:15 AM today
    date.setHours(9, 15, 0, 0);

    for (let i = 0; i < count; i++) {
        let volatility = 15;
        let change = (Math.random() - 0.5) * volatility;
        let open = basePrice;
        let close = open + change;
        let high = Math.max(open, close) + Math.random() * (volatility / 2);
        let low = Math.min(open, close) - Math.random() * (volatility / 2);

        data.push({
            time: Math.floor(date.getTime() / 1000),
            open,
            high,
            low,
            close,
        });

        basePrice = close;
        date.setMinutes(date.getMinutes() + 5);
        if (date.getHours() >= 16) break; // End of market hours
    }
    return data;
}

// --- PIVOT LOGIC ---
function findPivots(data, left = 10, right = 10) {
    let pivots = [];
    if (!data || !Array.isArray(data) || data.length === 0) return pivots;
    for (let i = left; i < data.length - right; i++) {
        let isHigh = true;
        let isLow = true;
        const currentHigh = data[i].high;
        const currentLow = data[i].low;
        for (let j = 1; j <= left; j++) {
            if (data[i - j].high > currentHigh) isHigh = false;
            if (data[i - j].low < currentLow) isLow = false;
        }
        for (let j = 1; j <= right; j++) {
            if (data[i + j].high >= currentHigh) isHigh = false;
            if (data[i + j].low <= currentLow) isLow = false;
        }
        if (isHigh) pivots.push({ price: currentHigh, type: 'resistance', index: i });
        if (isLow) pivots.push({ price: currentLow, type: 'support', index: i });
    }
    return pivots;
}

export const Chart = () => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const linesRef = useRef([]);

    // State
    const [data, setData] = useState([]);
    const [showLines, setShowLines] = useState(false);
    const [isLive, setIsLive] = useState(false);
    const [token, setToken] = useState(import.meta.env.VITE_UPSTOX_ACCESS_TOKEN || "");
    const [showTokenInput, setShowTokenInput] = useState(false);
    const [instrumentKey, setInstrumentKey] = useState("NSE_INDEX|Nifty 50");
    const [instrumentName, setInstrumentName] = useState("Nifty Future");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [error, setError] = useState(null);

    // Upstox Hook (Polling approach)
    const { connect, disconnect, data: liveData, status: wsStatus } = useUpstoxPolling(token, [instrumentKey], 2000);

    const fetchHistoricalData = async (tokenToUse, keyToUse) => {
        try {
            console.log("Fetching real historical data for:", keyToUse);
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`http://localhost:3000/api/historical?instrument_key=${encodeURIComponent(keyToUse)}&interval=5minute&to_date=${today}&from_date=${today}`, {
                headers: {
                    "Authorization": `Bearer ${tokenToUse}`
                }
            });

            if (!response.ok) throw new Error("Failed to fetch historical data");

            const resData = await response.json();
            if (resData.status === 'success' && resData.data && resData.data.candles) {
                const formatted = resData.data.candles.map(c => ({
                    time: Math.floor(new Date(c[0]).getTime() / 1000),
                    open: parseFloat(c[1]),
                    high: parseFloat(c[2]),
                    low: parseFloat(c[3]),
                    close: parseFloat(c[4]),
                })).sort((a, b) => a.time - b.time);

                setData(formatted);
                if (seriesRef.current) {
                    seriesRef.current.setData(formatted);
                }
                // Update timeScale to fit the new data
                if (chartRef.current) {
                    chartRef.current.timeScale().fitContent();
                }
                return formatted;
            }
        } catch (err) {
            console.error("Historical Data Fetch Error:", err);
            setError("Could not load real data: " + err.message);
        }
        return null;
    };

    const handleSearch = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (query.length < 3) {
            setSearchResults([]);
            return;
        }

        try {
            const response = await fetch(`http://localhost:3000/api/search?symbol=${encodeURIComponent(query)}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const resData = await response.json();
            if (resData.status === 'success' && resData.data) {
                setSearchResults(resData.data.slice(0, 10));
            }
        } catch (err) {
            console.error("Search error", err);
        }
    };

    const selectInstrument = async (inst) => {
        setInstrumentKey(inst.instrument_key);
        setInstrumentName(inst.name || inst.trading_symbol);
        setSearchQuery("");
        setSearchResults([]);
        if (isLive) {
            await fetchHistoricalData(token, inst.instrument_key);
        }
    };

    // Initialize Chart
    useEffect(() => {
        if (!chartContainerRef.current) return;

        console.log("Initializing Chart...");
        try {
            // Initial mock data until we go live
            const initialData = generateData();
            setData(initialData);

            const chart = createChart(chartContainerRef.current, {
                layout: {
                    background: { type: ColorType.Solid, color: '#131722' },
                    textColor: '#d1d4dc',
                },
                grid: {
                    vertLines: { color: 'rgba(42, 46, 57, 0.4)' },
                    horzLines: { color: 'rgba(42, 46, 57, 0.4)' },
                },
                width: chartContainerRef.current.clientWidth || 800,
                height: chartContainerRef.current.clientHeight || 500,
                timeScale: { timeVisible: true, secondsVisible: false },
            });

            const candlestickSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350',
            });

            candlestickSeries.setData(initialData);

            chartRef.current = chart;
            seriesRef.current = candlestickSeries;

            const handleResize = () => {
                if (chartRef.current && chartContainerRef.current) {
                    chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
                }
            };
            window.addEventListener('resize', handleResize);
            return () => {
                window.removeEventListener('resize', handleResize);
                if (chart) chart.remove();
            };
        } catch (err) {
            console.error("Chart Init Error", err);
            setError(err.message);
        }
    }, []);

    // Handle Real-Time Updates from Upstox
    useEffect(() => {
        if (isLive && liveData && liveData[instrumentKey] && seriesRef.current) {
            const tick = liveData[instrumentKey];
            const ltp = tick.ltp;

            // Strategy: Update the candle for the CURRENT 5-minute interval
            const now = Math.floor(Date.now() / 1000);
            const fiveMinuteInterval = 5 * 60;
            const currentCandleTime = now - (now % fiveMinuteInterval);

            const lastData = seriesRef.current.data();
            const lastCandle = lastData.length > 0 ? lastData[lastData.length - 1] : null;

            if (lastCandle && lastCandle.time === currentCandleTime) {
                seriesRef.current.update({
                    ...lastCandle,
                    close: ltp,
                    high: Math.max(lastCandle.high, ltp),
                    low: Math.min(lastCandle.low, ltp),
                });
            } else {
                seriesRef.current.update({
                    time: currentCandleTime,
                    open: ltp,
                    high: ltp,
                    low: ltp,
                    close: ltp,
                });
            }
        }
    }, [liveData, isLive, instrumentKey]);

    // Toggle Upstox Connection
    const handleConnect = async () => {
        if (!token) {
            alert("Please enter a valid Upstox Access Token.");
            return;
        }
        setIsLive(true);
        // First fetch real history
        await fetchHistoricalData(token);
        // Then connect WS
        connect();
    };

    // Auto-Draw Lines
    useEffect(() => {
        if (!seriesRef.current) return;
        linesRef.current.forEach(line => seriesRef.current.removePriceLine(line));
        linesRef.current = [];
        if (showLines && data.length > 0) {
            const pivots = findPivots(data);
            pivots.slice(-8).forEach(pivot => {
                const line = seriesRef.current.createPriceLine({
                    price: pivot.price,
                    color: pivot.type === 'resistance' ? '#ef5350' : '#26a69a',
                    lineWidth: 1,
                    lineStyle: 1,
                    axisLabelVisible: true,
                    title: pivot.type === 'resistance' ? 'R' : 'S',
                });
                linesRef.current.push(line);
            });
        }
    }, [showLines, data]);

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 16px', display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: '#1e222d', borderBottom: '1px solid #2A2E39', zIndex: 100 }}>
                <div style={{ minWidth: '150px' }}>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold', color: '#fff' }}>{instrumentName}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: isLive && wsStatus === 'connected' ? '#4caf50' : '#888', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            {isLive ? (wsStatus === 'connected' ? '● Live' : `● ${wsStatus}`) : '● Simulation'}
                        </span>
                    </div>
                </div>

                {/* Symbol Search */}
                <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                    <input
                        type="text"
                        placeholder="Search Instrument (e.g. NIFTY FUT)"
                        value={searchQuery}
                        onChange={handleSearch}
                        disabled={!token}
                        style={{ width: '100%', background: '#2a2e39', border: '1px solid #444', color: 'white', padding: '8px 12px', borderRadius: '4px', fontSize: '0.9rem' }}
                    />
                    {searchResults.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e222d', border: '1px solid #444', borderRadius: '4px', marginTop: '4px', maxHeight: '300px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 1000 }}>
                            {searchResults.map(result => (
                                <div
                                    key={result.instrument_key}
                                    onClick={() => selectInstrument(result)}
                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #333', hover: { background: '#2a2e39' } }}
                                    onMouseEnter={(e) => e.target.style.background = '#2a2e39'}
                                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                >
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{result.trading_symbol}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#888' }}>{result.exchange} | {result.instrument_type}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ flex: 1 }}></div>

                {/* Token Input Toggle */}
                <button onClick={() => setShowTokenInput(!showTokenInput)} title="Enter API Token" style={{ background: 'transparent', border: '1px solid #555', padding: '8px 12px', color: '#ccc', cursor: 'pointer', borderRadius: '4px' }}>
                    <Lock size={16} />
                </button>

                {showTokenInput && (
                    <div style={{ display: 'flex', gap: '5px' }}>
                        <input
                            type="password"
                            placeholder="Upstox Access Token"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            style={{ background: '#2a2e39', border: '1px solid #444', color: 'white', padding: '8px', borderRadius: '4px' }}
                        />
                        <button onClick={handleConnect} style={{ fontSize: '0.8rem', padding: '8px 12px', background: '#2962ff', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px' }}>Go Live</button>
                    </div>
                )}

                <button onClick={() => setShowLines(!showLines)} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', background: showLines ? '#26a69a' : '#2a2e39', border: '1px solid #444', padding: '8px 12px', color: 'white', cursor: 'pointer', borderRadius: '4px' }}>
                    <TrendingUp size={16} /> <span>Levels</span>
                </button>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <div ref={chartContainerRef} style={{ width: '100%', height: '100%', position: 'absolute' }} />
                {error && <div style={{ position: 'absolute', top: 20, left: 20, color: 'red' }}>{error}</div>}
            </div>
        </div>
    );
};
