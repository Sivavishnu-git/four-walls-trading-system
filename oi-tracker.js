/**
 * oi-tracker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls NIFTY / BANKNIFTY / SENSEX futures OI every 3 minutes
 * during market hours (09:15 – 15:30 IST) and stores snapshots in SQLite.
 * At 15:35 IST the DB is gzip-compressed and uploaded to S3.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database   from "better-sqlite3";
import zlib       from "zlib";
import fs         from "fs";
import path       from "path";
import { fileURLToPath } from "url";
import { promisify }     from "util";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import axios from "axios";

const gzip      = promisify(zlib.gzip);
const rootDir   = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(rootDir, "data", "future_oi.db");
const S3_BUCKET = process.env.S3_BUCKET || "four-walls-oi-backup";
const S3_REGION = process.env.AWS_REGION  || "ap-south-1";

// ── IST helpers ───────────────────────────────────────────────────────────────
function nowIST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function istHHMM(d = nowIST()) {
  return d.getHours() * 100 + d.getMinutes(); // e.g. 915, 1530
}

function isMarketOpen() {
  const t = istHHMM();
  return t >= 915 && t <= 1530;
}

function isBackupTime() {
  const t = istHHMM();
  return t >= 1535 && t <= 1540; // 15:35–15:40 IST window
}

// ── SQLite setup ──────────────────────────────────────────────────────────────
function openDB() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS future_oi (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      date       TEXT    NOT NULL,
      time       TEXT    NOT NULL,
      symbol     TEXT    NOT NULL,
      expiry     TEXT    NOT NULL,
      oi         INTEGER NOT NULL DEFAULT 0,
      oi_change  INTEGER NOT NULL DEFAULT 0,
      ltp        REAL    NOT NULL DEFAULT 0,
      volume     INTEGER NOT NULL DEFAULT 0,
      exchange   TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_oi_ts     ON future_oi(ts);
    CREATE INDEX IF NOT EXISTS idx_oi_symbol ON future_oi(symbol, ts);
    CREATE INDEX IF NOT EXISTS idx_oi_date   ON future_oi(date);
  `);
  return db;
}

const db = openDB();

const insertRow = db.prepare(`
  INSERT INTO future_oi (ts, date, time, symbol, expiry, oi, oi_change, ltp, volume, exchange)
  VALUES (@ts, @date, @time, @symbol, @expiry, @oi, @oi_change, @ltp, @volume, @exchange)
`);

// Keep last OI per symbol for computing oi_change
const lastOI = {};

// ── Futures to track ──────────────────────────────────────────────────────────
// { name, exchange, masterExchange }
const FUTURES = [
  { name: "NIFTY",     exchange: "NFO", masterExchange: "NFO" },
  { name: "BANKNIFTY", exchange: "NFO", masterExchange: "NFO" },
  { name: "SENSEX",    exchange: "BFO", masterExchange: "BFO" },
];

// Cache resolved instrument keys (refreshed daily)
let resolvedKeys   = null;   // { NIFTY: { instrument_key, trading_symbol, expiry }, ... }
let keysCachedDate = null;

// ── Resolve nearest-expiry futures keys ───────────────────────────────────────
async function resolveKeys(getMasterData) {
  const today = nowIST().toDateString();
  if (resolvedKeys && keysCachedDate === today) return resolvedKeys;

  const [nfoData, bfoData] = await Promise.all([
    getMasterData("NFO"),
    getMasterData("BFO"),
  ]);

  const resolved = {};
  for (const fut of FUTURES) {
    const masterData = fut.masterExchange === "BFO" ? bfoData : nfoData;
    if (!masterData) { console.warn(`[OI] No master data for ${fut.masterExchange}`); continue; }

    const candidates = masterData.filter(
      (i) => i.name === fut.name && i.instrument_type === "FUT"
    );
    if (!candidates.length) { console.warn(`[OI] No FUT found for ${fut.name}`); continue; }

    candidates.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    const near = candidates[0];
    resolved[fut.name] = {
      instrument_key:  near.instrument_key,
      trading_symbol:  near.trading_symbol,
      expiry:          near.expiry || "",
      exchange:        fut.exchange,
    };
    console.log(`[OI] Resolved ${fut.name} → ${near.trading_symbol} (${near.instrument_key})`);
  }

  resolvedKeys   = resolved;
  keysCachedDate = today;
  return resolved;
}

// ── Fetch live quotes for all 3 futures in one call ───────────────────────────
async function fetchOISnapshot(accessToken, getMasterData) {
  try {
    const keys = await resolveKeys(getMasterData);
    const instrumentKeys = Object.values(keys).map((k) => k.instrument_key).join(",");
    if (!instrumentKeys) return;

    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKeys)}`;
    const res = await axios.get(url, {
      headers: { Authorization: accessToken, Accept: "application/json" },
      timeout: 8000,
    });

    const data = res.data?.data || {};
    const now  = nowIST();
    const ts   = now.getTime();
    const date = now.toLocaleDateString("en-CA");                  // YYYY-MM-DD
    const time = now.toLocaleTimeString("en-IN", { hour12: false }); // HH:MM:SS

    const insertMany = db.transaction((rows) => { for (const r of rows) insertRow.run(r); });
    const rows = [];

    for (const [name, meta] of Object.entries(keys)) {
      const q = data[meta.instrument_key] || Object.values(data).find(
        (v) => String(v.instrument_token || "") === String(meta.instrument_key)
      );
      if (!q) { console.warn(`[OI] No quote for ${name}`); continue; }

      const oi       = Number(q.oi        || 0);
      const ltp      = Number(q.last_price || 0);
      const volume   = Number(q.volume     || 0);
      const oi_change = oi - (lastOI[name] ?? oi);
      lastOI[name]   = oi;

      rows.push({ ts, date, time, symbol: name, expiry: String(meta.expiry), oi, oi_change, ltp, volume, exchange: meta.exchange });
      console.log(`[OI] ${name} | OI: ${oi.toLocaleString()} (${oi_change >= 0 ? "+" : ""}${oi_change}) | LTP: ${ltp}`);
    }

    if (rows.length) insertMany(rows);
  } catch (err) {
    console.error("[OI] Snapshot error:", err.message);
  }
}

// ── S3 backup ─────────────────────────────────────────────────────────────────
let backupDoneDate = null;

async function backupToS3() {
  const today = nowIST().toDateString();
  if (backupDoneDate === today) return; // already backed up today

  try {
    console.log("[OI] Starting S3 backup…");
    const raw        = fs.readFileSync(DB_PATH);
    const compressed = await gzip(raw);
    const key        = `oi-backups/future_oi-${nowIST().toLocaleDateString("en-CA")}.db.gz`;

    const s3 = new S3Client({ region: S3_REGION });
    await s3.send(new PutObjectCommand({
      Bucket:      S3_BUCKET,
      Key:         key,
      Body:        compressed,
      ContentType: "application/gzip",
    }));

    backupDoneDate = today;
    console.log(`[OI] ✅ Backup uploaded → s3://${S3_BUCKET}/${key} (${(compressed.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error("[OI] S3 backup error:", err.message);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
const POLL_MS    = 3 * 60 * 1000; // 3 minutes
let   pollTimer  = null;

export function startOITracker({ getAccessToken, getMasterData }) {
  console.log("[OI] Tracker started — polling every 3 min during market hours (09:15–15:30 IST)");

  const tick = async () => {
    const token = getAccessToken();
    if (!token) { console.warn("[OI] No access token, skipping tick"); return; }

    if (isMarketOpen()) {
      await fetchOISnapshot(token, getMasterData);
    }

    if (isBackupTime()) {
      await backupToS3();
    }
  };

  // Run immediately if market is open, then every 3 min
  tick();
  pollTimer = setInterval(tick, POLL_MS);
}

export function stopOITracker() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  db.close();
  console.log("[OI] Tracker stopped");
}

// ── Read API helpers (used by /api/oi/history endpoint) ───────────────────────
export function getOIHistory({ symbol, date, limit = 200 }) {
  if (symbol && date) {
    return db.prepare(
      "SELECT * FROM future_oi WHERE symbol = ? AND date = ? ORDER BY ts ASC LIMIT ?"
    ).all(symbol, date, limit);
  }
  if (date) {
    return db.prepare(
      "SELECT * FROM future_oi WHERE date = ? ORDER BY ts ASC LIMIT ?"
    ).all(date, limit);
  }
  if (symbol) {
    return db.prepare(
      "SELECT * FROM future_oi WHERE symbol = ? ORDER BY ts DESC LIMIT ?"
    ).all(symbol, limit);
  }
  return db.prepare(
    "SELECT * FROM future_oi ORDER BY ts DESC LIMIT ?"
  ).all(limit);
}

export function getLatestOI() {
  return db.prepare(`
    SELECT f.* FROM future_oi f
    INNER JOIN (
      SELECT symbol, MAX(ts) AS max_ts FROM future_oi GROUP BY symbol
    ) latest ON f.symbol = latest.symbol AND f.ts = latest.max_ts
    ORDER BY f.symbol
  `).all();
}
