import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client.js";

function money(v) {
  const n = Number(v || 0);
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function num(v) {
  return Number(v || 0);
}

export function OrderAnalysisPage({ accessToken }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [positions, setPositions] = useState([]);
  const [asOf, setAsOf] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [oRes, pRes] = await Promise.all([
        apiFetch("/api/order/today", { accessToken }),
        apiFetch("/api/portfolio/positions", { accessToken }),
      ]);
      const oJson = await oRes.json().catch(() => ({}));
      const pJson = await pRes.json().catch(() => ({}));

      if (!oRes.ok) throw new Error(oJson?.error || "Failed to load orders");
      if (!pRes.ok) throw new Error(pJson?.error || "Failed to load positions");

      const orderRows = Array.isArray(oJson?.data?.orders)
        ? oJson.data.orders
        : Array.isArray(oJson?.data)
          ? oJson.data
          : [];
      const posRows = Array.isArray(pJson?.data) ? pJson.data : [];

      setOrders(orderRows);
      setPositions(posRows);
      setAsOf(new Date().toLocaleString("en-IN"));
    } catch (e) {
      setError(e.message || "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(() => {
    const filled = orders.filter((o) => num(o.filled_quantity) > 0 || String(o.status || "").toLowerCase() === "complete");
    const buyFilled = filled.filter((o) => String(o.transaction_type || "").toUpperCase() === "BUY");
    const sellFilled = filled.filter((o) => String(o.transaction_type || "").toUpperCase() === "SELL");

    const buyTurnover = buyFilled.reduce((s, o) => s + num(o.average_price || o.price) * num(o.filled_quantity || o.quantity), 0);
    const sellTurnover = sellFilled.reduce((s, o) => s + num(o.average_price || o.price) * num(o.filled_quantity || o.quantity), 0);
    const approxRealized = sellTurnover - buyTurnover;

    const openPnl = positions.reduce((s, p) => s + num(p.unrealised || p.unrealized || p.unrealised_pnl || p.unrealized_pnl || 0), 0);
    const dayPnl = positions.reduce((s, p) => s + num(p.day_pnl || p.pnl || 0), 0);

    // strategy proxy: group completed fills by symbol and compute rough realized contribution
    const bySymbol = new Map();
    for (const o of filled) {
      const key = o.trading_symbol || o.instrument_token || "UNKNOWN";
      const item = bySymbol.get(key) || { symbol: key, buy: 0, sell: 0, orders: 0 };
      const amt = num(o.average_price || o.price) * num(o.filled_quantity || o.quantity);
      if (String(o.transaction_type || "").toUpperCase() === "BUY") item.buy += amt;
      else item.sell += amt;
      item.orders += 1;
      bySymbol.set(key, item);
    }
    const strategies = [...bySymbol.values()].map((x) => ({ ...x, pnl: x.sell - x.buy }));
    const wins = strategies.filter((s) => s.pnl > 0).length;
    const losses = strategies.filter((s) => s.pnl < 0).length;
    const winRate = strategies.length ? (wins / strategies.length) * 100 : 0;

    return {
      totalOrders: orders.length,
      filledOrders: filled.length,
      buyCount: buyFilled.length,
      sellCount: sellFilled.length,
      buyTurnover,
      sellTurnover,
      approxRealized,
      openPnl,
      dayPnl,
      strategyCount: strategies.length,
      wins,
      losses,
      winRate,
      strategies: strategies.sort((a, b) => b.pnl - a.pnl).slice(0, 8),
    };
  }, [orders, positions]);

  const realizedClass = metrics.approxRealized >= 0 ? "analysis-value-up" : "analysis-value-down";
  const dayClass = metrics.dayPnl >= 0 ? "analysis-value-up" : "analysis-value-down";
  const openClass = metrics.openPnl >= 0 ? "analysis-value-up" : "analysis-value-down";

  return (
    <div className="analysis-page">
      <div className="analysis-hero">
        <div className="analysis-header">
          <div>
            <h2>Order Analysis</h2>
            <p>Buy/Sell, P&amp;L and strategy health from today&apos;s order book + open positions.</p>
          </div>
          <button type="button" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="analysis-strip">
          <div className="analysis-strip-item">
            <span>As of</span>
            <strong>{asOf || "--"}</strong>
          </div>
          <div className="analysis-strip-item">
            <span>Wins / Losses</span>
            <strong>{metrics.wins} / {metrics.losses}</strong>
          </div>
          <div className="analysis-strip-item">
            <span>Win Rate</span>
            <strong>{metrics.winRate.toFixed(1)}%</strong>
          </div>
        </div>
      </div>

      {error ? <div className="analysis-error">{error}</div> : null}

      <div className="analysis-grid">
        <div className="analysis-card"><span>Total Orders</span><strong>{metrics.totalOrders}</strong></div>
        <div className="analysis-card"><span>Filled Orders</span><strong>{metrics.filledOrders}</strong></div>
        <div className="analysis-card"><span>BUY / SELL</span><strong>{metrics.buyCount} / {metrics.sellCount}</strong></div>
        <div className="analysis-card"><span>Approx Realized</span><strong className={realizedClass}>{money(metrics.approxRealized)}</strong></div>
        <div className="analysis-card"><span>Day P&amp;L</span><strong className={dayClass}>{money(metrics.dayPnl)}</strong></div>
        <div className="analysis-card"><span>Open P&amp;L</span><strong className={openClass}>{money(metrics.openPnl)}</strong></div>
        <div className="analysis-card"><span>Buy Turnover</span><strong>{money(metrics.buyTurnover)}</strong></div>
        <div className="analysis-card"><span>Sell Turnover</span><strong>{money(metrics.sellTurnover)}</strong></div>
      </div>

      <div className="analysis-progress-wrap">
        <div className="analysis-progress-label">
          <span>Strategy Success Mix</span>
          <strong>{metrics.wins} Wins • {metrics.losses} Losses</strong>
        </div>
        <div className="analysis-progress-bar">
          <div className="analysis-progress-win" style={{ width: `${Math.max(0, Math.min(100, metrics.winRate))}%` }} />
        </div>
      </div>

      <div className="analysis-table-wrap">
        <h3>Top Strategy Buckets (symbol-level approximation)</h3>
        <table className="analysis-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Orders</th>
              <th>Buy Value</th>
              <th>Sell Value</th>
              <th>P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {metrics.strategies.length === 0 ? (
              <tr><td colSpan={5}>No completed orders yet.</td></tr>
            ) : metrics.strategies.map((s) => (
              <tr key={s.symbol}>
                <td>{s.symbol}</td>
                <td>{s.orders}</td>
                <td>{money(s.buy)}</td>
                <td>{money(s.sell)}</td>
                <td style={{ color: s.pnl >= 0 ? "#26a69a" : "#ef5350" }}>{money(s.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
