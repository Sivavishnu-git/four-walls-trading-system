import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client.js";

const PERIODS = [
  { key: "current", label: "This Month" },
  { key: "last",    label: "Last Month" },
  { key: "3months", label: "Last 3 Months" },
];

const USD = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

const DEFAULT_BUDGET = 50; // USD
const LS_BUDGET_KEY  = "aws_monthly_budget";

// ── Alert detection helpers ────────────────────────────────────────────────────

function detectAlerts(data, budget) {
  const alerts = [];
  if (!data) return alerts;

  // 1. Monthly budget breach
  if (budget > 0 && data.totalCost >= budget) {
    alerts.push({
      level: "critical",
      title: "Monthly Budget Exceeded",
      message: `Total spend ${USD(data.totalCost)} has exceeded your ${USD(budget)} budget.`,
    });
  } else if (budget > 0 && data.totalCost >= budget * 0.8) {
    alerts.push({
      level: "warning",
      title: "Approaching Monthly Budget",
      message: `Total spend ${USD(data.totalCost)} is above 80% of your ${USD(budget)} budget.`,
    });
  }

  // 2. Daily spend spike — flag any day > 2× the period average
  if (data.daily && data.daily.length > 1) {
    const avg = data.daily.reduce((s, r) => s + r.cost, 0) / data.daily.length;
    const spikes = data.daily.filter((r) => avg > 0 && r.cost > avg * 2);
    spikes.forEach((r) => {
      alerts.push({
        level: "warning",
        title: "Daily Spend Spike",
        message: `${r.date}: ${USD(r.cost)} — ${(r.cost / avg).toFixed(1)}× above average (${USD(avg)}/day).`,
      });
    });
  }

  // 3. Single service dominating (>70% of total) — possible runaway resource
  if (data.services.length > 1 && data.totalCost > 0) {
    const dominant = data.services.filter((s) => s.cost / data.totalCost > 0.7);
    dominant.forEach((s) => {
      alerts.push({
        level: "info",
        title: "Dominant Service Detected",
        message: `${s.name} accounts for ${((s.cost / data.totalCost) * 100).toFixed(1)}% of total spend (${USD(s.cost)}).`,
      });
    });
  }

  return alerts;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }) {
  return (
    <div
      style={{
        flex: "1 1 160px",
        minWidth: 140,
        background: "#1e222d",
        border: `1px solid ${accent}33`,
        borderRadius: 10,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontSize: "0.72rem", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#fff", margin: "6px 0 2px" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "0.75rem", color: accent }}>{sub}</div>}
    </div>
  );
}

const LEVEL_STYLES = {
  critical: { bg: "rgba(239,83,80,0.13)", border: "rgba(239,83,80,0.4)", icon: "🔴", color: "#ffb4b4" },
  warning:  { bg: "rgba(255,152,0,0.12)", border: "rgba(255,152,0,0.4)",  icon: "⚠️", color: "#ffcc80" },
  info:     { bg: "rgba(41,98,255,0.12)", border: "rgba(41,98,255,0.4)",  icon: "ℹ️", color: "#90b4ff" },
};

function AlertBanner({ alerts }) {
  if (!alerts.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
      {alerts.map((a, i) => {
        const s = LEVEL_STYLES[a.level] || LEVEL_STYLES.info;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 8,
              background: s.bg,
              border: `1px solid ${s.border}`,
            }}
          >
            <span style={{ fontSize: "1rem", lineHeight: 1.4 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: "0.83rem", fontWeight: 700, color: s.color }}>{a.title}</div>
              <div style={{ fontSize: "0.78rem", color: "#bbb", marginTop: 2 }}>{a.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BudgetSetter({ budget, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(String(budget));

  function commit() {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) onSave(n);
    setEditing(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: "0.73rem", color: "#666" }}>Budget:</span>
      {editing ? (
        <>
          <input
            autoFocus
            type="number"
            min="0"
            step="1"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            style={{
              width: 70, padding: "3px 6px", borderRadius: 5, border: "1px solid #ff9800",
              background: "#1e222d", color: "#fff", fontSize: "0.78rem",
            }}
          />
          <button onClick={commit} style={btnStyle("#ff9800")}>Set</button>
          <button onClick={() => setEditing(false)} style={btnStyle("#555")}>✕</button>
        </>
      ) : (
        <button onClick={() => { setVal(String(budget)); setEditing(true); }} style={btnStyle("#ff9800")}>
          {budget > 0 ? `${USD(budget)} ✎` : "Set budget"}
        </button>
      )}
    </div>
  );
}

function btnStyle(accent) {
  return {
    padding: "4px 10px", fontSize: "0.73rem", fontWeight: 600, borderRadius: 5,
    cursor: "pointer", background: `${accent}22`, border: `1px solid ${accent}55`,
    color: accent,
  };
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function AwsCostAnalysisPage() {
  const [period,  setPeriod]  = useState("current");
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [budget,  setBudget]  = useState(() => {
    const stored = localStorage.getItem(LS_BUDGET_KEY);
    return stored !== null ? parseFloat(stored) : DEFAULT_BUDGET;
  });

  function saveBudget(v) {
    setBudget(v);
    localStorage.setItem(LS_BUDGET_KEY, String(v));
  }

  const fetchCosts = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await apiFetch(`/api/aws/costs?period=${p}`);
      const json = await res.json();
      if (json.status !== "success") throw new Error(json.error || "Unknown error");
      setData(json);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCosts(period); }, [period, fetchCosts]);

  const alerts     = detectAlerts(data, budget);
  const topService = data?.services?.[0];
  const dateLabel  = data ? `${data.dateRange.start} → ${data.dateRange.end}` : "";

  // Pre-compute spike set for row highlighting
  const spikeSet = new Set();
  if (data?.daily?.length > 1) {
    const avg = data.daily.reduce((s, r) => s + r.cost, 0) / data.daily.length;
    data.daily.forEach((r) => { if (avg > 0 && r.cost > avg * 2) spikeSet.add(r.date); });
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 52px)",
        background: "#131722",
        color: "#d1d4dc",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        padding: "24px 20px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: "#fff", fontSize: "1.15rem", fontWeight: 700 }}>AWS Cost Analysis</h2>
          {dateLabel && <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 2 }}>{dateLabel}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <BudgetSetter budget={budget} onSave={saveBudget} />
          <div style={{ width: 1, height: 20, background: "#2a2e39", margin: "0 4px" }} />
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 600,
                borderRadius: 6,
                cursor: "pointer",
                background: period === p.key ? "rgba(255,152,0,0.2)" : "rgba(255,255,255,0.07)",
                border: period === p.key ? "1px solid rgba(255,152,0,0.5)" : "1px solid rgba(255,255,255,0.14)",
                color: period === p.key ? "#ff9800" : "#aaa",
                transition: "all 0.15s",
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => fetchCosts(period)}
            disabled={loading}
            style={{
              padding: "6px 12px",
              fontSize: "0.75rem",
              fontWeight: 600,
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              background: "rgba(38,166,154,0.15)",
              border: "1px solid rgba(38,166,154,0.4)",
              color: "#26a69a",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      <AlertBanner alerts={alerts} />

      {/* API Error */}
      {error && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 8,
            background: "rgba(239,83,80,0.12)",
            border: "1px solid rgba(239,83,80,0.35)",
            color: "#ffb4b4",
            fontSize: "0.88rem",
            marginBottom: 20,
          }}
        >
          <strong>Error:</strong> {error}
          {(error.includes("not authorized") || error.includes("AccessDenied")) && (
            <div style={{ marginTop: 6, color: "#aaa", fontSize: "0.8rem" }}>
              Ensure your AWS IAM role has <code>ce:GetCostAndUsage</code> permission.
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
          Fetching AWS cost data…
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <SummaryCard
              label="Total Cost"
              value={USD(data.totalCost)}
              sub={`${data.services.length} services billed`}
              accent={alerts.some((a) => a.level === "critical") ? "#ef5350" : alerts.some((a) => a.level === "warning") ? "#ff9800" : "#26a69a"}
            />
            {topService && (
              <SummaryCard
                label="Top Service"
                value={topService.name.replace("Amazon ", "").replace("AWS ", "")}
                sub={USD(topService.cost)}
                accent="#2962ff"
              />
            )}
            <SummaryCard
              label="Active Alerts"
              value={alerts.length}
              sub={alerts.length === 0 ? "All clear" : `${alerts.filter((a) => a.level === "critical").length} critical`}
              accent={alerts.length === 0 ? "#26a69a" : "#ef5350"}
            />
            <SummaryCard
              label="Currency"
              value={data.currency}
              sub="All amounts"
              accent="#26a69a"
            />
          </div>

          {/* Service breakdown table */}
          <div
            style={{
              background: "#1e222d",
              border: "1px solid #2a2e39",
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 24,
            }}
          >
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2e39", fontWeight: 700, fontSize: "0.85rem", color: "#ccc" }}>
              Cost by Service
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "#161a25" }}>
                    <th style={{ padding: "8px 16px", textAlign: "left",  color: "#888", fontWeight: 600 }}>#</th>
                    <th style={{ padding: "8px 16px", textAlign: "left",  color: "#888", fontWeight: 600 }}>Service</th>
                    <th style={{ padding: "8px 16px", textAlign: "right", color: "#888", fontWeight: 600 }}>Cost (USD)</th>
                    <th style={{ padding: "8px 16px", textAlign: "right", color: "#888", fontWeight: 600 }}>% of Total</th>
                    <th style={{ padding: "8px 16px", textAlign: "left",  color: "#888", fontWeight: 600 }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((svc, i) => {
                    const pct      = data.totalCost > 0 ? (svc.cost / data.totalCost) * 100 : 0;
                    const dominant = pct > 70 && data.services.length > 1;
                    const barColor = i === 0 ? "#ff9800" : i === 1 ? "#2962ff" : i === 2 ? "#26a69a" : "#ef5350";
                    return (
                      <tr
                        key={svc.name}
                        style={{
                          borderBottom: "1px solid #2a2e3955",
                          background: dominant
                            ? "rgba(255,152,0,0.07)"
                            : i % 2 === 0 ? "transparent" : "#1a1e2a",
                        }}
                      >
                        <td style={{ padding: "9px 16px", color: "#555" }}>{i + 1}</td>
                        <td style={{ padding: "9px 16px", color: "#d1d4dc", maxWidth: 260 }}>
                          {svc.name}
                          {dominant && (
                            <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "#ff9800", fontWeight: 700 }}>
                              ⚠ dominant
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "9px 16px", textAlign: "right", color: "#fff", fontFamily: "monospace", fontWeight: 600 }}>
                          {USD(svc.cost)}
                        </td>
                        <td style={{ padding: "9px 16px", textAlign: "right", color: "#aaa" }}>
                          {pct.toFixed(1)}%
                        </td>
                        <td style={{ padding: "9px 16px", minWidth: 120 }}>
                          <div style={{ background: "#2a2e39", borderRadius: 3, height: 8, overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                height: "100%",
                                background: barColor,
                                borderRadius: 3,
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {data.services.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#555" }}>
                        No cost data for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily breakdown */}
          {data.daily && data.daily.length > 0 && (
            <div
              style={{
                background: "#1e222d",
                border: "1px solid #2a2e39",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2e39", fontWeight: 700, fontSize: "0.85rem", color: "#ccc", display: "flex", alignItems: "center", gap: 8 }}>
                Daily Spend
                {spikeSet.size > 0 && (
                  <span style={{ fontSize: "0.72rem", color: "#ff9800", fontWeight: 600, background: "rgba(255,152,0,0.12)", border: "1px solid rgba(255,152,0,0.3)", borderRadius: 4, padding: "2px 7px" }}>
                    {spikeSet.size} spike{spikeSet.size > 1 ? "s" : ""} detected
                  </span>
                )}
              </div>
              <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#161a25", zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: "8px 16px", textAlign: "left",  color: "#888", fontWeight: 600 }}>Date</th>
                      <th style={{ padding: "8px 16px", textAlign: "right", color: "#888", fontWeight: 600 }}>Cost (USD)</th>
                      <th style={{ padding: "8px 16px", textAlign: "left",  color: "#888", fontWeight: 600 }}>Bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.daily].reverse().map((row, i) => {
                      const maxDaily = Math.max(...data.daily.map((r) => r.cost), 0.01);
                      const pct      = (row.cost / maxDaily) * 100;
                      const isSpike  = spikeSet.has(row.date);
                      return (
                        <tr
                          key={row.date}
                          style={{
                            borderBottom: "1px solid #2a2e3944",
                            background: isSpike
                              ? "rgba(255,152,0,0.08)"
                              : i % 2 === 0 ? "transparent" : "#1a1e2a",
                          }}
                        >
                          <td style={{ padding: "7px 16px", color: isSpike ? "#ffcc80" : "#aaa", fontFamily: "monospace", fontWeight: isSpike ? 700 : 400 }}>
                            {row.date}
                            {isSpike && <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "#ff9800" }}>▲ spike</span>}
                          </td>
                          <td style={{ padding: "7px 16px", textAlign: "right", color: isSpike ? "#ffcc80" : "#fff", fontFamily: "monospace", fontWeight: 600 }}>
                            {USD(row.cost)}
                          </td>
                          <td style={{ padding: "7px 16px", minWidth: 120 }}>
                            <div style={{ background: "#2a2e39", borderRadius: 3, height: 7, overflow: "hidden" }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: "100%",
                                  background: isSpike ? "#ff9800" : row.cost > 0 ? "#2962ff" : "#2a2e39",
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
