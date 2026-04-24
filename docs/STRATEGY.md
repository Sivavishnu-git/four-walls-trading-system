# Four Walls Trading System — Strategy Document

Trading strategies implemented and supported by the Four Walls Trading System.

---

## 1. Core Philosophy

The system is built around **open-interest (OI) flow analysis** on Nifty futures as the primary signal source. OI reflects the net positioning of market participants; rapid build-up or unwinding of OI at key levels — especially around pivots and ATM strikes — indicates conviction or capitulation that precedes price moves. Order execution is automated but safety-gated (`dry_run` default) so strategies can be validated in simulation before going live.

---

## 2. Instruments Covered

| Instrument | Segment | Primary Use |
|------------|---------|-------------|
| Nifty 50 Futures (NFO) | Index Futures | OI trend tracking, entry timing |
| Bank Nifty Futures (NFO) | Index Futures | OI cross-reference |
| Sensex Futures/Options (BFO) | Index Options | OI comparison, option chain reads |
| Nifty ATM Options (NFO) | Index Options | Directional entry, intraday scalps |
| MCX Commodities (MCX) | Commodity Futures | Sandbox / paper trading |

---

## 3. Strategy 1 — OI Trend Following (Primary)

### Objective
Trade Nifty futures in the direction of sustained OI build-up, confirmed by price cooperation.

### Signal Generation
1. **Snapshot cadence**: OI is captured every **3 minutes** from 09:15 to 15:30 IST via `oi-tracker.js` and the `OIMonitor` UI.
2. **Baseline**: First snapshot of the session becomes the reference (Δ OI from open).
3. **Trend condition**: OI increasing + price increasing → long bias (fresh longs). OI increasing + price decreasing → short bias (fresh shorts).
4. **Reversal condition**: OI decreasing rapidly (short covering or long unwinding) + price moving strongly → counter-trend momentum scalp.

### Entry Rules
- Minimum OI change: **+2% vs session open** before considering a directional trade.
- Price must cooperate within the **same 3-minute bar** that triggers the signal.
- Enter on next 1-minute candle open after confirmation.
- Preferred entry window: **09:30–11:30 IST** (highest OI velocity) and **13:30–14:30 IST** (expiry positioning).

### Exit Rules
- **Target**: 15–20 Nifty points for intraday scalps; trail with 3-min OI reversal for swing legs.
- **Stop-loss**: Opposite side OI build exceeds signal OI by 1.5× or price closes below entry pivot.
- **Time stop**: Exit all intraday positions before **15:15 IST**.

### Position Sizing
- Max 1 lot per strategy instance from the order bot.
- Scale to 2–3 lots only when two consecutive 3-min snapshots confirm trend direction.

---

## 4. Strategy 2 — ATM Options Intraday (Directional)

### Objective
Buy ATM CE or PE on Nifty for intraday moves using option chain OI skew as a directional filter.

### Signal Generation
- Read from `NiftyATMEntry.jsx`: identify the ATM strike (nearest to current Nifty LTP).
- **CE bias**: ATM PE OI > ATM CE OI by ≥ 20% → market makers are net short puts → bullish skew → buy CE.
- **PE bias**: ATM CE OI > ATM PE OI by ≥ 20% → bearish skew → buy PE.
- Cross-check with OI trend direction from Strategy 1 before entering.

### Entry Rules
- Product: **MIS** (intraday, auto-squared off at 15:20 IST).
- Order type: **MARKET** for clean fills at open or **LIMIT** at bid+0.5 during sideways conditions.
- Enter only between **09:30–12:00 IST** to avoid theta drag during mid-session lull.

### Exit Rules
- **Target**: 30–50% gain on premium.
- **Stop-loss**: 25–30% loss on premium (hard stop).
- **Theta stop**: Exit if trade is flat by **13:00 IST** — theta decay accelerates post-noon on short-dated contracts.

### Risk Cap
- Maximum 2 option lots active simultaneously.
- No fresh option entries after **13:30 IST** on expiry day.

---

## 5. Strategy 3 — Pivot-Based Scalp

### Objective
Intraday scalps off intraday pivot levels calculated from the prior day's OHLC.

### Pivot Calculation
Handled by `PivotCalculatorPage` / `intradayPivots.js`:

```
Pivot (P) = (High + Low + Close) / 3
R1 = 2P − Low     S1 = 2P − High
R2 = P + (R1−S1)  S2 = P − (R1−S1)
```

### Entry Rules
- **Long at S1/S2**: Price touches support + OI starts building (fresh longs entering).
- **Short at R1/R2**: Price touches resistance + OI starts building (fresh shorts entering).
- Confirmation: 3-min bar closes back inside the pivot range after a wick test.

### Exit Rules
- Target: next pivot level.
- Stop: 10 points beyond the pivot touched.

---

## 6. Order Bot Configuration

The automated order bot (`proxy-server.js`, `/api/bot/order/*`) executes strategies programmatically.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `dry_run` | `true` | Must explicitly set `false` for live orders |
| `interval_seconds` | `180` | Matches the 3-min OI snapshot cadence |
| `max_orders` | `20` | Per bot instance; prevents runaway loops |
| `product` | `MIS` | Change to `NRML` for overnight/positional |
| `order_type` | `MARKET` | `LIMIT` available for option entries |

**Start a bot instance:**
```bash
POST /api/bot/order/start
{
  "instrument_token": "NSE_FO|<token>",
  "transaction_type": "BUY",
  "quantity": 50,
  "product": "MIS",
  "order_type": "MARKET",
  "dry_run": false,
  "interval_seconds": 180,
  "max_orders": 5
}
```

**Monitor:**
```bash
GET /api/bot/order/list
GET /api/bot/order/:botId/status
```

**Stop:**
```bash
POST /api/bot/order/:botId/stop
```

---

## 7. Risk Management

| Rule | Detail |
|------|--------|
| **Daily loss limit** | Stop all trading if combined P&L hits −₹5,000 for the session |
| **Max open positions** | 3 concurrent positions (futures + options combined) |
| **No overnight futures** | All Nifty/BankNifty futures positions to be squared off intraday (MIS) |
| **Expiry-day caution** | Reduce size by 50% on weekly expiry day after 13:00 IST |
| **Circuit-breaker** | If VIX > 20 intraday, disable option buying; only scalp futures |
| **Dry-run validation** | Every new strategy configuration must run ≥ 1 session in `dry_run=true` before going live |

---

## 8. Data Persistence & Audit

- **SQLite** (`oi-tracker.js`): OI snapshots stored locally for post-session analysis.
- **S3 backup**: Gzip-compressed SQLite snapshot uploaded at 15:35 IST each day.
- **localStorage** (browser): Up to 200 rows of OI change history per instrument for same-session reference.
- **Order log**: In-memory per bot instance; export via `/api/bot/order/:botId/status` before restarting the server.

---

## 9. Session Checklist

Before market open (09:00 IST):
- [ ] Upstox OAuth token refreshed (login via UI).
- [ ] OI tracker process running (`pm2 status`).
- [ ] WebSocket feed connected (check `upstox-feed.js` logs).
- [ ] Prior-day pivots loaded in `PivotCalculatorPage`.
- [ ] `dry_run` flag confirmed for all bot instances.

During session:
- [ ] Monitor OI Change History table in `OIMonitor` for trend confirmation.
- [ ] Cross-check ATM skew before option entries.
- [ ] Honour time stops — no new intraday entries after 14:00 IST.

After market close (15:35 IST):
- [ ] Confirm S3 backup uploaded.
- [ ] Review order log and P&L via `OrderAnalysisPage`.
- [ ] Note any strategy deviations for next-session calibration.
