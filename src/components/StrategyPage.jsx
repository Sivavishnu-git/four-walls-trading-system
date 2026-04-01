import { useState } from "react";
import { ChevronDown, CircleHelp, Play } from "lucide-react";

const STRATEGIES = [
  {
    id: "buy",
    name: "nifty_futures_strategy_buy",
    description:
      "Long NIFTY futures when session bias is up, OI builds on calls, and price holds above opening range — confirm before sizing.",
    side: "buy",
    defaultCapital: 50000,
  },
  {
    id: "sell",
    name: "nifty_futures_strategy_sell",
    description:
      "Short NIFTY futures when trend rolls over, put OI expands, and price fails at resistance — use defined stop.",
    side: "sell",
    defaultCapital: 75000,
  },
];

export function StrategyPage() {
  return (
    <div className="strategy-control">
      <header className="strategy-control-header">
        <div className="strategy-control-header-row">
          <h1 className="strategy-control-title">Options Strategy Control</h1>
          <button type="button" className="strategy-control-guide-btn">
            <CircleHelp size={16} strokeWidth={2} />
            Strategy guide
          </button>
        </div>
        <p className="strategy-control-hint">
          Start NIFTY strategies before 9:30 AM; paper mode is safe for rehearsal. Wire each card to your execution
          backend when ready.
        </p>
      </header>

      <ul className="strategy-control-list">
        {STRATEGIES.map((s) => (
          <StrategyCard key={s.id} strategy={s} />
        ))}
      </ul>
    </div>
  );
}

function StrategyCard({ strategy }) {
  const [mode, setMode] = useState("DEMO");
  const [capital, setCapital] = useState(String(strategy.defaultCapital));
  const [status, setStatus] = useState("idle");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isBuy = strategy.side === "buy";

  const handleRun = () => {
    setStatus("running");
    window.setTimeout(() => setStatus("idle"), 1200);
  };

  return (
    <li
      className={`strategy-card-pro ${isBuy ? "strategy-card-pro--buy" : "strategy-card-pro--sell"}`}
    >
      <div className="strategy-card-pro-main">
        <div className="strategy-card-pro-info">
          <code className="strategy-card-pro-name">{strategy.name}</code>
          <p className="strategy-card-pro-desc">{strategy.description}</p>
          <div className="strategy-card-pro-tags">
            <span className={`strategy-tag ${isBuy ? "strategy-tag--buy" : "strategy-tag--sell"}`}>
              {isBuy ? "BUY" : "SELL"}
            </span>
            <span className="strategy-tag strategy-tag--neutral">NSE</span>
          </div>
        </div>

        <div className="strategy-card-pro-actions">
          <select
            className="strategy-card-pro-select"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            aria-label="Execution mode"
          >
            <option value="DEMO">DEMO</option>
            <option value="LIVE">LIVE</option>
          </select>

          <label className="strategy-card-pro-capital">
            <span className="strategy-card-pro-rupee">₹</span>
            <input
              type="text"
              inputMode="numeric"
              value={capital}
              onChange={(e) => setCapital(e.target.value.replace(/[^\d]/g, ""))}
              aria-label="Notional capital"
            />
          </label>

          <button
            type="button"
            className="strategy-card-pro-run"
            onClick={handleRun}
            disabled={status === "running"}
          >
            <Play size={16} strokeWidth={2.25} fill="currentColor" />
            Run
          </button>

          <div className="strategy-card-pro-status" data-status={status}>
            <span className="strategy-card-pro-status-dot" />
            {status === "running" ? "Running…" : "Idle"}
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`strategy-card-pro-advanced ${advancedOpen ? "strategy-card-pro-advanced--open" : ""}`}
        onClick={() => setAdvancedOpen((o) => !o)}
        aria-expanded={advancedOpen}
      >
        <span>Advanced</span>
        <ChevronDown size={18} strokeWidth={2} className="strategy-card-pro-chevron" />
      </button>

      {advancedOpen ? (
        <div className="strategy-card-pro-advanced-panel">
          <p className="strategy-card-pro-advanced-note">
            Hooks for slippage cap, max legs, and order tags — connect in <code>proxy-server</code> or your worker when
            you automate.
          </p>
        </div>
      ) : null}
    </li>
  );
}
