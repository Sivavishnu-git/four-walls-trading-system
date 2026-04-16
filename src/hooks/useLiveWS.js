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
 * live quote updates every ~1.5 s (pushed by the proxy from Upstox REST).
 *
 * @param {string[]} instrumentKeys  Upstox instrument keys to subscribe
 * @param {string}   accessToken     Bearer token forwarded to the proxy
 * @returns {{ data: Object, status: string }}
 *   data   — keyed by instrument_key: { ltp, oi, change, volume }
 *   status — "connecting" | "connected" | "disconnected" | "error"
 */
export function useLiveWS(instrumentKeys, accessToken) {
  const [data, setData]     = useState({});
  const [status, setStatus] = useState("connecting");
  const wsRef               = useRef(null);
  const keysRef             = useRef(instrumentKeys);
  const tokenRef            = useRef(accessToken);

  // Keep refs in sync without restarting the connection
  useEffect(() => { keysRef.current = instrumentKeys; }, [instrumentKeys]);
  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  const sendSubscribe = useCallback((ws) => {
    if (ws.readyState === WebSocket.OPEN && keysRef.current.length > 0 && tokenRef.current) {
      ws.send(JSON.stringify({
        type: "subscribe",
        keys: keysRef.current,
        token: tokenRef.current,
      }));
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !instrumentKeys.length) return;

    let ws;
    let reconnectTimer = null;
    let destroyed = false;

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
          if (msg.type === "quotes" && msg.data) {
            setData((prev) => ({ ...prev, ...msg.data }));
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => setStatus("error");

      ws.onclose = () => {
        if (destroyed) return;
        setStatus("disconnected");
        // Reconnect after 3 s
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  // Only restart when keys or token actually change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(instrumentKeys), accessToken]);

  // Re-subscribe if keys change while connected
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendSubscribe(ws);
    }
  }, [JSON.stringify(instrumentKeys), sendSubscribe]);

  return { data, status };
}
