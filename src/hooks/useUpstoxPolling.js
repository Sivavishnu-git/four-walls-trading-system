import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../api/client.js";

/**
 * useUpstoxPolling Hook
 * 
 * An alternative to WebSockets that uses REST API polling to fetch market data.
 * Useful when WebSocket stability is an issue or when Protobuf complexity is not needed.
 * 
 * @param {string} accessToken - Upstox API Access Token
 * @param {string[]} instrumentKeys - Array of instrument keys to poll
 * @param {number} interval - Polling interval in milliseconds (default 2000)
 */
export const useUpstoxPolling = (accessToken, instrumentKeys = [], interval = 2000) => {
    const [data, setData] = useState({});
    const [status, setStatus] = useState("idle");
    const [error, setError] = useState(null);
    const timerRef = useRef(null);

    const fetchData = useCallback(async () => {
        if (!accessToken || instrumentKeys.length === 0) return;

        try {
            const keysParam = instrumentKeys.join(",");

            const response = await apiFetch(
                `/api/quotes?instrument_keys=${encodeURIComponent(keysParam)}`,
                { accessToken },
            );

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP ${response.status}`);
            }

            const resData = await response.json();

            // Transform Upstox V2 Quote format to match the internal 'data' structure
            // V2 response structure: { data: { "INSTRUMENT_KEY": { ... } } }
            if (resData.data) {
                const updates = {};
                Object.keys(resData.data).forEach(key => {
                    const quote = resData.data[key];
                    // IMPORTANT: API returns key as "NSE_FO:SYMBOL" but we need "NSE_FO|TOKEN"
                    // We use the instrument_token from the response itself to ensure it matches what the UI expects
                    const normalizedKey = quote.instrument_token || key;
                    const ohlc = quote.ohlc || {};

                    updates[normalizedKey] = {
                        ltp: quote.last_price,
                        close: quote.close || ohlc.close,
                        oi: quote.oi || (quote.depth?.buy ? 0 : 0), // OI might be in depth or specific quote fields
                        volume: quote.volume || 0,
                        open: ohlc.open || 0,
                        high: ohlc.high || 0,
                        low: ohlc.low || 0,
                        symbol: quote.symbol || key.split(':')[1] || key,
                        last_updated: quote.timestamp,
                        full: quote // Keep the full original quote for flexibility
                    };
                });
                setData(prev => ({ ...prev, ...updates }));
                setStatus("connected");
                setError(null);
            }
        } catch (err) {
            console.error("Polling Error:", err);
            setStatus("error");
            setError(err.message);
        }
    }, [accessToken, JSON.stringify(instrumentKeys)]);

    useEffect(() => {
        if (!accessToken || instrumentKeys.length === 0) {
            setStatus("idle");
            return;
        }

        setStatus("connecting");

        // Initial fetch
        fetchData();

        // Setup polling
        timerRef.current = setInterval(fetchData, interval);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [accessToken, JSON.stringify(instrumentKeys), interval, fetchData]);

    const connect = useCallback(() => {
        // Provided for compatibility with useUpstoxWebSocket interface
        setStatus("connecting");
        fetchData();
    }, [fetchData]);

    const disconnect = useCallback(() => {
        // Provided for compatibility with useUpstoxWebSocket interface
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        setStatus("disconnected");
    }, []);

    return { connect, disconnect, data, status, error };
};
