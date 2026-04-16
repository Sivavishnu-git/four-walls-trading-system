import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../api/client.js";
import { useLiveWS } from "../hooks/useLiveWS.js";

// ── palette ──────────────────────────────────────────────────────────────────
const BG     = "#131722";
const CARD   = "#1a1f2e";
const BORDER = "#2a2e39";
const TEXT   = "#d1d4dc";
const DIM    = "#787b86";
const GREEN  = "#26a69a";
const RED    = "#ef5350";
const YELLOW = "#ffc107";
const PURPLE = "#9c27b0";
const ORANGE = "#ff9800";

function fmt(n, dec = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  });
}

function fmtOI(n) {
  if (!n) return "—";
  if (n >= 1_00_00_000) return (n / 1_00_00_000).toFixed(2) + " Cr";
  if (n >= 1_00_000)    return (n / 1_00_000).toFixed(2) + " L";
  return n.toLocaleString("en-IN");
}

// ── OI bar ───────────────────────────────────────────────────────────────────
function OIBar({ oi, maxOI, color }) {
  const pct = maxOI > 0 ? Math.min(100, (oi / maxOI) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s" }} />
    </div>
  );
}

// ── confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ order, onConfirm, onCancel, loading }) {
  const isBuy = order.transaction_type === "BUY";
  const color = isBuy ? GREEN : RED;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: CARD, border: `1px solid ${color}55`, borderRadius: 12, padding: "26px 30px", minWidth: 300, maxWidth: 400 }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", marginBottom: 14 }}>Confirm Order</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18 }}>
          {[
            ["Action",     <span style={{ color, fontWeight: 800 }}>{order.transaction_type}</span>],
            ["Symbol",     <span style={{ fontFamily: "ui-monospace,monospace", color: TEXT }}>{order.symbol}</span>],
            ["Strike",     <span style={{ color: YELLOW, fontWeight: 700 }}>{order.strike} {order.option_type}</span>],
            ["Qty (lots)", <span style={{ color: TEXT }}>{order.lots} lot{order.lots > 1 ? "s" : ""} × {order.lot_size} = {order.quantity} units</span>],
            ["Order type", <span style={{ color: TEXT }}>{order.order_type}</span>],
            order.order_type === "LIMIT" && ["Price", <span style={{ color: TEXT }}>₹{fmt(order.price)}</span>],
            ["Product",    <span style={{ color: TEXT }}>{order.product === "I" ? "Intraday (MIS)" : "NRML"}</span>],
          ].filter(Boolean).map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.84rem" }}>
              <span style={{ color: DIM }}>{label}</span>{val}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} disabled={loading}
            style={{ flex: 1, padding: "9px", borderRadius: 7, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: DIM, fontWeight: 600, fontSize: "0.85rem" }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={loading}
            style={{ flex: 2, padding: "9px", borderRadius: 7, cursor: loading ? "wait" : "pointer", background: `${color}22`, border: `1px solid ${color}77`, color, fontWeight: 800, fontSize: "0.85rem" }}>
            {loading ? "Placing…" : `Place ${order.transaction_type}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── strike row ───────────────────────────────────────────────────────────────
function StrikeRow({ strike, ce, pe, isATM, atmStrike, maxCeOI, maxPeOI, lots, orderType, limitPrice, product, onOrder, spotPrice }) {
  const pcr     = ce?.oi > 0 ? (pe?.oi || 0) / ce.oi : null;
  const steps   = atmStrike ? Math.round((strike - atmStrike) / 100) : 0;
  const ceLabel = steps === 0 ? null : steps > 0 ? `OTM${steps}` : `ITM${Math.abs(steps)}`;
  const peLabel = steps === 0 ? null : steps > 0 ? `ITM${steps}` : `OTM${Math.abs(steps)}`;
  const ceLabelColor = steps > 0 ? RED : GREEN;
  const peLabelColor = steps > 0 ? GREEN : RED;

  const ceChPct = ce?.change != null ? (ce.change / Math.max(0.01, ce.ltp - ce.change)) * 100 : null;
  const peChPct = pe?.change != null ? (pe.change / Math.max(0.01, pe.ltp - pe.change)) * 100 : null;

  const side = (align) => ({
    display: "flex", flexDirection: "column", alignItems: align,
    justifyContent: "center", gap: 1, padding: "5px 8px",
  });

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 96px 1fr",
      borderBottom: `1px solid ${BORDER}`,
      background: isATM ? `${YELLOW}08` : "transparent",
      borderLeft: isATM ? `3px solid ${YELLOW}` : "3px solid transparent",
    }}>
      {/* CE side */}
      <div style={{ ...side("flex-end"), borderRight: `1px solid ${BORDER}` }}>
        {ce ? (
          <>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "0.95rem", fontWeight: 800, color: GREEN }}>{fmt(ce.ltp)}</div>
            <div style={{ fontSize: "0.65rem", color: (ce.change ?? 0) >= 0 ? GREEN : RED, fontWeight: 600 }}>
              {(ce.change ?? 0) >= 0 ? "+" : ""}{fmt(ce.change)} ({ceChPct != null ? (ceChPct >= 0 ? "+" : "") + ceChPct.toFixed(1) : "—"}%)
            </div>
            <div style={{ fontSize: "0.61rem", color: DIM }}>{fmtOI(ce.oi)}</div>
            <OIBar oi={ce.oi || 0} maxOI={maxCeOI} color={GREEN} />
            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
              <button type="button" onClick={() => onOrder(ce, "SELL")}
                style={{ padding: "2px 6px", borderRadius: 3, cursor: "pointer", fontSize: "0.61rem", fontWeight: 700, background: `${RED}22`, border: `1px solid ${RED}44`, color: RED }}>
                S{lots > 1 ? `×${lots}` : ""}
              </button>
              <button type="button" onClick={() => onOrder(ce, "BUY")}
                style={{ padding: "2px 6px", borderRadius: 3, cursor: "pointer", fontSize: "0.61rem", fontWeight: 700, background: `${GREEN}22`, border: `1px solid ${GREEN}44`, color: GREEN }}>
                B{lots > 1 ? `×${lots}` : ""}
              </button>
            </div>
          </>
        ) : <span style={{ color: DIM, fontSize: "0.7rem" }}>—</span>}
      </div>

      {/* Center */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "5px 4px", gap: 1, background: isATM ? `${YELLOW}0d` : "transparent",
      }}>
        <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: isATM ? 800 : 600, fontSize: isATM ? "0.88rem" : "0.82rem", color: isATM ? YELLOW : TEXT }}>{strike}</div>
        {isATM ? (
          <span style={{ fontSize: "0.55rem", fontWeight: 700, color: YELLOW, background: `${YELLOW}22`, borderRadius: 3, padding: "1px 4px" }}>ATM</span>
        ) : (
          <div style={{ display: "flex", gap: 2 }}>
            <span style={{ fontSize: "0.54rem", fontWeight: 700, color: ceLabelColor, background: `${ceLabelColor}15`, borderRadius: 3, padding: "1px 3px" }}>C:{ceLabel}</span>
            <span style={{ fontSize: "0.54rem", fontWeight: 700, color: peLabelColor, background: `${peLabelColor}15`, borderRadius: 3, padding: "1px 3px" }}>P:{peLabel}</span>
          </div>
        )}
        {pcr != null && (
          <div style={{ fontSize: "0.6rem", color: DIM }}>
            PCR:<span style={{ color: pcr > 1 ? GREEN : pcr < 0.7 ? RED : TEXT, fontWeight: 600 }}>{pcr.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* PE side */}
      <div style={{ ...side("flex-start"), borderLeft: `1px solid ${BORDER}` }}>
        {pe ? (
          <>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "0.95rem", fontWeight: 800, color: RED }}>{fmt(pe.ltp)}</div>
            <div style={{ fontSize: "0.65rem", color: (pe.change ?? 0) >= 0 ? GREEN : RED, fontWeight: 600 }}>
              {(pe.change ?? 0) >= 0 ? "+" : ""}{fmt(pe.change)} ({peChPct != null ? (peChPct >= 0 ? "+" : "") + peChPct.toFixed(1) : "—"}%)
            </div>
            <div style={{ fontSize: "0.61rem", color: DIM }}>{fmtOI(pe.oi)}</div>
            <OIBar oi={pe.oi || 0} maxOI={maxPeOI} color={RED} />
            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
              <button type="button" onClick={() => onOrder(pe, "BUY")}
                style={{ padding: "2px 6px", borderRadius: 3, cursor: "pointer", fontSize: "0.61rem", fontWeight: 700, background: `${GREEN}22`, border: `1px solid ${GREEN}44`, color: GREEN }}>
                B{lots > 1 ? `×${lots}` : ""}
              </button>
              <button type="button" onClick={() => onOrder(pe, "SELL")}
                style={{ padding: "2px 6px", borderRadius: 3, cursor: "pointer", fontSize: "0.61rem", fontWeight: 700, background: `${RED}22`, border: `1px solid ${RED}44`, color: RED }}>
                S{lots > 1 ? `×${lots}` : ""}
              </button>
            </div>
          </>
        ) : <span style={{ color: DIM, fontSize: "0.7rem" }}>—</span>}
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export function SensexOptionChain({ accessToken }) {
  const [meta, setMeta]           = useState(null);  // { spot_price, atm_strike, expiry_date, options, instrument_keys }
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // order controls
  const [lots, setLots]             = useState(1);
  const [orderType, setOrderType]   = useState("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [product, setProduct]       = useState("I");
  const [strikeRange, setStrikeRange] = useState(500); // ±500 = 10 strikes each side

  // confirm modal
  const [pendingOrder, setPendingOrder] = useState(null);
  const [placing, setPlacing]           = useState(false);
  const [orderResult, setOrderResult]   = useState(null);

  const metaTimerRef = useRef(null);

  // WebSocket live quotes (keyed by instrument_key)
  const { data: wsData, status: wsStatus } = useLiveWS(
    meta?.instrument_keys || [],
    accessToken,
  );

  // ── fetch metadata (initial quotes + instrument keys) ────────────────────
  async function fetchMeta() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await apiFetch("/api/sensex-options", { accessToken });
      const json = await res.json();
      if (!res.ok || json.status === "error") throw new Error(json.error || `HTTP ${res.status}`);
      setMeta(json.data);
      setLastRefresh(new Date().toLocaleTimeString("en-IN"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    fetchMeta();
    // Refresh metadata (ATM recalculation) every 60 s
    metaTimerRef.current = setInterval(fetchMeta, 60_000);
    return () => clearInterval(metaTimerRef.current);
  }, [accessToken]);

  // ── merge initial REST options with live WS quotes ───────────────────────
  const options = (meta?.options || []).map((opt) => {
    const live = wsData[opt.instrument_key];
    if (!live) return opt;
    return { ...opt, ltp: live.ltp, oi: live.oi, change: live.change, volume: live.volume };
  });

  // ── order flow ───────────────────────────────────────────────────────────
  function initiateOrder(opt, side) {
    const lotSize = opt.lot_size || 10;
    setPendingOrder({
      instrument_key: opt.instrument_key, symbol: opt.symbol,
      strike: opt.strike, option_type: opt.type,
      transaction_type: side, order_type: orderType,
      price: orderType === "LIMIT" ? parseFloat(limitPrice) || opt.ltp : 0,
      quantity: lots * lotSize, lots, lot_size: lotSize, product,
    });
    setOrderResult(null);
  }

  async function placeOrder() {
    if (!pendingOrder) return;
    setPlacing(true);
    try {
      const body = {
        instrument_token: pendingOrder.instrument_key,
        quantity: pendingOrder.quantity,
        product: pendingOrder.product,
        validity: "DAY",
        order_type: pendingOrder.order_type,
        transaction_type: pendingOrder.transaction_type,
        disclosed_quantity: 0, trigger_price: 0, is_amo: false,
        price: pendingOrder.order_type === "LIMIT" ? pendingOrder.price : 0,
      };
      const res  = await apiFetch("/api/order/place", {
        accessToken, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && (json.status === "success" || json.data?.order_id)) {
        setOrderResult({ success: true, message: `Order placed — ID: ${json.data?.order_id || "—"}`, side: pendingOrder.transaction_type });
      } else {
        const reason = json.errors?.[0]?.message || json.message || json.error || "Order rejected";
        setOrderResult({ success: false, message: reason, side: pendingOrder.transaction_type });
      }
    } catch (e) {
      setOrderResult({ success: false, message: e.message, side: pendingOrder?.transaction_type });
    } finally {
      setPlacing(false);
      setPendingOrder(null);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  const { spot_price, atm_strike, expiry_date } = meta ?? {};
  const lotSize = options[0]?.lot_size || 10;

  const wsStatusColor = wsStatus === "connected" ? GREEN : wsStatus === "connecting" ? ORANGE : RED;

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "10px 12px 24px", boxSizing: "border-box", fontFamily: "'Inter','Segoe UI',sans-serif", color: TEXT }}>

      {/* ── header ── */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: `${ORANGE}22`, border: `1px solid ${ORANGE}55`, borderRadius: 6, padding: "2px 10px", fontSize: "0.7rem", fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Live
          </span>
          Sensex Option Chain
          {/* WS status dot */}
          <span title={`WebSocket: ${wsStatus}`} style={{ width: 8, height: 8, borderRadius: "50%", background: wsStatusColor, display: "inline-block", marginLeft: 4 }} />
          <span style={{ fontSize: "0.68rem", color: wsStatusColor, fontWeight: 600 }}>{wsStatus}</span>
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: DIM }}>
          Live prices via WebSocket · 1.5 s refresh · BSE Sensex options
        </p>
      </div>

      {/* ── market info bar ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", marginBottom: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: "0.66rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sensex Fut LTP</div>
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "1.15rem", fontWeight: 800, color: "#fff" }}>{spot_price ? fmt(spot_price) : "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.66rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>ATM Strike</div>
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "1.15rem", fontWeight: 800, color: YELLOW }}>{atm_strike ?? "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.66rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Expiry</div>
          <div style={{ fontSize: "0.88rem", fontWeight: 700, color: TEXT }}>{expiry_date ?? "—"}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefresh && <span style={{ fontSize: "0.68rem", color: DIM }}>Meta: {lastRefresh}</span>}
          <button type="button" onClick={fetchMeta} disabled={loading}
            style={{ padding: "4px 10px", background: loading ? "rgba(255,255,255,0.04)" : `${ORANGE}22`, border: `1px solid ${ORANGE}44`, borderRadius: 6, color: ORANGE, fontSize: "0.73rem", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── order controls ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        {/* lots */}
        <div>
          <div style={{ fontSize: "0.66rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Lots</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button type="button" onClick={() => setLots(l => Math.max(1, l - 1))} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.06)", color: TEXT, cursor: "pointer" }}>−</button>
            <input type="number" min={1} value={lots} onChange={e => setLots(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 44, textAlign: "center", background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 5, color: TEXT, padding: "4px", fontFamily: "ui-monospace,monospace", fontSize: "0.88rem" }} />
            <button type="button" onClick={() => setLots(l => l + 1)} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.06)", color: TEXT, cursor: "pointer" }}>+</button>
          </div>
          <div style={{ fontSize: "0.64rem", color: DIM, marginTop: 2 }}>= {lots * lotSize} units</div>
        </div>

        {/* order type */}
        <div>
          <div style={{ fontSize: "0.66rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Order Type</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["MARKET", "LIMIT"].map(t => (
              <button key={t} type="button" onClick={() => setOrderType(t)}
                style={{ padding: "4px 10px", borderRadius: 5, cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, background: orderType === t ? `${ORANGE}33` : "rgba(255,255,255,0.05)", border: `1px solid ${orderType === t ? ORANGE : BORDER}`, color: orderType === t ? ORANGE : DIM }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {orderType === "LIMIT" && (
          <div>
            <div style={{ fontSize: "0.66rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Limit Price</div>
            <input type="number" step="0.05" placeholder="0.00" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
              style={{ width: 90, background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 5, color: TEXT, padding: "5px 7px", fontFamily: "ui-monospace,monospace", fontSize: "0.88rem" }} />
          </div>
        )}

        {/* product */}
        <div>
          <div style={{ fontSize: "0.66rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Product</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["I", "Intraday"], ["D", "NRML"]].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setProduct(val)}
                style={{ padding: "4px 10px", borderRadius: 5, cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, background: product === val ? `${PURPLE}33` : "rgba(255,255,255,0.05)", border: `1px solid ${product === val ? PURPLE : BORDER}`, color: product === val ? PURPLE : DIM }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* strike range */}
        <div>
          <div style={{ fontSize: "0.66rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Show Strikes</div>
          <select value={strikeRange} onChange={e => setStrikeRange(Number(e.target.value))}
            style={{ background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 5, color: TEXT, padding: "5px 9px", fontSize: "0.78rem", cursor: "pointer" }}>
            <option value={200}>±2 strikes  (5 rows)</option>
            <option value={400}>±4 strikes  (9 rows)</option>
            <option value={600}>±6 strikes  (13 rows)</option>
            <option value={800}>±8 strikes  (17 rows)</option>
            <option value={1000}>±10 strikes (21 rows)</option>
          </select>
        </div>
      </div>

      {/* ── result / error toast ── */}
      {orderResult && (
        <div style={{ padding: "9px 14px", borderRadius: 8, marginBottom: 8, fontSize: "0.82rem", fontWeight: 600, background: orderResult.success ? `${GREEN}18` : `${RED}18`, border: `1px solid ${orderResult.success ? GREEN : RED}55`, color: orderResult.success ? GREEN : RED, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{orderResult.success ? "✓" : "✗"} {orderResult.message}</span>
          <button type="button" onClick={() => setOrderResult(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1rem" }}>×</button>
        </div>
      )}
      {error && (
        <div style={{ padding: "9px 14px", borderRadius: 8, marginBottom: 8, fontSize: "0.82rem", background: `${RED}12`, border: `1px solid ${RED}44`, color: RED }}>{error}</div>
      )}

      {/* ── option chain table ── */}
      {options.length > 0 ? (() => {
        const strikes = [...new Set(options.map(o => o.strike))]
          .filter(s => Math.abs(s - atm_strike) <= strikeRange)
          .sort((a, b) => a - b);
        const byStrike = {};
        for (const o of options) {
          if (!byStrike[o.strike]) byStrike[o.strike] = {};
          byStrike[o.strike][o.type] = o;
        }
        const maxCeOI = Math.max(...options.filter(o => o.type === "CE").map(o => o.oi || 0), 1);
        const maxPeOI = Math.max(...options.filter(o => o.type === "PE").map(o => o.oi || 0), 1);

        return (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            {/* column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 96px 1fr", borderBottom: `2px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}>
              <div style={{ padding: "7px 10px", textAlign: "right", fontSize: "0.68rem", fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.06em" }}>CALL (CE)</div>
              <div style={{ padding: "7px 6px", textAlign: "center", fontSize: "0.68rem", fontWeight: 700, color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>Strike</div>
              <div style={{ padding: "7px 10px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: RED, textTransform: "uppercase", letterSpacing: "0.06em" }}>PUT (PE)</div>
            </div>

            {strikes.map((strike, i) => {
              const prev = strikes[i - 1];
              const showSpot = spot_price != null && prev != null && prev < spot_price && spot_price <= strike;
              return (
                <div key={strike}>
                  {showSpot && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 12px", background: `${YELLOW}10`, borderTop: `1px dashed ${YELLOW}55`, borderBottom: `1px dashed ${YELLOW}55`, fontSize: "0.7rem", fontWeight: 700, color: YELLOW }}>
                      <span>▲ Spot</span>
                      <span style={{ fontFamily: "ui-monospace,monospace" }}>{fmt(spot_price)}</span>
                    </div>
                  )}
                  <StrikeRow
                    strike={strike} atmStrike={atm_strike}
                    ce={byStrike[strike]?.CE} pe={byStrike[strike]?.PE}
                    isATM={strike === atm_strike}
                    maxCeOI={maxCeOI} maxPeOI={maxPeOI}
                    lots={lots} orderType={orderType}
                    limitPrice={limitPrice} product={product}
                    onOrder={initiateOrder} spotPrice={spot_price}
                  />
                </div>
              );
            })}
          </div>
        );
      })() : !loading && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "32px", textAlign: "center", color: DIM, fontSize: "0.84rem" }}>
          No data. Click Refresh or check your connection.
        </div>
      )}

      {pendingOrder && (
        <ConfirmModal order={pendingOrder} onConfirm={placeOrder} onCancel={() => setPendingOrder(null)} loading={placing} />
      )}
    </div>
  );
}
