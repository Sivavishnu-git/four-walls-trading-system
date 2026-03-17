import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Pause, SkipForward, SkipBack, RotateCcw,
  StopCircle, Clock, Calendar,
} from "lucide-react";
import { API_BASE } from "../config";

export const ReplayController = ({ token, onReplayStateChange }) => {
  const [replayDate, setReplayDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  });
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const authHeader = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/replay/status`, { headers: authHeader });
      const json = await res.json();
      const data = json.data || json;
      setStatus(data);
      if (onReplayStateChange) onReplayStateChange(data);
    } catch {}
  }, [authHeader, onReplayStateChange]);

  useEffect(() => {
    fetchStatus();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchStatus, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  const startReplay = async () => {
    if (!token) { setError("Login first"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/replay/start`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ date: replayDate }),
      });
      const json = await res.json();
      if (json.status === "success") {
        setError(null);
        fetchStatus();
      } else {
        setError(json.error || "Failed to start replay");
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const sendControl = async (action, extra = {}) => {
    try {
      await fetch(`${API_BASE}/api/replay/control`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ action, ...extra }),
      });
      fetchStatus();
    } catch {}
  };

  const isActive = status?.active;
  const formatTime = (ts) => {
    if (!ts) return "--:--";
    return new Date(ts).toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{
      background: isActive ? "rgba(255,152,0,0.08)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${isActive ? "rgba(255,152,0,0.3)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: "10px", padding: "12px 18px",
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Clock size={16} style={{ color: "#ff9800" }} />
        <span style={{ color: "#ff9800", fontSize: "0.8rem", fontWeight: 700 }}>REPLAY</span>
      </div>

      {!isActive ? (
        <>
          <input type="date" value={replayDate} onChange={e => setReplayDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]} style={dateInput} />
          <button onClick={startReplay} disabled={loading} style={startBtn}>
            {loading ? "Loading..." : "Start Replay"}
          </button>
        </>
      ) : (
        <>
          <span style={{ color: "#888", fontSize: "0.75rem" }}>
            <Calendar size={12} style={{ marginRight: "4px", verticalAlign: "middle" }} />
            {status.date}
          </span>

          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <button onClick={() => sendControl("step_back")} style={ctrlBtn} title="Step Back">
              <SkipBack size={14} />
            </button>
            {status.playing ? (
              <button onClick={() => sendControl("pause")} style={{ ...ctrlBtn, background: "rgba(255,152,0,0.2)", color: "#ff9800" }} title="Pause">
                <Pause size={14} />
              </button>
            ) : (
              <button onClick={() => sendControl("play")} style={{ ...ctrlBtn, background: "rgba(38,166,154,0.2)", color: "#26a69a" }} title="Play">
                <Play size={14} />
              </button>
            )}
            <button onClick={() => sendControl("step")} style={ctrlBtn} title="Step Forward">
              <SkipForward size={14} />
            </button>
            <button onClick={() => sendControl("reset")} style={ctrlBtn} title="Reset">
              <RotateCcw size={14} />
            </button>
          </div>

          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {[1, 2, 5, 10].map(s => (
              <button key={s} onClick={() => sendControl("speed", { speed: s })} style={{
                ...ctrlBtn,
                background: status.speed === s ? "rgba(41,98,255,0.2)" : "rgba(255,255,255,0.03)",
                color: status.speed === s ? "#2962ff" : "#666",
                border: `1px solid ${status.speed === s ? "rgba(41,98,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                fontSize: "0.7rem", padding: "4px 8px",
              }}>
                {s}x
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: "120px", display: "flex", alignItems: "center", gap: "8px" }}>
            <input type="range" min={0} max={status.total - 1} value={status.position}
              onChange={e => sendControl("goto", { position: parseInt(e.target.value) })}
              style={{ flex: 1, accentColor: "#ff9800", cursor: "pointer" }} />
          </div>

          <span style={{ color: "#fff", fontSize: "0.8rem", fontWeight: 600, fontFamily: "monospace" }}>
            {formatTime(status.currentTime)}
          </span>
          <span style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 700, fontFamily: "monospace" }}>
            {status.currentPrice?.toFixed(2) || "--"}
          </span>
          <span style={{ color: "#555", fontSize: "0.7rem" }}>
            {status.position + 1}/{status.total}
          </span>

          <button onClick={() => sendControl("stop")} style={{ ...ctrlBtn, background: "rgba(239,83,80,0.15)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.3)" }} title="Stop Replay">
            <StopCircle size={14} />
          </button>
        </>
      )}

      {error && <span style={{ color: "#ef5350", fontSize: "0.75rem" }}>{error}</span>}
    </div>
  );
};

const dateInput = {
  padding: "6px 10px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px",
  color: "#fff", fontSize: "0.82rem", outline: "none",
};

const startBtn = {
  padding: "6px 16px", background: "rgba(255,152,0,0.15)",
  border: "1px solid rgba(255,152,0,0.4)", borderRadius: "6px",
  color: "#ff9800", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
};

const ctrlBtn = {
  padding: "5px 8px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "5px",
  color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center",
};
