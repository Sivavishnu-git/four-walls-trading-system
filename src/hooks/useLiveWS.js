import { useState, useEffect, useRef, useCallback } from "react";

/** Returns the proxy WebSocket URL for the current environment. */
function getWsUrl() {
  if (typeof window === "undefined") return "ws://localhost:3000";
  const isDev = import.meta.env.DEV;
  if (isDev) return "ws://localhost:3000";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

/**
 * useLiveWS — subscribes instrument keys to the proxy WebSocket and receives
 * live quote updates pushed by the proxy from the Upstox WebSocket feed.
 *
 * Handles both message types emitted by the proxy:
 *   { type: "tick",   data: { instrument_key, ltp, ltt, ltq, oi, volume, cp, atp } }
 *   { type: "quotes", data: { [instrument_key]: { ltp, oi, change, volume } } }
 *
 * @param {string[]} instrumentKeys  Upstox instrument keys to subscribe
 * @param {string}   accessToken     Bearer token forwarded to the proxy
 * @returns {{ data: Object, status: string, lastTick: Object|null }}
 *   data      — keyed by instrument_key: { ltp, oi, change, volume }
 *   lastTick  — the most recent raw tick (for chart candle aggregation)
 *   status    — "connecting" | "connected" | "disconnected" | "error"
 */
export function useLiveWS(instrumentKeys, accessToken) {
  const [data, setData]         = useState({});
  const [lastTick, setLastTick] = useState(null);
  const [status, setStatus]     = useState("connecting");
  const wsRef                   = useRef(null);
  const keysRef                 = useRef(instrumentKeys);
  const tokenRef                = useRef(accessToken);

  // Keep refs in sync without restarting the connection
  useEffect(() => { keysRef.current = instrumentKeys; }, [instrumentKeys]);
  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  const sendSubscribe = useCallback((ws) => {
    if (ws.readyState === WebSocket.OPEN && keysRef.current.length > 0 && tokenRef.current) {
      ws.send(JSON.stringify({
        type:  "subscribe",
        keys:  keysRef.current,
        token: tokenRef.current,
      }));
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !instrumentKeys.length) return;

    let ws;
    let reconnectTimer = null;
    let destroyed      = false;

    function connect() {
      if (destroyed) return;
      setStatus("connecting");
      ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyed) { ws.close(); return; }
        setStatus("connected");
        sendSubscribe(ws);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          // ── combined tick message (new proxy format) ──────────────────────
          if (msg.type === "tick" && msg.data) {
            const t = msg.data;
            setLastTick(t);
            // update quote state (for OIMonitor, ATM entry, etc.)
            setData((prev) => ({
              ...prev,
              ...(msg.quotes || {}),
              [t.instrument_key]: {
                ltp:    t.ltp,
                oi:     t.oi,
                volume: t.volume,
                change: t.cp ? t.ltp - t.cp : 0,
                atp:    t.atp,
                ltt:    t.ltt,
                ltq:    t.ltq,
              },
            }));
          }

          // ── legacy quotes-only format (fallback) ─────────────────────────
          if (msg.type === "quotes" && msg.data) {
            setData((prev) => ({ ...prev, ...msg.data }));
          }
        } catch { /* ignore malformed */ }
      };

      ws.onerror = () => setStatus("error");

      ws.onclose = () => {
        if (destroyed) return;
        setStatus("disconnected");
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(instrumentKeys), accessToken]);

  // Re-subscribe if keys change while connected
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) sendSubscribe(ws);
  }, [JSON.stringify(instrumentKeys), sendSubscribe]);

  return { data, lastTick, status };
}
