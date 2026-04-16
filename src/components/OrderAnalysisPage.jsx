import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client.js";

// ── helpers ──────────────────────────────────────────────────────────────────
const n = (v) => Number(v || 0);

function inr(v, showSign = false) {
  const num = Number(v || 0);
  const abs = Math.abs(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = showSign ? (num >= 0 ? "+" : "−") : num < 0 ? "−" : "";
  return `${sign}₹${abs}`;
}

function pct(v) {
  const num = Number(v || 0);
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
}

/**
 * Estimate Upstox F&O charges for a given set of positions and filled orders.
 * Rates (NSE options, Upstox, as of 2025):
 *   Brokerage        ₹20 flat per executed order
 *   STT              0.0625% on sell-side premium value
 *   Exch charges     0.053% on total premium turnover (buy+sell)
 *   SEBI charges     ₹10 per crore of total turnover
 *   GST              18% on (brokerage + exchange + SEBI)
 *   Stamp duty       0.003% on buy-side value
 */
function estimateCharges(positions, filledOrderCount) {
  let buyVal = 0, sellVal = 0;
  for (const p of positions) {
    buyVal  += n(p.day_buy_value  || p.buy_value);
    sellVal += n(p.day_sell_value || p.sell_value);
  }
  const turnover     = buyVal + sellVal;
  const brokerage    = filledOrderCount * 20;
  const stt          = sellVal * 0.000625;           // 0.0625% on sell side
  const exchCharges  = turnover * 0.00053;           // 0.053% on total premium
  const sebi         = turnover * 0.000001;          // ₹10 per crore
  const gst          = (brokerage + exchCharges + sebi) * 0.18;
  const stampDuty    = buyVal * 0.00003;             // 0.003% on buy side
  const total        = brokerage + stt + exchCharges + sebi + gst + stampDuty;
  return { brokerage, stt, exchCharges, sebi, gst, stampDuty, total, buyVal, sellVal, turnover };
}

// ── colour tokens ─────────────────────────────────────────────────────────────
const BG     = "#131722";
const CARD   = "#1a1f2e";
const BORDER = "#2a2e39";
const TEXT   = "#d1d4dc";
const DIM    = "#787b86";
const GREEN  = "#26a69a";
const RED    = "#ef5350";
const YELLOW = "#ffc107";
const BLUE   = "#2962ff";

const up   = (v) => ({ color: n(v) >= 0 ? GREEN : RED });
const pill = (v, label) => (
  <span style={{ fontSize: "0.62rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: n(v) >= 0 ? `${GREEN}22` : `${RED}22`, border: `1px solid ${n(v) >= 0 ? GREEN : RED}44`, color: n(v) >= 0 ? GREEN : RED }}>
    {label}
  </span>
);

// ── stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, valueColor, accent }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${accent || BORDER}`, borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: "0.67rem", fontWeight: 600, color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: "1.2rem", fontWeight: 800, color: valueColor || TEXT, fontFamily: "ui-monospace,monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.7rem", color: DIM }}>{sub}</div>}
    </div>
  );
}

// ── section title ─────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: DIM, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` }}>{title}</div>
      {children}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export function OrderAnalysisPage({ accessToken }) {
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [orders, setOrders]       = useState([]);
  const [positions, setPositions] = useState([]);
  const [asOf, setAsOf]           = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [oRes, pRes] = await Promise.all([
        apiFetch("/api/order/today",         { accessToken }),
        apiFetch("/api/portfolio/positions", { accessToken }),
      ]);
      const oJson = await oRes.json().catch(() => ({}));
      const pJson = await pRes.json().catch(() => ({}));
      if (!oRes.ok) throw new Error(oJson?.error || "Failed to load orders");
      if (!pRes.ok) throw new Error(pJson?.error || "Failed to load positions");
      const orderRows = Array.isArray(oJson?.data?.orders) ? oJson.data.orders
                      : Array.isArray(oJson?.data) ? oJson.data : [];
      const posRows   = Array.isArray(pJson?.data) ? pJson.data : [];
      setOrders(orderRows);
      setPositions(posRows);
      setAsOf(new Date().toLocaleTimeString("en-IN", { hour12: true }));
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  // ── compute metrics ────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const filled = orders.filter(
      (o) => String(o.status || "").toLowerCase() === "complete" || n(o.filled_quantity) > 0
    );

    // P&L from positions (Upstox calculates this natively)
    const realized   = positions.reduce((s, p) => s + n(p.pnl || p.realised || p.realized || 0), 0);
    const unrealized = positions.reduce((s, p) => s + n(p.unrealised || p.unrealized || p.unrealised_pnl || 0), 0);
    const grossPnl   = realized + unrealized;

    const charges    = estimateCharges(positions, filled.length);
    const netPnl     = grossPnl - charges.total;

    // Per-position P&L rows
    const posRows = positions.map((p) => {
      const buyQty  = n(p.day_buy_quantity  || p.buy_quantity);
      const sellQty = n(p.day_sell_quantity || p.sell_quantity);
      const buyVal  = n(p.day_buy_value     || p.buy_value);
      const sellVal = n(p.day_sell_value    || p.sell_value);
      const buyAvg  = buyQty  > 0 ? buyVal  / buyQty  : 0;
      const sellAvg = sellQty > 0 ? sellVal / sellQty : 0;
      const gross   = n(p.pnl || p.realised || p.realized || 0) + n(p.unrealised || p.unrealized || 0);

      // Estimate per-position charges proportional to its turnover share
      const posTurnover  = buyVal + sellVal;
      const chargeShare  = charges.turnover > 0 ? posTurnover / charges.turnover : 0;
      const posCharges   = charges.total * chargeShare;

      return {
        symbol:   p.trading_symbol || p.instrument_token || "—",
        exchange: (p.exchange || "").replace("_FO", "").replace("_EQ", ""),
        product:  p.product || "—",
        openQty:  n(p.quantity),
        buyQty, sellQty, buyAvg, sellAvg, buyVal, sellVal,
        ltp:      n(p.ltp),
        realized: n(p.pnl || p.realised || p.realized || 0),
        unrealized: n(p.unrealised || p.unrealized || 0),
        gross,
        posCharges,
        net: gross - posCharges,
      };
    });

    // Order book summary
    const buyFilled  = filled.filter((o) => String(o.transaction_type || "").toUpperCase() === "BUY");
    const sellFilled = filled.filter((o) => String(o.transaction_type || "").toUpperCase() === "SELL");

    return { realized, unrealized, grossPnl, charges, netPnl, posRows, filled, buyFilled, sellFilled };
  }, [orders, positions]);

  const { realized, unrealized, grossPnl, charges, netPnl, posRows, filled, buyFilled, sellFilled } = metrics;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: "100%", padding: "16px 18px 40px", boxSizing: "border-box", fontFamily: "'Inter','Segoe UI',sans-serif", color: TEXT }}>

      {/* ── header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>Profit &amp; Loss</h2>
          <p style={{ margin: "3px 0 0", fontSize: "0.75rem", color: DIM }}>
            Today's positions · Estimated F&amp;O charges (NSE Upstox rates) · {asOf ? `As of ${asOf}` : ""}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          style={{ padding: "7px 16px", borderRadius: 7, cursor: loading ? "wait" : "pointer", background: `${BLUE}22`, border: `1px solid ${BLUE}44`, color: BLUE, fontWeight: 700, fontSize: "0.78rem" }}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: `${RED}12`, border: `1px solid ${RED}44`, color: RED, fontSize: "0.83rem" }}>{error}</div>
      )}

      {/* ── P&L summary tiles ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <StatCard label="Net P&L" value={inr(netPnl, true)} valueColor={n(netPnl) >= 0 ? GREEN : RED} sub="After estimated charges" accent={n(netPnl) >= 0 ? `${GREEN}55` : `${RED}55`} />
        <StatCard label="Gross P&L" value={inr(grossPnl, true)} valueColor={n(grossPnl) >= 0 ? GREEN : RED} sub="Before charges" />
        <StatCard label="Realized" value={inr(realized, true)} valueColor={n(realized) >= 0 ? GREEN : RED} sub="Closed positions" />
        <StatCard label="Unrealized" value={inr(unrealized, true)} valueColor={n(unrealized) >= 0 ? GREEN : RED} sub="Open positions (MTM)" />
        <StatCard label="Est. Charges" value={inr(charges.total)} valueColor={RED} sub={`${filled.length} orders × ₹20 + duties`} />
        <StatCard label="Turnover" value={inr(charges.turnover)} sub={`Buy ₹${(charges.buyVal / 1000).toFixed(0)}K · Sell ₹${(charges.sellVal / 1000).toFixed(0)}K`} />
      </div>

      {/* ── charges breakdown ── */}
      <Section title="Estimated Charges Breakdown">
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${BORDER}` }}>
                {["Charge Head", "Rate", "Amount", "Basis"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: "0.67rem", fontWeight: 700, color: DIM, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Brokerage",               `₹20 / order`,            charges.brokerage,   `${filled.length} filled orders`],
                ["STT",                     "0.0625% sell side",      charges.stt,          inr(charges.sellVal) + " sell value"],
                ["Exchange (NSE)",          "0.053% premium",         charges.exchCharges,  inr(charges.turnover) + " turnover"],
                ["SEBI Charges",            "₹10 per crore",          charges.sebi,         inr(charges.turnover) + " turnover"],
                ["GST",                     "18% on above",           charges.gst,          "On brokerage + exch + SEBI"],
                ["Stamp Duty",              "0.003% buy side",        charges.stampDuty,    inr(charges.buyVal) + " buy value"],
              ].map(([head, rate, amt, basis]) => (
                <tr key={head} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "8px 14px", fontWeight: 600, color: TEXT }}>{head}</td>
                  <td style={{ padding: "8px 14px", color: DIM, fontFamily: "ui-monospace,monospace", fontSize: "0.75rem" }}>{rate}</td>
                  <td style={{ padding: "8px 14px", fontFamily: "ui-monospace,monospace", color: RED, fontWeight: 700 }}>{inr(amt)}</td>
                  <td style={{ padding: "8px 14px", color: DIM, fontSize: "0.72rem" }}>{basis}</td>
                </tr>
              ))}
              <tr style={{ background: "rgba(239,83,80,0.06)", borderTop: `2px solid ${BORDER}` }}>
                <td colSpan={2} style={{ padding: "10px 14px", fontWeight: 800, color: TEXT }}>Total Charges</td>
                <td style={{ padding: "10px 14px", fontFamily: "ui-monospace,monospace", color: RED, fontWeight: 800, fontSize: "1rem" }}>{inr(charges.total)}</td>
                <td style={{ padding: "10px 14px", color: DIM, fontSize: "0.72rem" }}>Approx (Upstox/NSE rates)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── position-wise P&L ── */}
      <Section title={`Position P&L — ${posRows.length} positions`}>
        {posRows.length === 0 ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "28px", textAlign: "center", color: DIM, fontSize: "0.84rem" }}>
            No positions today.
          </div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", minWidth: 760 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${BORDER}` }}>
                  {["Symbol", "Exch", "Qty", "Buy Avg", "Sell Avg", "LTP", "Realized", "Unrealized", "Gross P&L", "Est. Charges", "Net P&L"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: h === "Symbol" ? "left" : "right", fontSize: "0.65rem", fontWeight: 700, color: DIM, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posRows.map((p, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 700, color: TEXT, fontSize: "0.8rem", whiteSpace: "nowrap" }}>{p.symbol}</div>
                      <div style={{ fontSize: "0.62rem", color: DIM }}>{p.product}</div>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: DIM, fontSize: "0.72rem" }}>{p.exchange}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace" }}>
                      <div style={{ color: TEXT }}>{p.buyQty > 0 ? `B:${p.buyQty}` : "—"}</div>
                      <div style={{ color: TEXT }}>{p.sellQty > 0 ? `S:${p.sellQty}` : "—"}</div>
                      {p.openQty !== 0 && <div style={{ color: YELLOW, fontSize: "0.62rem" }}>Open:{p.openQty}</div>}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", color: TEXT }}>{p.buyAvg > 0 ? inr(p.buyAvg) : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", color: TEXT }}>{p.sellAvg > 0 ? inr(p.sellAvg) : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", color: TEXT }}>{inr(p.ltp)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", ...up(p.realized) }}>{inr(p.realized, true)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", ...up(p.unrealized) }}>{inr(p.unrealized, true)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", fontWeight: 700, ...up(p.gross) }}>
                      {inr(p.gross, true)}
                      <div style={{ marginTop: 2 }}>{pill(p.gross, p.gross >= 0 ? "Profit" : "Loss")}</div>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", color: RED }}>{inr(p.posCharges)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", fontWeight: 800, ...up(p.net) }}>{inr(p.net, true)}</td>
                  </tr>
                ))}
                {/* totals row */}
                <tr style={{ background: "rgba(255,255,255,0.04)", borderTop: `2px solid ${BORDER}` }}>
                  <td colSpan={6} style={{ padding: "10px 10px", fontWeight: 800, color: TEXT }}>Total</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", fontWeight: 700, ...up(realized) }}>{inr(realized, true)}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", fontWeight: 700, ...up(unrealized) }}>{inr(unrealized, true)}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", fontWeight: 800, ...up(grossPnl) }}>{inr(grossPnl, true)}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", fontWeight: 700, color: RED }}>{inr(charges.total)}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", fontWeight: 800, fontSize: "1rem", ...up(netPnl) }}>{inr(netPnl, true)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── order log ── */}
      <Section title={`Today's Orders — ${orders.length} total · ${filled.length} filled (${buyFilled.length}B / ${sellFilled.length}S)`}>
        {orders.length === 0 ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "28px", textAlign: "center", color: DIM, fontSize: "0.84rem" }}>No orders today.</div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", minWidth: 620 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${BORDER}` }}>
                  {["Time", "Symbol", "B/S", "Qty", "Avg Price", "Value", "Status"].map(h => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: h === "Symbol" || h === "Time" || h === "Status" ? "left" : "right", fontSize: "0.65rem", fontWeight: 700, color: DIM, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...orders].reverse().map((o, i) => {
                  const isBuy = String(o.transaction_type || "").toUpperCase() === "BUY";
                  const qty   = n(o.filled_quantity || o.quantity);
                  const price = n(o.average_price || o.price);
                  const val   = qty * price;
                  const status = String(o.status || "").toLowerCase();
                  const statusColor = status === "complete" ? GREEN : status === "rejected" || status === "cancelled" ? RED : YELLOW;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: "7px 10px", color: DIM, fontSize: "0.7rem", whiteSpace: "nowrap" }}>{o.order_timestamp || o.exchange_timestamp || "—"}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: TEXT, whiteSpace: "nowrap" }}>{o.trading_symbol || "—"}</td>
                      <td style={{ padding: "7px 10px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: isBuy ? `${GREEN}22` : `${RED}22`, border: `1px solid ${isBuy ? GREEN : RED}44`, color: isBuy ? GREEN : RED }}>
                          {o.transaction_type}
                        </span>
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace" }}>{qty}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", color: TEXT }}>{price > 0 ? inr(price) : "—"}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", color: TEXT }}>{val > 0 ? inr(val) : "—"}</td>
                      <td style={{ padding: "7px 10px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: statusColor }}>{o.status || "—"}</span>
                        {o.status_message && <div style={{ fontSize: "0.6rem", color: DIM, marginTop: 1 }}>{o.status_message}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
