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

// ── option row ────────────────────────────────────────────────────────────────
function OptionRow({ opt, isATM, lots, lotSize, orderType, limitPrice, product, onOrder }) {
  const isCE   = opt.type === "CE";
  const color  = isCE ? BLUE : RED;
  const change = opt.change;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "90px 70px 70px 70px 80px 90px 90px",
      alignItems: "center",
      gap: 0,
      padding: "10px 14px",
      borderRadius: 7,
      background: isATM ? `${YELLOW}0a` : "transparent",
      border: isATM ? `1px solid ${YELLOW}33` : "1px solid transparent",
      marginBottom: 2,
    }}>
      {/* strike */}
      <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: isATM ? 800 : 600, color: isATM ? YELLOW : TEXT, fontSize: "0.88rem" }}>
        {opt.strike}
        {isATM && <span style={{ marginLeft: 5, fontSize: "0.6rem", color: YELLOW, fontWeight: 700, background: `${YELLOW}22`, borderRadius: 3, padding: "1px 4px" }}>ATM</span>}
      </div>

      {/* type badge */}
      <div>
        <span style={{
          fontSize: "0.72rem", fontWeight: 800, padding: "2px 8px", borderRadius: 4,
          background: `${color}22`, border: `1px solid ${color}55`, color,
        }}>
          {opt.type}
        </span>
      </div>

      {/* LTP */}
      <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: 700, color: TEXT, fontSize: "0.88rem" }}>
        {fmt(opt.ltp)}
      </div>

      {/* change */}
      <div style={{ fontFamily: "ui-monospace,monospace", fontSize: "0.78rem", fontWeight: 600, color: change >= 0 ? GREEN : RED }}>
        {change >= 0 ? "+" : ""}{fmt(change)}
      </div>

      {/* OI */}
      <div style={{ fontSize: "0.78rem", color: DIM, fontFamily: "ui-monospace,monospace" }}>
        {fmtOI(opt.oi)}
      </div>

      {/* BUY button */}
      <button
        type="button"
        onClick={() => onOrder(opt, "BUY")}
        style={{
          padding: "6px 10px", borderRadius: 6, cursor: "pointer",
          background: `${GREEN}22`, border: `1px solid ${GREEN}55`,
          color: GREEN, fontWeight: 800, fontSize: "0.78rem",
        }}
      >
        BUY {lots > 1 ? `×${lots}` : ""}
      </button>

      {/* SELL button */}
      <button
        type="button"
        onClick={() => onOrder(opt, "SELL")}
        style={{
          padding: "6px 10px", borderRadius: 6, cursor: "pointer",
          background: `${RED}22`, border: `1px solid ${RED}55`,
          color: RED, fontWeight: 800, fontSize: "0.78rem",
        }}
      >
        SELL {lots > 1 ? `×${lots}` : ""}
      </button>
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
      {options.length > 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
          {/* header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "90px 70px 70px 70px 80px 90px 90px",
            gap: 0, padding: "8px 14px",
            borderBottom: `1px solid ${BORDER}`,
            background: "rgba(255,255,255,0.03)",
          }}>
            {["Strike", "Type", "LTP", "Change", "OI", "BUY", "SELL"].map(h => (
              <div key={h} style={{ fontSize: "0.67rem", fontWeight: 700, color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {h}
              </div>
            ))}
          </div>

          {/* rows — grouped by strike with OTM/ATM/ITM section labels */}
          <div style={{ padding: "8px 8px" }}>
            {(() => {
              // Unique strikes ascending
              const strikes = [...new Set(options.map(o => o.strike))].sort((a, b) => a - b);
              const rows = [];
              let lastSection = null;

              for (const strike of strikes) {
                // Section label per strike
                const diff = strike - atm_strike;
                let section;
                if (diff === 0) section = "ATM";
                else if (diff > 0) section = diff <= 100 ? "Near ATM" : "OTM (CE side)";
                else section = diff >= -100 ? "Near ATM" : "OTM (PE side)";

                if (section !== lastSection) {
                  lastSection = section;
                  const sectionColor =
                    section === "ATM" ? YELLOW :
                    section.startsWith("OTM") ? RED :
                    DIM;
                  rows.push(
                    <div key={`sec-${strike}`} style={{
                      padding: "4px 14px 2px",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      color: sectionColor,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      borderTop: lastSection === null ? "none" : `1px solid ${BORDER}`,
                      marginTop: lastSection === null ? 0 : 4,
                      paddingTop: 8,
                    }}>
                      {section}
                    </div>
                  );
                }

                const strikeOpts = options.filter(o => o.strike === strike);
                // CE first, then PE
                strikeOpts.sort((a, b) => a.type === "CE" ? -1 : 1);
                for (const opt of strikeOpts) {
                  rows.push(
                    <OptionRow
                      key={opt.instrument_key}
                      opt={opt}
                      isATM={opt.strike === atm_strike}
                      lots={lots}
                      lotSize={opt.lot_size || 75}
                      orderType={orderType}
                      limitPrice={limitPrice}
                      product={product}
                      onOrder={initiateOrder}
                    />
                  );
                }
              }
              return rows;
            })()}
          </div>
        </div>
      ) : !loading && (
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
