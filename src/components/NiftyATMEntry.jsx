import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../api/client.js";

// ── constants ────────────────────────────────────────────────────────────────
const REFRESH_MS = 10_000; // refresh option chain every 10s

// ── colours ──────────────────────────────────────────────────────────────────
const BG     = "#131722";
const CARD   = "#1a1f2e";
const BORDER = "#2a2e39";
const TEXT   = "#d1d4dc";
const DIM    = "#787b86";
const GREEN  = "#26a69a";
const RED    = "#ef5350";
const BLUE   = "#2962ff";
const YELLOW = "#ffc107";
const PURPLE = "#9c27b0";

function fmt(n, dec = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtOI(n) {
  if (!n) return "—";
  if (n >= 1_00_00_000) return (n / 1_00_00_000).toFixed(2) + " Cr";
  if (n >= 1_00_000)    return (n / 1_00_000).toFixed(2) + " L";
  return n.toLocaleString("en-IN");
}

// ── confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ order, onConfirm, onCancel, loading }) {
  const isBuy  = order.transaction_type === "BUY";
  const color  = isBuy ? GREEN : RED;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        background: CARD, border: `1px solid ${color}55`,
        borderRadius: 12, padding: "28px 32px", minWidth: 320, maxWidth: 420,
      }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", marginBottom: 16 }}>
          Confirm Order
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {[
            ["Action",      <span style={{ color, fontWeight: 800 }}>{order.transaction_type}</span>],
            ["Symbol",      <span style={{ fontFamily: "ui-monospace,monospace", color: TEXT }}>{order.symbol}</span>],
            ["Strike",      <span style={{ color: YELLOW, fontWeight: 700 }}>{order.strike} {order.option_type}</span>],
            ["Qty (lots)",  <span style={{ color: TEXT }}>{order.lots} lot{order.lots > 1 ? "s" : ""} × {order.lot_size} = {order.quantity} units</span>],
            ["Order type",  <span style={{ color: TEXT }}>{order.order_type}</span>],
            order.order_type === "LIMIT" && ["Price", <span style={{ color: TEXT }}>₹{fmt(order.price)}</span>],
            ["Product",     <span style={{ color: TEXT }}>{order.product === "I" ? "Intraday (MIS)" : "NRML"}</span>],
          ].filter(Boolean).map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.85rem" }}>
              <span style={{ color: DIM }}>{label}</span>
              {val}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button" onClick={onCancel} disabled={loading}
            style={{
              flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`,
              color: DIM, fontWeight: 600, fontSize: "0.88rem",
            }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={onConfirm} disabled={loading}
            style={{
              flex: 2, padding: "10px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
              background: `${color}22`, border: `1px solid ${color}77`,
              color, fontWeight: 800, fontSize: "0.88rem",
            }}
          >
            {loading ? "Placing…" : `Place ${order.transaction_type}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── OI bar ───────────────────────────────────────────────────────────────────
function OIBar({ oi, maxOI, color }) {
  const pct = maxOI > 0 ? Math.min(100, (oi / maxOI) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

// ── strike row (CE | Strike+PCR | PE) ────────────────────────────────────────
function StrikeRow({ ce, pe, isATM, maxCeOI, maxPeOI, lots, orderType, limitPrice, product, onOrder, spotPrice, strike }) {
  const pcr     = ce?.oi > 0 ? (pe?.oi || 0) / ce.oi : null;
  const ceChPct = ce ? (ce.change / (ce.ltp - ce.change || 1)) * 100 : null;
  const peChPct = pe ? (pe.change / (pe.ltp - pe.change || 1)) * 100 : null;

  const sideStyle = (align) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: align,
    justifyContent: "center",
    gap: 2,
    padding: "10px 10px",
  });

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 110px 1fr",
      borderBottom: `1px solid ${BORDER}`,
      background: isATM ? `${YELLOW}08` : "transparent",
      borderLeft: isATM ? `3px solid ${YELLOW}` : "3px solid transparent",
    }}>
      {/* ── CE side (left, right-aligned) ── */}
      <div style={{ ...sideStyle("flex-end"), borderRight: `1px solid ${BORDER}` }}>
        {ce ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={() => onOrder(ce, "SELL")}
                style={{ padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontSize: "0.68rem", fontWeight: 700, background: `${RED}22`, border: `1px solid ${RED}44`, color: RED }}>
                SELL{lots > 1 ? ` ×${lots}` : ""}
              </button>
              <button type="button" onClick={() => onOrder(ce, "BUY")}
                style={{ padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontSize: "0.68rem", fontWeight: 700, background: `${GREEN}22`, border: `1px solid ${GREEN}44`, color: GREEN }}>
                BUY{lots > 1 ? ` ×${lots}` : ""}
              </button>
            </div>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "1.15rem", fontWeight: 800, color: GREEN }}>
              {fmt(ce.ltp)}
            </div>
            <div style={{ fontSize: "0.72rem", color: ce.change >= 0 ? GREEN : RED, fontWeight: 600 }}>
              {ce.change >= 0 ? "+" : ""}{fmt(ce.change)} ({ceChPct != null ? (ceChPct >= 0 ? "+" : "") + ceChPct.toFixed(2) : "—"}%)
            </div>
            <div style={{ fontSize: "0.67rem", color: DIM }}>{fmtOI(ce.oi)}</div>
            <OIBar oi={ce.oi} maxOI={maxCeOI} color={GREEN} />
          </>
        ) : <span style={{ color: DIM, fontSize: "0.75rem" }}>—</span>}
      </div>

      {/* ── Center: Strike + PCR ── */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "10px 6px", gap: 3,
        background: isATM ? `${YELLOW}0d` : "transparent",
      }}>
        <div style={{
          fontFamily: "ui-monospace,monospace",
          fontWeight: isATM ? 800 : 700,
          fontSize: isATM ? "1rem" : "0.92rem",
          color: isATM ? YELLOW : TEXT,
        }}>
          {strike}
        </div>
        {isATM && (
          <span style={{ fontSize: "0.58rem", fontWeight: 700, color: YELLOW, background: `${YELLOW}22`, borderRadius: 3, padding: "1px 5px", letterSpacing: "0.05em" }}>ATM</span>
        )}
        {pcr != null && (
          <div style={{ fontSize: "0.67rem", color: DIM, marginTop: 1 }}>
            PCR: <span style={{ color: pcr > 1 ? GREEN : pcr < 0.7 ? RED : TEXT, fontWeight: 600 }}>{pcr.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* ── PE side (right, left-aligned) ── */}
      <div style={{ ...sideStyle("flex-start"), borderLeft: `1px solid ${BORDER}` }}>
        {pe ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={() => onOrder(pe, "BUY")}
                style={{ padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontSize: "0.68rem", fontWeight: 700, background: `${GREEN}22`, border: `1px solid ${GREEN}44`, color: GREEN }}>
                BUY{lots > 1 ? ` ×${lots}` : ""}
              </button>
              <button type="button" onClick={() => onOrder(pe, "SELL")}
                style={{ padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontSize: "0.68rem", fontWeight: 700, background: `${RED}22`, border: `1px solid ${RED}44`, color: RED }}>
                SELL{lots > 1 ? ` ×${lots}` : ""}
              </button>
            </div>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "1.15rem", fontWeight: 800, color: RED }}>
              {fmt(pe.ltp)}
            </div>
            <div style={{ fontSize: "0.72rem", color: pe.change >= 0 ? GREEN : RED, fontWeight: 600 }}>
              {pe.change >= 0 ? "+" : ""}{fmt(pe.change)} ({peChPct != null ? (peChPct >= 0 ? "+" : "") + peChPct.toFixed(2) : "—"}%)
            </div>
            <div style={{ fontSize: "0.67rem", color: DIM }}>{fmtOI(pe.oi)}</div>
            <OIBar oi={pe.oi} maxOI={maxPeOI} color={RED} />
          </>
        ) : <span style={{ color: DIM, fontSize: "0.75rem" }}>—</span>}
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export function NiftyATMEntry({ accessToken }) {
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [chainData, setChainData]     = useState(null); // { spot_price, atm_strike, expiry_date, options }
  const [lastRefresh, setLastRefresh] = useState(null);

  // order controls
  const [lots, setLots]               = useState(1);
  const [orderType, setOrderType]     = useState("MARKET");
  const [limitPrice, setLimitPrice]   = useState("");
  const [product, setProduct]         = useState("I"); // I = intraday MIS
  const [strikeRange, setStrikeRange] = useState(200); // how many points from ATM to show (100/150/200/all)

  // confirm modal
  const [pendingOrder, setPendingOrder] = useState(null);
  const [placing, setPlacing]           = useState(false);
  const [orderResult, setOrderResult]   = useState(null); // { success, message, order_id }

  const timerRef = useRef(null);

  // ── fetch option chain ───────────────────────────────────────────────────
  async function fetchChain() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await apiFetch("/api/atm-options", { accessToken });
      const json = await res.json();
      if (!res.ok || json.status === "error") throw new Error(json.error || `HTTP ${res.status}`);
      setChainData(json.data);
      setLastRefresh(new Date().toLocaleTimeString("en-IN"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    fetchChain();
    timerRef.current = setInterval(fetchChain, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [accessToken]);

  // ── initiate order (show confirm modal) ─────────────────────────────────
  function initiateOrder(opt, side) {
    const resolvedLotSize = opt.lot_size || 75;
    const quantity = lots * resolvedLotSize;
    setPendingOrder({
      instrument_key: opt.instrument_key,
      symbol: opt.symbol,
      strike: opt.strike,
      option_type: opt.type,
      transaction_type: side,
      order_type: orderType,
      price: orderType === "LIMIT" ? parseFloat(limitPrice) || opt.ltp : 0,
      quantity,
      lots,
      lot_size: resolvedLotSize,
      product,
    });
    setOrderResult(null);
  }

  // ── place order (called after confirm) ───────────────────────────────────
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
        disclosed_quantity: 0,
        trigger_price: 0,
        is_amo: false,
        ...(pendingOrder.order_type === "LIMIT" ? { price: pendingOrder.price } : { price: 0 }),
      };

      const res  = await apiFetch("/api/order/place", {
        accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (res.ok && (json.status === "success" || json.data?.order_id)) {
        setOrderResult({
          success: true,
          message: `Order placed — ID: ${json.data?.order_id || "—"}`,
          side: pendingOrder.transaction_type,
        });
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
  const { spot_price, atm_strike, expiry_date, options = [] } = chainData ?? {};
  const lotSize = options[0]?.lot_size || 75;

  return (
    <div style={{
      background: BG, minHeight: "100%", padding: "20px 16px 40px",
      boxSizing: "border-box", fontFamily: "'Inter','Segoe UI',sans-serif", color: TEXT,
    }}>

      {/* ── header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: `${GREEN}22`, border: `1px solid ${GREEN}55`,
            borderRadius: 6, padding: "2px 10px", fontSize: "0.7rem",
            fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            Entry
          </span>
          Nifty 50 ATM Option Entry
        </h2>
        <p style={{ margin: "5px 0 0", fontSize: "0.78rem", color: DIM }}>
          One-click BUY / SELL on ATM and near-strike Nifty options.
        </p>
      </div>

      {/* ── market info bar ─────────────────────────────────────────────── */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: "12px 18px", marginBottom: 14,
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18,
      }}>
        <div>
          <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Nifty Fut LTP</div>
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>
            {spot_price ? fmt(spot_price) : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>ATM Strike</div>
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "1.2rem", fontWeight: 800, color: YELLOW }}>
            {atm_strike ?? "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Expiry</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: TEXT }}>
            {expiry_date ?? "—"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefresh && <span style={{ fontSize: "0.7rem", color: DIM }}>Updated {lastRefresh}</span>}
          <button
            type="button" onClick={fetchChain} disabled={loading}
            style={{
              padding: "5px 12px", background: loading ? "rgba(255,255,255,0.04)" : `${BLUE}22`,
              border: `1px solid ${BLUE}44`, borderRadius: 6, color: BLUE,
              fontSize: "0.75rem", fontWeight: 700, cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── order controls ───────────────────────────────────────────────── */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: "14px 18px", marginBottom: 14,
        display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end",
      }}>
        {/* lots */}
        <div>
          <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Lots</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button type="button" onClick={() => setLots(l => Math.max(1, l - 1))}
              style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.06)", color: TEXT, cursor: "pointer", fontSize: "1rem" }}>−</button>
            <input
              type="number" min={1} value={lots}
              onChange={e => setLots(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 48, textAlign: "center", background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 5, color: TEXT, padding: "5px", fontFamily: "ui-monospace,monospace", fontSize: "0.9rem" }}
            />
            <button type="button" onClick={() => setLots(l => l + 1)}
              style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.06)", color: TEXT, cursor: "pointer", fontSize: "1rem" }}>+</button>
          </div>
          <div style={{ fontSize: "0.67rem", color: DIM, marginTop: 3 }}>= {lots * lotSize} units</div>
        </div>

        {/* order type */}
        <div>
          <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Order Type</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["MARKET", "LIMIT"].map(t => (
              <button key={t} type="button" onClick={() => setOrderType(t)}
                style={{
                  padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: "0.78rem", fontWeight: 700,
                  background: orderType === t ? `${BLUE}33` : "rgba(255,255,255,0.05)",
                  border: `1px solid ${orderType === t ? BLUE : BORDER}`,
                  color: orderType === t ? BLUE : DIM,
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* limit price */}
        {orderType === "LIMIT" && (
          <div>
            <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Limit Price</div>
            <input
              type="number" step="0.05" placeholder="0.00" value={limitPrice}
              onChange={e => setLimitPrice(e.target.value)}
              style={{ width: 100, background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 5, color: TEXT, padding: "6px 8px", fontFamily: "ui-monospace,monospace", fontSize: "0.9rem" }}
            />
          </div>
        )}

        {/* product */}
        <div>
          <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Product</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["I", "Intraday"], ["D", "NRML"]].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setProduct(val)}
                style={{
                  padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: "0.78rem", fontWeight: 700,
                  background: product === val ? `${PURPLE}33` : "rgba(255,255,255,0.05)",
                  border: `1px solid ${product === val ? PURPLE : BORDER}`,
                  color: product === val ? PURPLE : DIM,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* strike range */}
        <div>
          <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Show Strikes</div>
          <select
            value={strikeRange}
            onChange={e => setStrikeRange(Number(e.target.value))}
            style={{
              background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 5,
              color: TEXT, padding: "6px 10px", fontSize: "0.8rem", cursor: "pointer",
            }}
          >
            <option value={50}>ATM ±1 (50 pts)</option>
            <option value={100}>ATM ±2 (100 pts)</option>
            <option value={150}>ATM ±3 (150 pts)</option>
            <option value={200}>ATM ±4 (200 pts)</option>
            <option value={9999}>All</option>
          </select>
        </div>
      </div>

      {/* ── order result toast ───────────────────────────────────────────── */}
      {orderResult && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 14, fontSize: "0.83rem", fontWeight: 600,
          background: orderResult.success ? `${GREEN}18` : `${RED}18`,
          border: `1px solid ${orderResult.success ? GREEN : RED}55`,
          color: orderResult.success ? GREEN : RED,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>{orderResult.success ? "✓" : "✗"} {orderResult.message}</span>
          <button type="button" onClick={() => setOrderResult(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── error ───────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 14, fontSize: "0.83rem", background: `${RED}12`, border: `1px solid ${RED}44`, color: RED }}>
          {error}
        </div>
      )}

      {/* ── option chain table ───────────────────────────────────────────── */}
      {options.length > 0 ? (() => {
        // Group by strike, filtered by user's range selection
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
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 110px 1fr",
              borderBottom: `2px solid ${BORDER}`,
              background: "rgba(255,255,255,0.03)",
            }}>
              <div style={{ padding: "8px 10px", textAlign: "right", fontSize: "0.7rem", fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                CALL (CE)
              </div>
              <div style={{ padding: "8px 6px", textAlign: "center", fontSize: "0.7rem", fontWeight: 700, color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Strike
              </div>
              <div style={{ padding: "8px 10px", textAlign: "left", fontSize: "0.7rem", fontWeight: 700, color: RED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                PUT (PE)
              </div>
            </div>

            {/* spot line + strike rows */}
            {strikes.map((strike, i) => {
              const prev = strikes[i - 1];
              const showSpot = spot_price != null && prev != null && prev < spot_price && spot_price <= strike;
              return (
                <div key={strike}>
                  {showSpot && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "4px 14px", background: `${YELLOW}10`,
                      borderTop: `1px dashed ${YELLOW}55`, borderBottom: `1px dashed ${YELLOW}55`,
                      fontSize: "0.72rem", fontWeight: 700, color: YELLOW,
                    }}>
                      <span>▲ Spot</span>
                      <span style={{ fontFamily: "ui-monospace,monospace" }}>{fmt(spot_price)}</span>
                    </div>
                  )}
                  <StrikeRow
                    strike={strike}
                    ce={byStrike[strike]?.CE}
                    pe={byStrike[strike]?.PE}
                    isATM={strike === atm_strike}
                    maxCeOI={maxCeOI}
                    maxPeOI={maxPeOI}
                    lots={lots}
                    orderType={orderType}
                    limitPrice={limitPrice}
                    product={product}
                    onOrder={initiateOrder}
                    spotPrice={spot_price}
                  />
                </div>
              );
            })}
          </div>
        );
      })() : !loading && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "32px", textAlign: "center", color: DIM, fontSize: "0.85rem" }}>
          No option data. Click Refresh.
        </div>
      )}

      {/* ── confirm modal ────────────────────────────────────────────────── */}
      {pendingOrder && (
        <ConfirmModal
          order={pendingOrder}
          onConfirm={placeOrder}
          onCancel={() => setPendingOrder(null)}
          loading={placing}
        />
      )}
    </div>
  );
}
