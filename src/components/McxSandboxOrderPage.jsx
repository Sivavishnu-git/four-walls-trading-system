import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client.js";

const DEFAULT_BASE_KEY = "MCX_FO|554671";
const SLOT_ORDER = ["ATM", "ITM1", "ITM2", "ITM3", "OTM1"];

function extractReason(json, fallback = "Order failed") {
  if (!json) return fallback;
  if (typeof json === "string" && json.trim()) return json;
  if (json.error && typeof json.error === "string") return json.error;
  if (json.message && typeof json.message === "string") return json.message;
  if (Array.isArray(json.errors) && json.errors[0]?.message) return json.errors[0].message;
  return fallback;
}

export function McxSandboxOrderPage({ accessToken }) {
  const [optionType, setOptionType] = useState("CE");
  const [baseKey, setBaseKey] = useState(DEFAULT_BASE_KEY);
  const [loading, setLoading] = useState(false);
  const [ladder, setLadder] = useState(null);
  const [placingSlot, setPlacingSlot] = useState("");
  const [status, setStatus] = useState({ kind: "", text: "" });
  const [publicIp, setPublicIp] = useState("");
  const [logs, setLogs] = useState([]);
  const [logStats, setLogStats] = useState({ total: 0, success: 0, failed: 0 });

  const loadLadder = async () => {
    setLoading(true);
    setStatus({ kind: "", text: "" });
    try {
      const qs = new URLSearchParams({
        base_instrument_key: baseKey.trim() || DEFAULT_BASE_KEY,
        option_type: optionType,
      });
      const res = await apiFetch(`/api/tools/mcx-sandbox-ladder?${qs.toString()}`, { accessToken });
      const json = await res.json();
      if (!res.ok || json?.status !== "success") throw new Error(extractReason(json, "Failed to load ladder"));
      setLadder(json.data);
    } catch (e) {
      setLadder(null);
      setStatus({ kind: "error", text: e.message || "Failed to load ladder" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLadder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionType]);

  const loadPublicIp = async () => {
    try {
      const res = await apiFetch("/api/tools/public-ip");
      const json = await res.json();
      if (res.ok && json?.status === "success" && json?.data?.public_ip) {
        setPublicIp(String(json.data.public_ip));
      }
    } catch {
      // ignore
    }
  };

  const loadLogs = async () => {
    try {
      const res = await apiFetch("/api/sandbox/order/logs", { accessToken });
      const json = await res.json();
      if (!res.ok || json?.status !== "success") return;
      const data = json.data || {};
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setLogStats({
        total: Number(data.total || 0),
        success: Number(data.success || 0),
        failed: Number(data.failed || 0),
      });
    } catch {
      // keep UI usable even if logs endpoint fails
    }
  };

  useEffect(() => {
    loadLogs();
    loadPublicIp();
    const id = setInterval(loadLogs, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slots = useMemo(() => ladder?.slots || {}, [ladder]);

  const placeForSlot = async (slotName) => {
    const slot = slots[slotName];
    if (!slot?.instrument_key) return;
    setPlacingSlot(slotName);
    setStatus({ kind: "", text: "" });
    try {
      const res = await apiFetch("/api/sandbox/order/place", {
        accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_token: slot.instrument_key,
          quantity: 1,
          order_type: "MARKET",
          transaction_type: "BUY",
          product: "I",
          validity: "DAY",
          tag: `mcx-${slotName.toLowerCase()}`,
        }),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text || null; }
      if (!res.ok) throw new Error(extractReason(json, `Order failed (HTTP ${res.status})`));
      setStatus({ kind: "success", text: `${slotName} BUY placed for ${slot.trading_symbol}` });
      loadLogs();
    } catch (e) {
      const msg = e.message || "Order failed";
      if (msg.toLowerCase().includes("static ip") || msg.toLowerCase().includes("ip restriction")) {
        const ipHint = publicIp ? ` Whitelist this server IP in broker app: ${publicIp}` : "";
        setStatus({ kind: "error", text: `Static IP restriction from broker.${ipHint}` });
      } else {
        setStatus({ kind: "error", text: msg });
      }
      loadLogs();
    } finally {
      setPlacingSlot("");
    }
  };

  return (
    <div className="mcx-page">
      <div className="mcx-hero">
        <div>
          <h2>MCX Sandbox Order Studio</h2>
          <p>One-click BUY market intraday entries for ATM / ITM / OTM ladder in Upstox sandbox.</p>
        </div>
        <div className="mcx-controls">
          <input value={baseKey} onChange={(e) => setBaseKey(e.target.value)} placeholder="Base instrument key" />
          <select value={optionType} onChange={(e) => setOptionType(e.target.value)}>
            <option value="CE">CE</option>
            <option value="PE">PE</option>
          </select>
          <button type="button" onClick={loadLadder} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Ladder"}
          </button>
        </div>
      </div>

      <div className="mcx-meta">
        <span>Default base: {DEFAULT_BASE_KEY}</span>
        {ladder?.base?.ltp ? <span>Spot: {Number(ladder.base.ltp).toFixed(2)}</span> : null}
        {ladder?.atm_strike ? <span>ATM: {ladder.atm_strike}</span> : null}
        <span>Tracked: {logStats.total} (OK {logStats.success} / Fail {logStats.failed})</span>
        {publicIp ? <span>Server IP: {publicIp}</span> : null}
      </div>

      {status.text ? (
        <div className={`mcx-status ${status.kind === "error" ? "mcx-status-error" : "mcx-status-success"}`}>
          {status.text}
        </div>
      ) : null}

      <div className="mcx-grid">
        {SLOT_ORDER.map((slotName) => {
          const slot = slots[slotName];
          return (
            <div key={slotName} className="mcx-card">
              <div className="mcx-card-top">
                <span className="mcx-badge">{slotName}</span>
                <span className="mcx-type">{optionType}</span>
              </div>
              <div className="mcx-symbol">{slot?.trading_symbol || "--"}</div>
              <div className="mcx-kv">
                <span>Strike</span>
                <strong>{slot?.strike ?? "--"}</strong>
              </div>
              <div className="mcx-kv">
                <span>Instrument Key</span>
                <strong className="mcx-key">{slot?.instrument_key || "--"}</strong>
              </div>
              <div className="mcx-kv">
                <span>Quantity</span>
                <strong>1</strong>
              </div>
              <div className="mcx-kv">
                <span>Order</span>
                <strong>BUY · MARKET · INTRADAY</strong>
              </div>
              <button
                type="button"
                className="mcx-place-btn"
                disabled={!slot?.instrument_key || placingSlot === slotName}
                onClick={() => placeForSlot(slotName)}
              >
                {placingSlot === slotName ? "Placing..." : `Place ${slotName}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mcx-log-wrap">
        <div className="mcx-log-head">
          <h3>Recent Sandbox MCX Orders</h3>
          <button type="button" onClick={loadLogs}>Refresh Logs</button>
        </div>
        <table className="mcx-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Status</th>
              <th>Instrument</th>
              <th>Intent</th>
              <th>Qty</th>
              <th>Reason / Response</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={6}>No sandbox orders tracked yet.</td></tr>
            ) : logs.map((row, idx) => (
              <tr key={`${row.ts}-${idx}`}>
                <td>{new Date(row.ts).toLocaleTimeString("en-IN")}</td>
                <td style={{ color: row.ok ? "#26a69a" : "#ef5350", fontWeight: 700 }}>{row.ok ? "OK" : "FAIL"}</td>
                <td>{row.instrument_token || "--"}</td>
                <td>{row.trading_intent || "--"}</td>
                <td>{row.quantity ?? "--"}</td>
                <td className="mcx-log-msg">
                  {row.ok
                    ? (row.response?.data?.order_ids?.join(", ") || row.response?.data?.order_id || "Placed")
                    : extractReason(row.error, "Rejected")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
