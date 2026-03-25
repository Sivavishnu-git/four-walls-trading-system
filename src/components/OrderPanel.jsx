import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  RefreshCw, ShoppingCart, X, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  DollarSign, List, Briefcase, Pencil,
} from "lucide-react";

import { API_BASE } from "../config";
import { useAuth } from "../context/AuthContext.jsx";
import { bearerAuthHeaders } from "../utils/authToken";

const DEFAULT_LOT_SIZE = 65;
const BASE_URL = API_BASE;

export const OrderPanel = () => {
  const { accessToken: token } = useAuth();
  const authHeaders = useMemo(() => bearerAuthHeaders(token), [token]);
  const [atmData, setAtmData] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [posLoading, setPosLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState(null);

  const [lots, setLots] = useState(1);
  const [orderType, setOrderType] = useState("MARKET");
  const [product, setProduct] = useState("I");
  const [limitPrice, setLimitPrice] = useState("");
  const [gttTriggerPrice, setGttTriggerPrice] = useState("");
  const [gttTriggerSide, setGttTriggerSide] = useState("ABOVE");
  const [gttOrders, setGttOrders] = useState([]);
  const [gttLoading, setGttLoading] = useState(false);
  const [gttConfigError, setGttConfigError] = useState(null);
  const [gttEditModal, setGttEditModal] = useState(null);
  const [gttModifySaving, setGttModifySaving] = useState(false);

  const timerRef = useRef(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchATM = useCallback(async () => {
    if (!token) { setError("No access token. Please login first."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/atm-options`, { headers: authHeaders });
      const json = await res.json();
      if (json.status === "success") {
        setAtmData(json.data);
        setLastRefresh(new Date());
      } else {
        setError(json.error || "Failed to load ATM options");
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token, authHeaders]);

  const fetchPositions = useCallback(async () => {
    if (!token) return;
    setPosLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/portfolio/positions`, { headers: authHeaders });
      const json = await res.json();
      if (json.data) setPositions(Array.isArray(json.data) ? json.data : []);
    } catch {}
    finally { setPosLoading(false); }
  }, [token]);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setOrderLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/order/book`, { headers: authHeaders });
      const json = await res.json();
      if (json.data) setOrders(Array.isArray(json.data) ? json.data : []);
    } catch {}
    finally { setOrderLoading(false); }
  }, [token, authHeaders]);

  const fetchGttOrders = useCallback(async () => {
    if (!token) return;
    setGttLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/order/gtt`, { headers: authHeaders });
      const json = await res.json();
      if (json.status === "success" && json.data) {
        setGttOrders(Array.isArray(json.data) ? json.data : []);
      } else {
        setGttOrders([]);
      }
    } catch {
      setGttOrders([]);
    } finally {
      setGttLoading(false);
    }
  }, [token, authHeaders]);

  const refreshAll = useCallback(() => {
    fetchATM();
    fetchPositions();
    fetchOrders();
    fetchGttOrders();
  }, [fetchATM, fetchPositions, fetchOrders, fetchGttOrders]);
 
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (autoRefresh) timerRef.current = setInterval(refreshAll, 5000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, refreshAll]);

  const openConfirm = (option, txnType) => {
    if (orderType === "GTT") {
      const t = parseFloat(gttTriggerPrice);
      if (gttTriggerPrice === "" || Number.isNaN(t) || t <= 0) {
        setGttConfigError("Enter a valid trigger price for GTT");
        return;
      }
      setGttConfigError(null);
    }
    const lotSize = DEFAULT_LOT_SIZE;
    const limitPx = orderType === "LIMIT" ? parseFloat(limitPrice) || option.ltp : 0;
    const triggerPx = orderType === "GTT" ? parseFloat(gttTriggerPrice) : 0;
    setConfirmModal({
      option,
      txnType,
      qty: lots * lotSize,
      lots,
      lotSize,
      orderType,
      product,
      price: orderType === "LIMIT" ? limitPx : orderType === "GTT" ? triggerPx : 0,
      gttTriggerSide: orderType === "GTT" ? gttTriggerSide : null,
    });
    setOrderResult(null);
  };

  const placeOrder = async () => {
    if (!confirmModal) return;
    setPlacing(true);
    setOrderResult(null);
    try {
      if (confirmModal.orderType === "GTT") {
        const body = {
          type: "SINGLE",
          quantity: confirmModal.qty,
          product: confirmModal.product,
          instrument_token: confirmModal.option.instrument_key,
          transaction_type: confirmModal.txnType,
          rules: [
            {
              strategy: "ENTRY",
              trigger_type: confirmModal.gttTriggerSide || "ABOVE",
              trigger_price: confirmModal.price,
              market_protection: 0,
            },
          ],
        };
        const res = await fetch(`${BASE_URL}/api/order/gtt/place`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        const gttId = json.data?.gtt_order_ids?.[0];
        if (res.ok && json.status === "success" && gttId) {
          setOrderResult({
            success: true,
            orderId: gttId,
            message: "GTT order placed successfully!",
          });
          setTimeout(() => { fetchGttOrders(); fetchOrders(); fetchPositions(); }, 1500);
        } else {
          setOrderResult({
            success: false,
            message: json.errors?.[0]?.message || json.message || json.error || "GTT order failed",
          });
        }
        return;
      }

      const body = {
        instrument_token: confirmModal.option.instrument_key,
        quantity: confirmModal.qty,
        product: confirmModal.product,
        validity: "DAY",
        order_type: confirmModal.orderType,
        transaction_type: confirmModal.txnType,
        price: confirmModal.orderType === "LIMIT" ? confirmModal.price : 0,
        trigger_price: 0,
        disclosed_quantity: 0,
        is_amo: false,
      };
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setOrderResult({ success: true, orderId: json.data.order_id || "placed", message: "Order placed successfully!" });
        setTimeout(() => { fetchOrders(); fetchPositions(); }, 1500);
      } else {
        setOrderResult({ success: false, message: json.errors?.[0]?.message || json.error || "Order failed" });
      }
    } catch (err) {
      setOrderResult({ success: false, message: err.message });
    } finally {
      setPlacing(false);
    }
  };

  const cancelOrder = async (orderId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/order/cancel?order_id=${orderId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const json = await res.json();
      if (res.ok) fetchOrders();
      else alert(json.error || "Cancel failed");
    } catch (err) { alert(err.message); }
  };

  const cancelGttOrder = async (gttOrderId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/order/gtt/cancel`, {
        method: "DELETE",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ gtt_order_id: gttOrderId }),
      });
      const json = await res.json();
      if (res.ok && json.status === "success") fetchGttOrders();
      else alert(json.errors?.[0]?.message || json.error || "GTT cancel failed");
    } catch (err) { alert(err.message); }
  };

  const openGttEdit = (g) => {
    const entry = g.rules?.find((r) => r.strategy === "ENTRY");
    const entryOpen = entry?.status === "OPEN";
    const rules = (g.rules || []).map((r) => {
      let trigger_type = r.trigger_type;
      if (r.strategy === "ENTRY" && entryOpen) trigger_type = "IMMEDIATE";
      if (r.strategy === "TARGET" || r.strategy === "STOPLOSS") trigger_type = "IMMEDIATE";
      return {
        strategy: r.strategy,
        trigger_type,
        trigger_price: String(r.trigger_price ?? ""),
        trailing_gap: r.trailing_gap != null ? String(r.trailing_gap) : "",
      };
    });
    setGttEditModal({
      gtt_order_id: g.gtt_order_id,
      type: g.type || "SINGLE",
      quantity: g.quantity,
      rules,
      entryOpen,
    });
  };

  const submitGttModify = async () => {
    if (!gttEditModal) return;
    const qty = parseInt(String(gttEditModal.quantity), 10);
    if (Number.isNaN(qty) || qty <= 0) {
      alert("Enter a valid quantity");
      return;
    }
    const rulesPayload = [];
    for (const r of gttEditModal.rules) {
      const tp = parseFloat(r.trigger_price);
      if (r.trigger_price === "" || Number.isNaN(tp)) {
        alert(`Invalid trigger price for ${r.strategy}`);
        return;
      }
      const rule = {
        strategy: r.strategy,
        trigger_type: r.trigger_type,
        trigger_price: tp,
        market_protection: 0,
      };
      if (r.strategy === "STOPLOSS" && r.trailing_gap !== "") {
        const tg = parseFloat(r.trailing_gap);
        if (!Number.isNaN(tg)) rule.trailing_gap = tg;
      }
      rulesPayload.push(rule);
    }
    setGttModifySaving(true);
    try {
      const body = {
        gtt_order_id: gttEditModal.gtt_order_id,
        type: gttEditModal.type,
        quantity: qty,
        rules: rulesPayload,
      };
      const res = await fetch(`${BASE_URL}/api/order/gtt/modify`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setGttEditModal(null);
        fetchGttOrders();
      } else {
        alert(json.errors?.[0]?.message || json.message || json.error || "GTT modify failed");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setGttModifySaving(false);
    }
  };

  const updateGttEditRule = (index, patch) => {
    setGttEditModal((prev) => {
      if (!prev) return prev;
      const rules = prev.rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
      return { ...prev, rules };
    });
  };

  const exitPosition = (pos) => {
    const txn = pos.quantity > 0 ? "SELL" : "BUY";
    const qty = Math.abs(pos.quantity);
    openConfirm({
      instrument_key: pos.instrument_token,
      symbol: pos.trading_symbol,
      ltp: pos.last_price || 0,
      strike: "",
      type: "",
    }, txn);
    setConfirmModal(prev => prev ? { ...prev, qty, lots: qty / (prev.lotSize || DEFAULT_LOT_SIZE) } : null);
  };

  const fmt = (n) => n != null ? n.toFixed(2) : "--";
  const fmtOI = (n) => {
    if (!n) return "0";
    if (n >= 100000) return (n / 100000).toFixed(2) + " L";
    if (n >= 1000) return (n / 1000).toFixed(1) + " K";
    return n.toLocaleString("en-IN");
  };

  const ceOptions = atmData?.options?.filter(o => o.type === "CE") || [];
  const peOptions = atmData?.options?.filter(o => o.type === "PE") || [];

  const niftyPositions = positions.filter(p =>
    p.trading_symbol?.includes("NIFTY") && p.quantity !== 0
  );

  return (
    <div className="oi-monitor-container">
      {/* Header */}
      <div className="oi-header" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: "1.3rem", fontWeight: 700 }}>
            <ShoppingCart size={22} style={{ verticalAlign: "middle", marginRight: "8px", color: "#ff9800" }} />
            Order Placement
          </h2>
          {atmData && (
            <>
              <span style={{ background: "rgba(255,152,0,0.15)", border: "1px solid rgba(255,152,0,0.3)", padding: "4px 10px", borderRadius: "4px", color: "#ff9800", fontSize: "0.8rem", fontWeight: 600 }}>
                NIFTY {fmt(atmData.spot_price)}
              </span>
              <span style={{ color: "#888", fontSize: "0.75rem" }}>
                ATM: {atmData.atm_strike} | Exp: {atmData.expiry_date}
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={() => setAutoRefresh(!autoRefresh)} style={{
            padding: "8px 14px",
            background: autoRefresh ? "rgba(38,166,154,0.2)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${autoRefresh ? "rgba(38,166,154,0.4)" : "rgba(255,255,255,0.15)"}`,
            color: autoRefresh ? "#26a69a" : "#888", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
          }}>
            {autoRefresh ? "Auto ON (5s)" : "Auto OFF"}
          </button>
          <button onClick={refreshAll} className="connect-btn" disabled={loading}>
            {loading ? <RefreshCw size={16} className="spinning" /> : <RefreshCw size={16} />}
            <span style={{ marginLeft: "6px" }}>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "14px 20px", background: "rgba(239,83,80,0.12)", border: "1px solid rgba(239,83,80,0.3)", borderRadius: "8px", color: "#ef5350", marginBottom: "16px", fontSize: "0.9rem" }}>
          <AlertTriangle size={16} style={{ verticalAlign: "middle", marginRight: "6px" }} />{error}
        </div>
      )}

      {/* Order Config */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center", padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#888", fontSize: "0.8rem", fontWeight: 600 }}>Lots:</span>
          <button onClick={() => setLots(Math.max(1, lots - 1))} style={btnSmall}>-</button>
          <span style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, minWidth: "30px", textAlign: "center" }}>{lots}</span>
          <button onClick={() => setLots(lots + 1)} style={btnSmall}>+</button>
          <span style={{ color: "#555", fontSize: "0.75rem" }}>({lots * DEFAULT_LOT_SIZE} qty)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#888", fontSize: "0.8rem", fontWeight: 600 }}>Type:</span>
          {["MARKET", "LIMIT", "GTT"].map(t => (
            <button key={t} onClick={() => { setOrderType(t); setGttConfigError(null); }} style={{
              ...btnSmall,
              background: orderType === t ? "rgba(41,98,255,0.2)" : "rgba(255,255,255,0.05)",
              color: orderType === t ? "#2962ff" : "#888",
              border: `1px solid ${orderType === t ? "rgba(41,98,255,0.4)" : "rgba(255,255,255,0.1)"}`,
            }}>{t}</button>
          ))}
        </div>
        {orderType === "LIMIT" && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "#888", fontSize: "0.8rem" }}>Price:</span>
            <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
              placeholder="0.00" style={inputStyle} />
          </div>
        )}
        {orderType === "GTT" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#888", fontSize: "0.8rem" }}>Trigger:</span>
              {["ABOVE", "BELOW"].map(s => (
                <button key={s} type="button" onClick={() => setGttTriggerSide(s)} style={{
                  ...btnSmall,
                  background: gttTriggerSide === s ? "rgba(156,39,176,0.25)" : "rgba(255,255,255,0.05)",
                  color: gttTriggerSide === s ? "#ce93d8" : "#888",
                  border: `1px solid ${gttTriggerSide === s ? "rgba(156,39,176,0.45)" : "rgba(255,255,255,0.1)"}`,
                }}>{s}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#888", fontSize: "0.8rem" }}>Price:</span>
              <input
                type="number"
                value={gttTriggerPrice}
                onChange={(e) => { setGttTriggerPrice(e.target.value); setGttConfigError(null); }}
                placeholder="Trigger"
                style={{ ...inputStyle, width: "100px" }}
              />
            </div>
            <span style={{ color: "#666", fontSize: "0.72rem", maxWidth: "220px" }}>
              Fires when LTP goes {gttTriggerSide === "ABOVE" ? "above" : "below"} this level (single-leg GTT).
            </span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#888", fontSize: "0.8rem", fontWeight: 600 }}>Product:</span>
          {[{ id: "I", label: "Intraday" }, { id: "D", label: "NRML" }].map(p => (
            <button key={p.id} onClick={() => setProduct(p.id)} style={{
              ...btnSmall,
              background: product === p.id ? "rgba(255,152,0,0.2)" : "rgba(255,255,255,0.05)",
              color: product === p.id ? "#ff9800" : "#888",
              border: `1px solid ${product === p.id ? "rgba(255,152,0,0.4)" : "rgba(255,255,255,0.1)"}`,
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* ATM Options Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        {/* CALL OPTIONS */}
        <div className="history-section">
          <div className="section-header">
            <h2 style={{ color: "#26a69a" }}><ArrowUpCircle size={18} style={{ marginRight: "6px" }} />CALL OPTIONS (CE)</h2>
          </div>
          <div className="table-container">
            <table className="oi-table" style={{ fontSize: "0.85rem" }}>
              <thead>
                <tr><th>Strike</th><th>LTP</th><th>OI</th><th>Action</th></tr>
              </thead>
              <tbody>
                {ceOptions.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "#555", padding: "20px" }}>Loading...</td></tr>
                ) : ceOptions.map(opt => {
                  const isATM = opt.strike === atmData?.atm_strike;
                  return (
                    <tr key={opt.instrument_key} style={{ background: isATM ? "rgba(38,166,154,0.08)" : "transparent" }}>
                      <td style={{ fontWeight: 700, color: isATM ? "#ff9800" : "#fff" }}>
                        {opt.strike}{isATM && <span style={{ fontSize: "0.6rem", color: "#ff9800", marginLeft: "4px" }}>ATM</span>}
                      </td>
                      <td style={{ fontFamily: "monospace", fontWeight: 600, color: opt.change >= 0 ? "#26a69a" : "#ef5350" }}>
                        {fmt(opt.ltp)}
                      </td>
                      <td style={{ color: "#aaa" }}>{fmtOI(opt.oi)}</td>
                      <td>
                        <button onClick={() => openConfirm(opt, "BUY")} style={buyBtn}>
                          BUY
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* PUT OPTIONS */}
        <div className="history-section">
          <div className="section-header">
            <h2 style={{ color: "#ef5350" }}><ArrowDownCircle size={18} style={{ marginRight: "6px" }} />PUT OPTIONS (PE)</h2>
          </div>
          <div className="table-container">
            <table className="oi-table" style={{ fontSize: "0.85rem" }}>
              <thead>
                <tr><th>Strike</th><th>LTP</th><th>OI</th><th>Action</th></tr>
              </thead>
              <tbody>
                {peOptions.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "#555", padding: "20px" }}>Loading...</td></tr>
                ) : peOptions.map(opt => {
                  const isATM = opt.strike === atmData?.atm_strike;
                  return (
                    <tr key={opt.instrument_key} style={{ background: isATM ? "rgba(239,83,80,0.08)" : "transparent" }}>
                      <td style={{ fontWeight: 700, color: isATM ? "#ff9800" : "#fff" }}>
                        {opt.strike}{isATM && <span style={{ fontSize: "0.6rem", color: "#ff9800", marginLeft: "4px" }}>ATM</span>}
                      </td>
                      <td style={{ fontFamily: "monospace", fontWeight: 600, color: opt.change >= 0 ? "#26a69a" : "#ef5350" }}>
                        {fmt(opt.ltp)}
                      </td>
                      <td style={{ color: "#aaa" }}>{fmtOI(opt.oi)}</td>
                      <td>
                        <button onClick={() => openConfirm(opt, "BUY")} style={sellBtn}>
                          BUY
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Positions */}
      <div className="history-section" style={{ marginBottom: "20px" }}>
        <div className="section-header">
          <h2><Briefcase size={18} style={{ marginRight: "6px" }} />Open Positions</h2>
          <button onClick={fetchPositions} style={{ ...btnSmall, padding: "4px 10px" }}>
            {posLoading ? <RefreshCw size={12} className="spinning" /> : "Refresh"}
          </button>
        </div>
        <div className="table-container">
          {niftyPositions.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px" }}>
              <Briefcase size={32} />
              <p>No open NIFTY positions</p>
            </div>
          ) : (
            <table className="oi-table" style={{ fontSize: "0.85rem" }}>
              <thead>
                <tr><th>Symbol</th><th>Qty</th><th>Avg Price</th><th>LTP</th><th>P&L</th><th>Action</th></tr>
              </thead>
              <tbody>
                {niftyPositions.map((pos, i) => {
                  const pnl = pos.pnl || ((pos.last_price - pos.average_price) * pos.quantity);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{pos.trading_symbol}</td>
                      <td style={{ color: pos.quantity > 0 ? "#26a69a" : "#ef5350", fontWeight: 700 }}>
                        {pos.quantity > 0 ? "+" : ""}{pos.quantity}
                      </td>
                      <td style={{ fontFamily: "monospace" }}>{fmt(pos.average_price)}</td>
                      <td style={{ fontFamily: "monospace" }}>{fmt(pos.last_price)}</td>
                      <td style={{ color: pnl >= 0 ? "#26a69a" : "#ef5350", fontWeight: 700, fontFamily: "monospace" }}>
                        {pnl >= 0 ? "+" : ""}{fmt(pnl)}
                      </td>
                      <td>
                        <button onClick={() => exitPosition(pos)} style={{ ...btnSmall, background: "rgba(239,83,80,0.2)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.4)" }}>
                          EXIT
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Active GTT */}
      <div className="history-section" style={{ marginBottom: "20px" }}>
        <div className="section-header">
          <h2><List size={18} style={{ marginRight: "6px" }} />Active GTT</h2>
          <button onClick={fetchGttOrders} style={{ ...btnSmall, padding: "4px 10px" }}>
            {gttLoading ? <RefreshCw size={12} className="spinning" /> : "Refresh"}
          </button>
        </div>
        <div className="table-container" style={{ maxHeight: "260px" }}>
          {gttOrders.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px" }}>
              <List size={28} />
              <p>No active GTT orders</p>
            </div>
          ) : (
            <table className="oi-table" style={{ fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th>GTT ID</th>
                  <th>Symbol</th>
                  <th>Qty</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gttOrders.map((g) => {
                  const entry = g.rules?.find((r) => r.strategy === "ENTRY");
                  const canCancelGtt = entry && ["SCHEDULED", "PENDING", "OPEN"].includes(entry.status);
                  const canModifyGtt = canCancelGtt;
                  const tsMs = (v) => {
                    if (v == null) return null;
                    const n = Number(v);
                    if (!Number.isFinite(n)) return null;
                    return n > 1e14 ? n / 1000 : n;
                  };
                  const exp = tsMs(g.expires_at);
                  return (
                    <tr key={g.gtt_order_id}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#aaa" }}>{g.gtt_order_id}</td>
                      <td style={{ fontWeight: 600 }}>{g.trading_symbol || g.instrument_token}</td>
                      <td>{g.quantity}</td>
                      <td style={{ fontFamily: "monospace" }}>
                        {entry ? `${entry.trigger_type} ${entry.trigger_price}` : "--"}
                      </td>
                      <td>
                        <span style={{
                          padding: "2px 8px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700,
                          background: "rgba(156,39,176,0.15)", color: "#ce93d8",
                        }}>
                          {entry?.status || "--"}
                        </span>
                      </td>
                      <td className="time-cell" style={{ fontSize: "0.75rem" }}>
                        {exp ? new Date(exp).toLocaleString("en-IN", { hour12: false, day: "2-digit", month: "short" }) : "--"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {canModifyGtt && (
                            <button
                              type="button"
                              onClick={() => openGttEdit(g)}
                              style={{ ...btnSmall, padding: "2px 8px", fontSize: "0.7rem", background: "rgba(41,98,255,0.15)", color: "#64b5f6", border: "1px solid rgba(41,98,255,0.35)" }}
                            >
                              <Pencil size={12} style={{ verticalAlign: "middle", marginRight: "4px" }} />
                              EDIT
                            </button>
                          )}
                          {canCancelGtt && (
                            <button
                              type="button"
                              onClick={() => cancelGttOrder(g.gtt_order_id)}
                              style={{ ...btnSmall, padding: "2px 8px", fontSize: "0.7rem", background: "rgba(239,83,80,0.15)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.3)" }}
                            >
                              CANCEL
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Order Book */}
      <div className="history-section">
        <div className="section-header">
          <h2><List size={18} style={{ marginRight: "6px" }} />Today's Orders</h2>
          <button onClick={fetchOrders} style={{ ...btnSmall, padding: "4px 10px" }}>
            {orderLoading ? <RefreshCw size={12} className="spinning" /> : "Refresh"}
          </button>
        </div>
        <div className="table-container" style={{ maxHeight: "300px" }}>
          {orders.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px" }}>
              <List size={32} />
              <p>No orders today</p>
            </div>
          ) : (
            <table className="oi-table" style={{ fontSize: "0.82rem" }}>
              <thead>
                <tr><th>Time</th><th>Symbol</th><th>Type</th><th>Qty</th><th>Price</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {orders.map((ord, i) => {
                  const isBuy = ord.transaction_type === "BUY";
                  const canCancel = ord.status === "open" || ord.status === "pending" || ord.status === "trigger pending";
                  return (
                    <tr key={i}>
                      <td className="time-cell">{ord.order_timestamp ? new Date(ord.order_timestamp).toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit" }) : "--"}</td>
                      <td style={{ fontWeight: 600 }}>{ord.trading_symbol || ord.instrument_token}</td>
                      <td style={{ color: isBuy ? "#26a69a" : "#ef5350", fontWeight: 700 }}>
                        {ord.transaction_type} {ord.order_type}
                      </td>
                      <td>{ord.quantity}</td>
                      <td style={{ fontFamily: "monospace" }}>{ord.average_price || ord.price || "--"}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 700,
                          background: ord.status === "complete" ? "rgba(38,166,154,0.15)" : ord.status === "rejected" ? "rgba(239,83,80,0.15)" : "rgba(255,152,0,0.15)",
                          color: ord.status === "complete" ? "#26a69a" : ord.status === "rejected" ? "#ef5350" : "#ff9800",
                        }}>
                          {ord.status?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {canCancel && (
                          <button onClick={() => cancelOrder(ord.order_id)} style={{ ...btnSmall, padding: "2px 8px", fontSize: "0.7rem", background: "rgba(239,83,80,0.15)", color: "#ef5350", border: "1px solid rgba(239,83,80,0.3)" }}>
                            CANCEL
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: "1.1rem" }}>
                <AlertTriangle size={18} style={{ color: "#ff9800", marginRight: "8px", verticalAlign: "middle" }} />
                Confirm Order
              </h3>
              <button onClick={() => { setConfirmModal(null); setOrderResult(null); }} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
              <div style={modalRow}>
                <span style={{ color: "#888" }}>Symbol:</span>
                <span style={{ color: "#fff", fontWeight: 700 }}>{confirmModal.option.symbol || confirmModal.option.instrument_key}</span>
              </div>
              <div style={modalRow}>
                <span style={{ color: "#888" }}>Action:</span>
                <span style={{ color: confirmModal.txnType === "BUY" ? "#26a69a" : "#ef5350", fontWeight: 700 }}>
                  {confirmModal.txnType}
                </span>
              </div>
              <div style={modalRow}>
                <span style={{ color: "#888" }}>Quantity:</span>
                <span style={{ color: "#fff", fontWeight: 700 }}>{confirmModal.qty} ({confirmModal.lots} lot{confirmModal.lots > 1 ? "s" : ""})</span>
              </div>
              <div style={modalRow}>
                <span style={{ color: "#888" }}>Order Type:</span>
                <span style={{ color: "#fff" }}>{confirmModal.orderType}</span>
              </div>
              {confirmModal.orderType === "LIMIT" && (
                <div style={modalRow}>
                  <span style={{ color: "#888" }}>Limit Price:</span>
                  <span style={{ color: "#fff", fontWeight: 700 }}>{confirmModal.price.toFixed(2)}</span>
                </div>
              )}
              <div style={modalRow}>
                <span style={{ color: "#888" }}>Product:</span>
                <span style={{ color: "#fff" }}>{confirmModal.product === "I" ? "Intraday (MIS)" : "NRML"}</span>
              </div>
              <div style={modalRow}>
                <span style={{ color: "#888" }}>Est. Value:</span>
                <span style={{ color: "#ff9800", fontWeight: 700 }}>
                  {(confirmModal.qty * (
                    confirmModal.orderType === "LIMIT" || confirmModal.orderType === "GTT"
                      ? confirmModal.price
                      : confirmModal.option.ltp
                  )).toFixed(2)}
                </span>
              </div>
            </div>

            {orderResult && (
              <div style={{
                padding: "12px 16px", borderRadius: "8px", marginBottom: "12px",
                background: orderResult.success ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)",
                border: `1px solid ${orderResult.success ? "rgba(38,166,154,0.3)" : "rgba(239,83,80,0.3)"}`,
                color: orderResult.success ? "#26a69a" : "#ef5350",
                fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px",
              }}>
                {orderResult.success ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                {orderResult.message}
                {orderResult.orderId && <span style={{ color: "#888", marginLeft: "auto", fontSize: "0.75rem" }}>ID: {orderResult.orderId}</span>}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => { setConfirmModal(null); setOrderResult(null); }} style={{
                flex: 1, padding: "12px", borderRadius: "8px", cursor: "pointer",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", color: "#888",
                fontSize: "0.9rem", fontWeight: 600,
              }}>Cancel</button>
              {!orderResult?.success && (
                <button onClick={placeOrder} disabled={placing} style={{
                  flex: 1, padding: "12px", borderRadius: "8px", cursor: placing ? "not-allowed" : "pointer",
                  background: confirmModal.txnType === "BUY" ? "rgba(38,166,154,0.2)" : "rgba(239,83,80,0.2)",
                  border: `1px solid ${confirmModal.txnType === "BUY" ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)"}`,
                  color: confirmModal.txnType === "BUY" ? "#26a69a" : "#ef5350",
                  fontSize: "0.9rem", fontWeight: 700,
                }}>
                  {placing ? "Placing..." : `CONFIRM ${confirmModal.txnType}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {gttEditModal && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: "520px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: "1.1rem" }}>
                <Pencil size={18} style={{ color: "#64b5f6", marginRight: "8px", verticalAlign: "middle" }} />
                Modify GTT
              </h3>
              <button type="button" onClick={() => setGttEditModal(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: "#888", fontSize: "0.8rem", marginBottom: "14px", wordBreak: "break-all" }}>
              <span style={{ color: "#aaa" }}>{gttEditModal.gtt_order_id}</span>
              {gttEditModal.entryOpen && (
                <span style={{ display: "block", marginTop: "8px", color: "#ff9800" }}>
                  ENTRY leg is OPEN: quantity cannot be changed; ENTRY trigger type must be IMMEDIATE (Upstox).
                </span>
              )}
            </p>
            <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ color: "#888", fontSize: "0.85rem" }}>Quantity</span>
              <input
                type="number"
                min={1}
                disabled={gttEditModal.entryOpen}
                value={gttEditModal.quantity}
                onChange={(e) => setGttEditModal((prev) => (prev ? { ...prev, quantity: e.target.value } : prev))}
                style={{ ...inputStyle, width: "100px", opacity: gttEditModal.entryOpen ? 0.55 : 1 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "min(50vh, 360px)", overflowY: "auto" }}>
              {gttEditModal.rules.map((r, i) => {
                const entryOptions = r.strategy === "ENTRY"
                  ? (gttEditModal.entryOpen ? ["IMMEDIATE"] : ["ABOVE", "BELOW", "IMMEDIATE"])
                  : ["IMMEDIATE"];
                return (
                  <div
                    key={`${r.strategy}-${i}`}
                    style={{
                      padding: "12px",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ color: "#ce93d8", fontWeight: 700, fontSize: "0.85rem", marginBottom: "10px" }}>{r.strategy}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
                      <div>
                        <span style={{ color: "#888", fontSize: "0.75rem", display: "block", marginBottom: "4px" }}>Trigger type</span>
                        <select
                          value={r.trigger_type}
                          onChange={(e) => updateGttEditRule(i, { trigger_type: e.target.value })}
                          style={{ ...inputStyle, width: "auto", minWidth: "120px" }}
                        >
                          {entryOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span style={{ color: "#888", fontSize: "0.75rem", display: "block", marginBottom: "4px" }}>Trigger price</span>
                        <input
                          type="number"
                          value={r.trigger_price}
                          onChange={(e) => updateGttEditRule(i, { trigger_price: e.target.value })}
                          style={{ ...inputStyle, width: "110px" }}
                        />
                      </div>
                      {r.strategy === "STOPLOSS" && (
                        <div>
                          <span style={{ color: "#888", fontSize: "0.75rem", display: "block", marginBottom: "4px" }}>Trailing gap</span>
                          <input
                            type="number"
                            value={r.trailing_gap}
                            onChange={(e) => updateGttEditRule(i, { trailing_gap: e.target.value })}
                            placeholder="TSL"
                            style={{ ...inputStyle, width: "90px" }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
              <button
                type="button"
                onClick={() => setGttEditModal(null)}
                style={{
                  flex: 1, padding: "12px", borderRadius: "8px", cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", color: "#888",
                  fontSize: "0.9rem", fontWeight: 600,
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={submitGttModify}
                disabled={gttModifySaving}
                style={{
                  flex: 1, padding: "12px", borderRadius: "8px", cursor: gttModifySaving ? "not-allowed" : "pointer",
                  background: "rgba(41,98,255,0.2)", border: "1px solid rgba(41,98,255,0.5)", color: "#64b5f6",
                  fontSize: "0.9rem", fontWeight: 700,
                }}
              >
                {gttModifySaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lastRefresh && (
        <div style={{ textAlign: "center", color: "#555", fontSize: "0.75rem", marginTop: "12px" }}>
          Last updated: {lastRefresh.toLocaleTimeString("en-IN", { hour12: false })}
        </div>
      )}
    </div>
  );
};

const btnSmall = {
  padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
  color: "#ccc", fontSize: "0.8rem", fontWeight: 600,
};

const buyBtn = {
  padding: "5px 14px", borderRadius: "5px", cursor: "pointer",
  background: "rgba(38,166,154,0.15)", border: "1px solid rgba(38,166,154,0.4)",
  color: "#26a69a", fontSize: "0.78rem", fontWeight: 700,
};

const sellBtn = {
  padding: "5px 14px", borderRadius: "5px", cursor: "pointer",
  background: "rgba(239,83,80,0.15)", border: "1px solid rgba(239,83,80,0.4)",
  color: "#ef5350", fontSize: "0.78rem", fontWeight: 700,
};

const inputStyle = {
  width: "80px", padding: "6px 10px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px",
  color: "#fff", fontSize: "0.85rem", outline: "none",
};

const overlayStyle = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center",
  justifyContent: "center", zIndex: 9999,
};

const modalStyle = {
  background: "#1e222d", borderRadius: "12px", padding: "24px",
  maxWidth: "460px", width: "90%", border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};

const modalRow = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
};
