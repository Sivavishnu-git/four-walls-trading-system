import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client.js";

const PERIODS = [
  { key: "current", label: "This Month" },
  { key: "last",    label: "Last Month" },
  { key: "3months", label: "Last 3 Months" },
];

const USD = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

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

export function AwsCostAnalysisPage() {
  const [period, setPeriod] = useState("current");
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

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

  const topService = data?.services?.[0];
  const dateLabel  = data ? `${data.dateRange.start} → ${data.dateRange.end}` : "";

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, color: "#fff", fontSize: "1.15rem", fontWeight: 700 }}>AWS Cost Analysis</h2>
          {dateLabel && <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 2 }}>{dateLabel}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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

      {/* Error */}
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
          {error.includes("not authorized") || error.includes("AccessDenied") ? (
            <div style={{ marginTop: 6, color: "#aaa", fontSize: "0.8rem" }}>
              Ensure your AWS credentials have <code>ce:GetCostAndUsage</code> permission.
            </div>
          ) : null}
        </div>
      )}

      {/* Loading skeleton */}
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
              accent="#ff9800"
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
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #2a2e39",
                fontWeight: 700,
                fontSize: "0.85rem",
                color: "#ccc",
              }}
            >
              Cost by Service
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "#161a25" }}>
                    <th style={{ padding: "8px 16px", textAlign: "left", color: "#888", fontWeight: 600 }}>#</th>
                    <th style={{ padding: "8px 16px", textAlign: "left", color: "#888", fontWeight: 600 }}>Service</th>
                    <th style={{ padding: "8px 16px", textAlign: "right", color: "#888", fontWeight: 600 }}>Cost (USD)</th>
                    <th style={{ padding: "8px 16px", textAlign: "right", color: "#888", fontWeight: 600 }}>% of Total</th>
                    <th style={{ padding: "8px 16px", textAlign: "left", color: "#888", fontWeight: 600 }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((svc, i) => {
                    const pct = data.totalCost > 0 ? (svc.cost / data.totalCost) * 100 : 0;
                    const barColor = i === 0 ? "#ff9800" : i === 1 ? "#2962ff" : i === 2 ? "#26a69a" : "#ef5350";
                    return (
                      <tr
                        key={svc.name}
                        style={{
                          borderBottom: "1px solid #2a2e3955",
                          background: i % 2 === 0 ? "transparent" : "#1a1e2a",
                        }}
                      >
                        <td style={{ padding: "9px 16px", color: "#555" }}>{i + 1}</td>
                        <td style={{ padding: "9px 16px", color: "#d1d4dc", maxWidth: 260 }}>{svc.name}</td>
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
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #2a2e39",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  color: "#ccc",
                }}
              >
                Daily Spend
              </div>
              <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#161a25", zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: "8px 16px", textAlign: "left", color: "#888", fontWeight: 600 }}>Date</th>
                      <th style={{ padding: "8px 16px", textAlign: "right", color: "#888", fontWeight: 600 }}>Cost (USD)</th>
                      <th style={{ padding: "8px 16px", textAlign: "left", color: "#888", fontWeight: 600 }}>Bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.daily].reverse().map((row, i) => {
                      const maxDaily = Math.max(...data.daily.map((r) => r.cost), 0.01);
                      const pct = (row.cost / maxDaily) * 100;
                      return (
                        <tr
                          key={row.date}
                          style={{
                            borderBottom: "1px solid #2a2e3944",
                            background: i % 2 === 0 ? "transparent" : "#1a1e2a",
                          }}
                        >
                          <td style={{ padding: "7px 16px", color: "#aaa", fontFamily: "monospace" }}>{row.date}</td>
                          <td style={{ padding: "7px 16px", textAlign: "right", color: "#fff", fontFamily: "monospace", fontWeight: 600 }}>
                            {USD(row.cost)}
                          </td>
                          <td style={{ padding: "7px 16px", minWidth: 120 }}>
                            <div style={{ background: "#2a2e39", borderRadius: 3, height: 7, overflow: "hidden" }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: "100%",
                                  background: row.cost > 0 ? "#2962ff" : "#2a2e39",
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
