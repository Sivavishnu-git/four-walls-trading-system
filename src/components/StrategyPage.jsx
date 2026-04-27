import { useState, useEffect } from "react";
import { apiFetch } from "../api/client.js";

// ── theme ─────────────────────────────────────────────────────────────────────
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
const ORANGE = "#ff7043";

const card = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: "16px 20px",
};

const label = {
  fontSize: "0.68rem",
  color: DIM,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

function fmt(n, dec = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtOI(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN");
}

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function nowISTMin() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return d.getHours() * 60 + d.getMinutes();
}

function isMarketOpen() {
  const m = nowISTMin();
  return m >= 9 * 60 + 15 && m <= 15 * 60 + 30;
}

// ── checklist items (pre/during/post session) ─────────────────────────────────
const CHECKLIST = {
  pre: [
    { id: "token",   text: "Upstox OAuth token refreshed (login via UI)" },
    { id: "oi",      text: "OI tracker running (pm2 status)" },
    { id: "ws",      text: "WebSocket feed connected (upstox-feed.js)" },
    { id: "pivots",  text: "Prior-day pivots loaded in Pivot Calculator" },
    { id: "dryrun",  text: "dry_run confirmed for all bot instances" },
  ],
  during: [
    { id: "oiwatch",  text: "Monitoring OI Change History for trend confirmation" },
    { id: "atmskew",  text: "Cross-check ATM skew before option entries" },
    { id: "timestop", text: "No new intraday entries after 14:00 IST" },
  ],
  post: [
    { id: "s3",     text: "S3 backup uploaded (15:35 IST)" },
    { id: "review", text: "Order log & P&L reviewed in Order Analysis" },
    { id: "notes",  text: "Strategy deviations noted for next session" },
  ],
};

const STORAGE_KEY = `fw_checklist_${todayIST()}`;

function loadChecks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function saveChecks(checks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(checks)); } catch {}
}

// ── signal badge ─────────────────────────────────────────────────────────────
function Badge({ text, color }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 20,
      background: `${color}22`,
      border: `1px solid ${color}55`,
      color,
      fontSize: "0.7rem",
      fontWeight: 700,
      letterSpacing: "0.04em",
    }}>{text}</span>
  );
}

// ── checklist section ─────────────────────────────────────────────────────────
function CheckSection({ title, items, checks, toggle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...label, marginBottom: 8 }}>{title}</div>
      {items.map(({ id, text }) => (
        <label key={id} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "7px 10px", borderRadius: 6, cursor: "pointer",
          background: checks[id] ? `${GREEN}0d` : "transparent",
          border: `1px solid ${checks[id] ? `${GREEN}33` : "transparent"}`,
          marginBottom: 4,
          transition: "background 0.2s",
        }}>
          <input
            type="checkbox"
            checked={!!checks[id]}
            onChange={() => toggle(id)}
            style={{ marginTop: 2, accentColor: GREEN, flexShrink: 0 }}
          />
          <span style={{
            fontSize: "0.82rem",
            color: checks[id] ? GREEN : TEXT,
            textDecoration: checks[id] ? "line-through" : "none",
            lineHeight: 1.4,
          }}>{text}</span>
        </label>
      ))}
    </div>
  );
}

// ── rule row ─────────────────────────────────────────────────────────────────
function RuleRow({ rule, detail }) {
  return (
    <div style={{
      display: "flex", gap: 12, padding: "8px 0",
      borderBottom: `1px solid ${BORDER}`,
      alignItems: "flex-start",
    }}>
      <span style={{ fontWeight: 700, color: YELLOW, fontSize: "0.8rem", minWidth: 180, flexShrink: 0 }}>{rule}</span>
      <span style={{ fontSize: "0.8rem", color: TEXT, lineHeight: 1.4 }}>{detail}</span>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
export function StrategyPage({ accessToken }) {
  const [checks, setChecks]       = useState(loadChecks);
  const [oiData, setOiData]       = useState(null);   // latest OI from DB
  const [sentiment, setSentiment] = useState(null);   // 9:15 sentiment
  const [liveSetup, setLiveSetup] = useState(null);   // pivots + ltp
  const [loading, setLoading]     = useState(false);
  const [loadErr, setLoadErr]     = useState(null);

  // persist checks
  useEffect(() => { saveChecks(checks); }, [checks]);

  const toggle = (id) => setChecks((c) => ({ ...c, [id]: !c[id] }));

  const resetChecklist = () => {
    setChecks({});
    localStorage.removeItem(STORAGE_KEY);
  };

  // load live signals
  async function loadSignals() {
    if (!accessToken) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const [oiRes, sentRes, setupRes] = await Promise.all([
        apiFetch("/api/oi/latest"),
        apiFetch(`/api/sentiment?date=${todayIST()}`, { accessToken }),
        apiFetch("/api/trade-setup", { accessToken }),
      ]);

      const [oiJson, sentJson, setupJson] = await Promise.all([
        oiRes.json(), sentRes.json(), setupRes.json(),
      ]);

      if (oiJson.status === "success")  setOiData(oiJson.data);
      if (sentJson.status === "success") setSentiment(sentJson.data.sentiment);
      if (setupJson.status !== "error") setLiveSetup(setupJson.data);
    } catch (e) {
      setLoadErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSignals(); }, [accessToken]);

  // ── derived signals ───────────────────────────────────────────────────────
  const niftyOI = oiData?.find((r) => r.symbol === "NIFTY");

  // Strategy 1: OI trend signal
  let s1Signal = null;
  if (niftyOI) {
    const oiChg = niftyOI.oi_change ?? 0;
    const ltpChg = liveSetup?.live?.net_change ?? 0;
    if (oiChg > 0 && ltpChg > 0)      s1Signal = { text: "Long Build Up",   color: GREEN,  desc: "OI ↑ + Price ↑ — Bullish bias" };
    else if (oiChg > 0 && ltpChg < 0) s1Signal = { text: "Short Build Up",  color: RED,    desc: "OI ↑ + Price ↓ — Bearish bias" };
    else if (oiChg < 0 && ltpChg > 0) s1Signal = { text: "Short Covering",  color: YELLOW, desc: "OI ↓ + Price ↑ — Momentum scalp" };
    else if (oiChg < 0 && ltpChg < 0) s1Signal = { text: "Profit Booking",  color: ORANGE, desc: "OI ↓ + Price ↓ — Caution" };
  }

  // Strategy 2: ATM skew from sentiment
  let s2Signal = null;
  if (sentiment) {
    const oiUp = (sentiment.oi_change ?? 0) > 0;
    const ltpUp = (sentiment.ltp_change ?? 0) > 0;
    if (oiUp && ltpUp)       s2Signal = { text: "Buy CE",  color: GREEN, desc: "Bullish opening — Long Build Up signal" };
    else if (oiUp && !ltpUp) s2Signal = { text: "Buy PE",  color: RED,   desc: "Bearish opening — Short Build Up signal" };
    else                     s2Signal = { text: "Neutral", color: DIM,   desc: "No clear OI skew at open" };
  }

  // Strategy 3: Pivot position
  const ltp    = liveSetup?.live?.ltp ?? liveSetup?.live?.last_price;
  const pivots = liveSetup?.pivots;
  let s3Signal = null;
  if (ltp != null && pivots) {
    if (ltp >= pivots.r2)      s3Signal = { text: "Near R2/R3",   color: RED,    desc: "Price at resistance — watch for reversal short" };
    else if (ltp >= pivots.r1) s3Signal = { text: "Above R1",     color: ORANGE, desc: "Trending up — long bias, target R2" };
    else if (ltp >= pivots.pp) s3Signal = { text: "PP → R1 Zone", color: GREEN,  desc: "Bullish zone — long at PP dip" };
    else if (ltp >= pivots.s1) s3Signal = { text: "S1 → PP Zone", color: YELLOW, desc: "Below PP — watch S1 as support for bounce" };
    else                       s3Signal = { text: "Near S1/S2",   color: BLUE,   desc: "Price at support — watch for reversal long" };
  }

  const checkedCount = Object.values(checks).filter(Boolean).length;
  const totalCount   = Object.values(CHECKLIST).flat().length;

  return (
    <div style={{
      background: BG,
      minHeight: "100%",
      padding: "20px 16px 48px",
      boxSizing: "border-box",
      fontFamily: "'Inter','Segoe UI',sans-serif",
      color: TEXT,
      maxWidth: 900,
      margin: "0 auto",
    }}>

      {/* ── header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: `${BLUE}22`, border: `1px solid ${BLUE}55`,
              borderRadius: 6, padding: "2px 10px",
              fontSize: "0.7rem", fontWeight: 700, color: BLUE,
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>Strategy</span>
            Four Walls Trading Strategies
          </h2>
          <p style={{ margin: "5px 0 0", fontSize: "0.78rem", color: DIM }}>
            OI-flow based strategies for Nifty Futures &amp; ATM Options
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge text={isMarketOpen() ? "Market Open" : "Market Closed"} color={isMarketOpen() ? GREEN : DIM} />
          <button
            type="button"
            onClick={loadSignals}
            disabled={loading}
            style={{
              padding: "5px 14px",
              background: loading ? "rgba(255,255,255,0.04)" : `${BLUE}22`,
              border: `1px solid ${BLUE}44`,
              borderRadius: 6, color: BLUE,
              fontSize: "0.75rem", fontWeight: 700, cursor: loading ? "wait" : "pointer",
            }}
          >{loading ? "Loading…" : "Refresh Signals"}</button>
        </div>
      </div>

      {loadErr && (
        <div style={{ ...card, marginBottom: 14, background: "rgba(239,83,80,0.08)", border: `1px solid ${RED}44`, color: RED, fontSize: "0.82rem" }}>
          {loadErr}
        </div>
      )}

      {/* ── live signal summary ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { l: "NIFTY OI",       v: fmtOI(niftyOI?.oi),         sub: niftyOI ? `Δ ${niftyOI.oi_change >= 0 ? "+" : ""}${fmtOI(niftyOI.oi_change)}` : "—", c: niftyOI?.oi_change >= 0 ? GREEN : RED },
          { l: "NIFTY LTP",      v: fmt(ltp),                    sub: liveSetup?.live?.net_change != null ? `${liveSetup.live.net_change >= 0 ? "+" : ""}${fmt(liveSetup.live.net_change)}` : "", c: (liveSetup?.live?.net_change ?? 0) >= 0 ? GREEN : RED },
          { l: "Opening Sentiment", v: sentiment?.type ?? "—",   sub: sentiment?.description ?? (loading ? "Fetching…" : "No data"), c: sentiment?.color ?? DIM },
          { l: "Pivot Position", v: s3Signal?.text ?? "—",       sub: s3Signal?.desc ?? (ltp == null ? "No LTP" : "No pivot data"), c: s3Signal?.color ?? DIM },
        ].map(({ l, v, sub, c }) => (
          <div key={l} style={card}>
            <div style={label}>{l}</div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: c, marginBottom: 3 }}>{v}</div>
            <div style={{ fontSize: "0.72rem", color: DIM }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── strategies ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: 14 }}>
          Strategy Playbook
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Strategy 1 */}
          <div style={{ ...card, borderColor: s1Signal ? `${s1Signal.color}44` : BORDER }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem" }}>Strategy 1 — OI Trend Following</span>
                <span style={{ marginLeft: 8, fontSize: "0.68rem", color: DIM, fontWeight: 600 }}>PRIMARY</span>
              </div>
              {s1Signal
                ? <Badge text={s1Signal.text} color={s1Signal.color} />
                : <Badge text="No signal" color={DIM} />}
            </div>
            {s1Signal && (
              <div style={{ fontSize: "0.78rem", color: s1Signal.color, marginBottom: 10, fontWeight: 600 }}>
                ● {s1Signal.desc}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              {[
                { t: "Entry Window",  v: "09:30–11:30 IST  ·  13:30–14:30 IST" },
                { t: "Min OI Change", v: "+2% vs session open" },
                { t: "Target",        v: "15–20 Nifty pts; trail with 3-min OI reversal" },
                { t: "Stop-Loss",     v: "Opposite OI build > 1.5× signal OI or price below entry pivot" },
                { t: "Time Stop",     v: "Square off all intraday positions by 15:15 IST" },
                { t: "Position Size", v: "1 lot; scale to 2–3 after 2 consecutive confirming bars" },
              ].map(({ t, v }) => (
                <div key={t} style={{ padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600 }}>{t}</div>
                  <div style={{ fontSize: "0.8rem", color: TEXT, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Strategy 2 */}
          <div style={{ ...card, borderColor: s2Signal ? `${s2Signal.color}44` : BORDER }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem" }}>Strategy 2 — ATM Options Intraday</span>
                <span style={{ marginLeft: 8, fontSize: "0.68rem", color: DIM, fontWeight: 600 }}>DIRECTIONAL</span>
              </div>
              {s2Signal
                ? <Badge text={s2Signal.text} color={s2Signal.color} />
                : <Badge text="No signal" color={DIM} />}
            </div>
            {s2Signal && (
              <div style={{ fontSize: "0.78rem", color: s2Signal.color, marginBottom: 10, fontWeight: 600 }}>
                ● {s2Signal.desc}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              {[
                { t: "Trigger",       v: "CE bias: ATM PE OI > CE OI by ≥20%  ·  PE bias: reverse" },
                { t: "Entry Window",  v: "09:30–12:00 IST only (avoid theta drag)" },
                { t: "Product",       v: "MIS (auto square-off 15:20 IST)" },
                { t: "Order Type",    v: "MARKET (or LIMIT at bid+0.5 sideways)" },
                { t: "Target",        v: "30–50% gain on premium" },
                { t: "Stop-Loss",     v: "25–30% loss on premium; flat by 13:00 IST → exit" },
              ].map(({ t, v }) => (
                <div key={t} style={{ padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600 }}>{t}</div>
                  <div style={{ fontSize: "0.8rem", color: TEXT, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Strategy 3 */}
          <div style={{ ...card, borderColor: s3Signal ? `${s3Signal.color}44` : BORDER }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem" }}>Strategy 3 — Pivot-Based Scalp</span>
                <span style={{ marginLeft: 8, fontSize: "0.68rem", color: DIM, fontWeight: 600 }}>SCALP</span>
              </div>
              {s3Signal
                ? <Badge text={s3Signal.text} color={s3Signal.color} />
                : <Badge text="No pivot data" color={DIM} />}
            </div>
            {s3Signal && (
              <div style={{ fontSize: "0.78rem", color: s3Signal.color, marginBottom: 10, fontWeight: 600 }}>
                ● {s3Signal.desc}
              </div>
            )}

            {/* live pivot grid */}
            {pivots && ltp != null && (
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[
                  { n: "R3", v: pivots.r3, c: RED },
                  { n: "R2", v: pivots.r2, c: ORANGE },
                  { n: "R1", v: pivots.r1, c: YELLOW },
                  { n: "PP", v: pivots.pp, c: PURPLE },
                  { n: "S1", v: pivots.s1, c: "#80cbc4" },
                  { n: "S2", v: pivots.s2, c: GREEN },
                  { n: "S3", v: pivots.s3, c: GREEN },
                ].map(({ n, v, c }) => {
                  const isActive = n === "PP"
                    ? (ltp >= pivots.pp && ltp < pivots.r1) || (ltp < pivots.pp && ltp >= pivots.s1)
                    : false;
                  const isAbove = ltp >= v;
                  return (
                    <div key={n} style={{
                      flex: "0 0 auto",
                      background: isAbove ? `${c}18` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isAbove ? c + "55" : BORDER}`,
                      borderRadius: 6, padding: "5px 10px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: "0.62rem", color: c, fontWeight: 700 }}>{n}</div>
                      <div style={{ fontSize: "0.78rem", fontFamily: "ui-monospace,monospace", color: TEXT }}>{fmt(v)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              {[
                { t: "Long Setup",   v: "Price touches S1/S2 + OI builds (fresh longs) → 3-min bar closes back inside range" },
                { t: "Short Setup",  v: "Price touches R1/R2 + OI builds (fresh shorts) → wick test + close inside range" },
                { t: "Target",       v: "Next pivot level" },
                { t: "Stop-Loss",    v: "10 points beyond the pivot touched" },
              ].map(({ t, v }) => (
                <div key={t} style={{ padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: "0.68rem", color: DIM, fontWeight: 600 }}>{t}</div>
                  <div style={{ fontSize: "0.8rem", color: TEXT, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── bottom grid: checklist + risk rules ───────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* Session Checklist */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem" }}>Session Checklist</div>
              <div style={{ fontSize: "0.72rem", color: DIM, marginTop: 2 }}>
                {checkedCount} / {totalCount} completed · {todayIST()}
              </div>
            </div>
            <button
              type="button"
              onClick={resetChecklist}
              style={{
                fontSize: "0.68rem", color: DIM, background: "transparent",
                border: `1px solid ${BORDER}`, borderRadius: 5,
                padding: "3px 9px", cursor: "pointer",
              }}
            >Reset</button>
          </div>

          <CheckSection title="Pre-Market (before 09:00 IST)" items={CHECKLIST.pre}    checks={checks} toggle={toggle} />
          <CheckSection title="During Session"                  items={CHECKLIST.during} checks={checks} toggle={toggle} />
          <CheckSection title="Post-Market (after 15:35 IST)"  items={CHECKLIST.post}   checks={checks} toggle={toggle} />

          {/* progress bar */}
          <div style={{ marginTop: 12, background: BORDER, borderRadius: 4, height: 4, overflow: "hidden" }}>
            <div style={{
              width: `${(checkedCount / totalCount) * 100}%`,
              height: "100%",
              background: checkedCount === totalCount ? GREEN : BLUE,
              transition: "width 0.3s",
              borderRadius: 4,
            }} />
          </div>
        </div>

        {/* Risk Management */}
        <div style={card}>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem", marginBottom: 14 }}>
            Risk Management Rules
          </div>
          <RuleRow rule="Daily Loss Limit"      detail="Stop all trading if P&L hits −₹5,000 for the session" />
          <RuleRow rule="Max Open Positions"    detail="3 concurrent (futures + options combined)" />
          <RuleRow rule="No Overnight Futures"  detail="All Nifty / BankNifty futures squared off intraday (MIS)" />
          <RuleRow rule="Expiry-Day Caution"    detail="Reduce size 50% on weekly expiry after 13:00 IST" />
          <RuleRow rule="High-VIX Circuit"      detail="VIX > 20 → disable option buying; scalp futures only" />
          <RuleRow rule="Dry-Run Validation"    detail="Every new config must run ≥ 1 session in dry_run=true first" />
          <RuleRow rule="Max Lots — Futures"    detail="1 lot base; 2–3 lots only after 2 confirming bars" />
          <RuleRow rule="Max Lots — Options"    detail="2 lots max simultaneously" />
          <RuleRow rule="Hard Time Stop"        detail="No new intraday entries after 14:00 IST; square off by 15:15 IST" />
        </div>

      </div>
    </div>
  );
}
