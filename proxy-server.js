import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import querystring from "querystring";
import zlib from "zlib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import crypto from "crypto";
import { setTimeout as sleep } from "timers/promises";
import { updateEnvToken } from "./utils/tokenManager.js";
import { computeIntradayPivots } from "./src/utils/intradayPivots.js";

const gunzip = promisify(zlib.gunzip);

const rootDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });

const app = express();
// Avoid 304 + empty body on /api when JSON is unchanged (breaks fetch().json()).
app.set("etag", false);
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
  }
  next();
});

// --- MASTER LIST CACHE (using complete.json.gz) ---
const COMPLETE_CACHE = { data: null, lastFetched: null };
const COMPLETE_URL = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

const loadCompleteData = async () => {
  const today = new Date().toDateString();
  if (COMPLETE_CACHE.data && COMPLETE_CACHE.lastFetched === today) {
    return COMPLETE_CACHE.data;
  }
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`📥 Downloading Complete Master List (attempt ${attempt}/${maxAttempts})...`);
      const response = await axios.get(COMPLETE_URL, {
        responseType: "arraybuffer",
        timeout: 60000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "*/*",
        },
      });
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }
      const decompressed = await gunzip(response.data);
      const data = JSON.parse(decompressed.toString());
      if (!Array.isArray(data)) {
        throw new Error("Master list JSON is not an array");
      }
      COMPLETE_CACHE.data = data;
      COMPLETE_CACHE.lastFetched = today;
      console.log(`✅ Loaded ${data.length} instruments`);
      return data;
    } catch (err) {
      const detail = err.response?.status ?? err.code ?? err.message;
      console.error(`Master list fetch attempt ${attempt}/${maxAttempts} failed:`, detail);
      if (attempt < maxAttempts) {
        await sleep(1500 * attempt);
      } else {
        console.error("Error fetching master list (giving up):", err.message);
        return COMPLETE_CACHE.data;
      }
    }
  }
  return COMPLETE_CACHE.data;
};

const getMasterData = async (exchange) => {
  const allData = await loadCompleteData();
  if (!allData) return null;
  const segmentMap = { NFO: "NSE_FO", NSE: "NSE_EQ" };
  const segment = segmentMap[exchange] || exchange;
  return allData.filter(i => i.segment === segment);
};

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_ID = process.env.UPSTOX_API_KEY;
const CLIENT_SECRET = process.env.UPSTOX_API_SECRET;
const REDIRECT_URI =
  process.env.UPSTOX_REDIRECT_URI || "http://localhost:3000/api/auth/callback";
const IS_PROD = process.env.NODE_ENV === "production";
const FRONTEND_URI = IS_PROD
  ? (process.env.FRONTEND_URI || `http://localhost:${PORT}`)
  : (process.env.FRONTEND_URI || "http://localhost:5173");
const FALLBACK_ACCESS_TOKEN = process.env.UPSTOX_ACCESS_TOKEN
  ? (process.env.UPSTOX_ACCESS_TOKEN.startsWith("Bearer ")
    ? process.env.UPSTOX_ACCESS_TOKEN
    : `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`)
  : "";
const DEFAULT_MCX_BASE_KEY = "MCX_FO|554671";

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

/** No external deps — use to verify Node is up (ALB/nginx can still use GET / on port 80). */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "livetrading-proxy" });
});

// --- SIMPLE ORDER BOT (in-memory; reset on process restart) ---
const ORDER_BOTS = new Map();

function normalizeAuthHeader(headerValue) {
  if (!headerValue || typeof headerValue !== "string") return "";
  return headerValue.startsWith("Bearer ") ? headerValue : `Bearer ${headerValue}`;
}

function buildOrderPayload(raw) {
  return {
    instrument_token: String(raw.instrument_token || "").trim(),
    quantity: Number(raw.quantity),
    product: String(raw.product || "I").toUpperCase(),
    validity: String(raw.validity || "DAY").toUpperCase(),
    price: Number(raw.price || 0),
    order_type: String(raw.order_type || "MARKET").toUpperCase(),
    transaction_type: String(raw.transaction_type || "BUY").toUpperCase(),
    disclosed_quantity: Number(raw.disclosed_quantity || 0),
    trigger_price: Number(raw.trigger_price || 0),
    is_amo: Boolean(raw.is_amo || false),
    tag: raw.tag ? String(raw.tag).slice(0, 20) : undefined,
  };
}

function validateOrderPayload(payload) {
  if (!payload.instrument_token) return "instrument_token is required";
  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) return "quantity must be > 0";
  if (!["I", "D", "MTF"].includes(payload.product)) return "product must be I, D, or MTF";
  if (!["DAY", "IOC"].includes(payload.validity)) return "validity must be DAY or IOC";
  if (!["MARKET", "LIMIT", "SL", "SL-M"].includes(payload.order_type)) return "invalid order_type";
  if (!["BUY", "SELL"].includes(payload.transaction_type)) return "transaction_type must be BUY or SELL";
  return "";
}

app.post("/api/bot/order/start", async (req, res) => {
  try {
    const authHeader = normalizeAuthHeader(req.headers.authorization);
    const {
      bot_id,
      interval_sec = 180,
      max_orders = 20,
      dry_run = true,
      ...rawOrder
    } = req.body || {};

    const orderPayload = buildOrderPayload(rawOrder);
    const err = validateOrderPayload(orderPayload);
    if (err) return res.status(400).json({ error: err });

    if (!dry_run && !authHeader) {
      return res.status(400).json({ error: "Authorization header required when dry_run=false" });
    }

    const intervalMs = Math.max(15, Number(interval_sec)) * 1000;
    const maxOrders = Math.max(1, Number(max_orders));
    const botId = (bot_id && String(bot_id).trim()) || `bot_${Date.now()}`;

    if (ORDER_BOTS.has(botId)) {
      return res.status(409).json({ error: `bot_id already running: ${botId}` });
    }

    const state = {
      bot_id: botId,
      dry_run: Boolean(dry_run),
      interval_sec: intervalMs / 1000,
      max_orders: maxOrders,
      order_payload: orderPayload,
      started_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + intervalMs).toISOString(),
      runs: 0,
      success: 0,
      failed: 0,
      last_result: null,
      logs: [],
      timer: null,
    };

    const runOnce = async () => {
      state.runs += 1;
      state.next_run_at = new Date(Date.now() + intervalMs).toISOString();
      try {
        let result;
        if (state.dry_run) {
          result = {
            status: "dry_run",
            message: "No live order sent",
            payload: state.order_payload,
            simulated_at: new Date().toISOString(),
          };
        } else {
          const upstoxRes = await axios.post(
            "https://api.upstox.com/v2/order/place",
            state.order_payload,
            {
              headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            },
          );
          result = upstoxRes.data;
        }
        state.success += 1;
        state.last_result = result;
        state.logs.push({ ts: new Date().toISOString(), ok: true, result });
      } catch (e) {
        state.failed += 1;
        const errorData = e.response?.data || e.message;
        state.last_result = { error: errorData };
        state.logs.push({ ts: new Date().toISOString(), ok: false, error: errorData });
      }

      if (state.logs.length > 50) state.logs = state.logs.slice(-50);
      if (state.runs >= state.max_orders) {
        clearInterval(state.timer);
        state.timer = null;
      }
    };

    // Fire once immediately, then continue on interval
    await runOnce();
    if (state.runs < state.max_orders) {
      state.timer = setInterval(runOnce, intervalMs);
    }
    ORDER_BOTS.set(botId, state);

    res.json({
      status: "started",
      bot_id: botId,
      dry_run: state.dry_run,
      interval_sec: state.interval_sec,
      max_orders: state.max_orders,
      first_run_result: state.last_result,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to start order bot" });
  }
});

app.get("/api/bot/order/list", (_req, res) => {
  const bots = Array.from(ORDER_BOTS.values()).map((b) => ({
    bot_id: b.bot_id,
    dry_run: b.dry_run,
    started_at: b.started_at,
    interval_sec: b.interval_sec,
    max_orders: b.max_orders,
    runs: b.runs,
    success: b.success,
    failed: b.failed,
    running: Boolean(b.timer),
    next_run_at: b.next_run_at,
  }));
  res.json({ status: "success", bots });
});

app.get("/api/bot/order/:botId/status", (req, res) => {
  const bot = ORDER_BOTS.get(req.params.botId);
  if (!bot) return res.status(404).json({ error: "bot not found" });
  res.json({
    status: "success",
    bot: {
      bot_id: bot.bot_id,
      dry_run: bot.dry_run,
      started_at: bot.started_at,
      interval_sec: bot.interval_sec,
      max_orders: bot.max_orders,
      runs: bot.runs,
      success: bot.success,
      failed: bot.failed,
      running: Boolean(bot.timer),
      next_run_at: bot.next_run_at,
      order_payload: bot.order_payload,
      last_result: bot.last_result,
      logs: bot.logs,
    },
  });
});

app.post("/api/bot/order/:botId/stop", (req, res) => {
  const bot = ORDER_BOTS.get(req.params.botId);
  if (!bot) return res.status(404).json({ error: "bot not found" });
  if (bot.timer) {
    clearInterval(bot.timer);
    bot.timer = null;
  }
  res.json({ status: "stopped", bot_id: bot.bot_id, runs: bot.runs });
});

// --- AUTH ENDPOINTS ---

// In-memory map of OAuth state -> frontend origin to avoid global cross-user leakage
const OAUTH_STATE_STORE = new Map();

// 1. Redirect browser to Upstox OAuth; after approval, /api/auth/callback exchanges ?code for access_token
//    and redirects to FRONTEND_URI?token=<access_token>.
app.get("/api/auth/login", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(503).json({
      error:
        "Missing UPSTOX_API_KEY or UPSTOX_API_SECRET on the server. Set them in .env and restart Node.",
    });
  }

  let frontendOrigin = FRONTEND_URI;
  const referer = req.headers.referer || req.headers.origin;
  if (referer) {
    try {
      const url = new URL(referer);
      frontendOrigin = `${url.protocol}//${url.host}`;
    } catch {
      // ignore malformed referer and fall back to default
    }
  }

  const state = crypto.randomBytes(16).toString("hex");
  OAUTH_STATE_STORE.set(state, frontendOrigin);

  const params = querystring.stringify({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state,
  });
  const loginUrl = `https://api.upstox.com/v2/login/authorization/dialog?${params}`;
  console.log("Redirecting to Upstox Login:", loginUrl);
  res.redirect(loginUrl);
});

// 2. Handle Callback & Exchange Code
app.get("/api/auth/callback", async (req, res) => {
  const { code, error, state } = req.query;

  let redirectBase = FRONTEND_URI;
  if (state && OAUTH_STATE_STORE.has(state)) {
    redirectBase = OAUTH_STATE_STORE.get(state) || FRONTEND_URI;
    OAUTH_STATE_STORE.delete(state);
  }

  if (error) {
    return res.redirect(`${redirectBase}?error=${error}`);
  }

  if (!code) {
    return res.redirect(`${redirectBase}?error=no_code`);
  }

  try {
    const tokenUrl = "https://api.upstox.com/v2/login/authorization/token";
    const data = querystring.stringify({
      code: code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    });

    console.log("Exchanging code for token...");

    const response = await axios.post(tokenUrl, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    const accessToken = response.data.access_token;
    console.log("Access Token received");

    // Automatically update .env file with new token
    const tokenUpdated = updateEnvToken(accessToken);
    if (tokenUpdated) {
      console.log("✅ Token automatically saved to .env file");
      console.log("⚠️  Frontend will use this token after restart");
    }

    res.redirect(`${redirectBase}?token=${accessToken}`);
  } catch (err) {
    console.error(
      "Token Exchange Error:",
      err.response ? err.response.data : err.message,
    );
    res.redirect(`${redirectBase}?error=token_exchange_failed`);
  }
});

// Proxy Endpoint for Historical Data
app.get("/api/historical", async (req, res) => {
  try {
    const { instrument_key, interval, to_date, from_date } = req.query;
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

    const ik = instrument_key != null ? String(instrument_key).trim() : "";
    if (!ik) {
      return res.status(400).json({
        status: "error",
        error: "instrument_key is required (e.g. NIFTY future key from discover).",
      });
    }
    if (!interval || !to_date || !from_date) {
      return res.status(400).json({
        status: "error",
        error: "interval, to_date, and from_date are required.",
      });
    }

    const ikSeg = encodeURIComponent(ik);
    const targetUrl = `https://api.upstox.com/v2/historical-candle/${ikSeg}/${interval}/${to_date}/${from_date}`;
    console.log("Fetching Historical Data (V2):", targetUrl);

    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
      },
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("Historical Data Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// Tool Endpoint: Auto-Discover Recent Nifty Future Key using NFO Master List
app.get("/api/tools/discover-nifty-future", async (req, res) => {
  try {
    const instruments = await getMasterData("NFO");
    if (!instruments) {
      return res.status(503).json({
        status: "error",
        error:
          "Could not load NFO master list from Upstox (assets.upstox.com). Check server outbound HTTPS/DNS and PM2 logs.",
      });
    }

    // Filter for NIFTY Futures
    const niftyFutures = instruments.filter(
      (i) => i.name === "NIFTY" && i.instrument_type === "FUT"
    );

    if (niftyFutures.length === 0) {
      return res.status(404).json({ error: "No Nifty Futures found in master list" });
    }

    // Sort by expiry to get the nearest one
    niftyFutures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

    const currentFuture = niftyFutures[0];
    console.log("✅ Discovered Current Future:", currentFuture.trading_symbol, currentFuture.instrument_key);

    res.json({
      status: "success",
      data: {
        ...currentFuture,
        ...buildFuturePayload(currentFuture),
      },
    });
  } catch (error) {
    console.error("Discovery Error:", error.message);
    res.status(500).json({ error: "Failed to discover instruments: " + error.message });
  }
});

// Tool Endpoint: Universal Instrument Search (Master List based)
app.get("/api/tools/search-master", async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) return res.json({ status: "success", data: [] });

    const searchTerm = query.toUpperCase();

    // Load both NSE and NFO
    const [nseData, nfoData] = await Promise.all([
      getMasterData("NSE"),
      getMasterData("NFO")
    ]);

    const allInstruments = [...(nseData || []), ...(nfoData || [])];

    const results = allInstruments
      .filter(i =>
        (i.trading_symbol && i.trading_symbol.includes(searchTerm)) ||
        (i.name && i.name.toUpperCase().includes(searchTerm))
      )
      .slice(0, 15) // Performance limit
      .map(i => ({
        symbol: i.trading_symbol,
        key: i.instrument_key,
        name: i.name,
        expiry: i.expiry,
        type: i.instrument_type,
        segment: i.segment
      }));

    res.json({ status: "success", data: results });
  } catch (err) {
    console.error("Master Search Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy Endpoint for Instrument Search
app.get("/api/search", async (req, res) => {
  try {
    const { symbol } = req.query;
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

    // Using V2 search API which is standard for Upstox
    const targetUrl = `https://api.upstox.com/v2/market/instrument/search?symbol=${symbol}`;
    console.log("Searching Instrument:", targetUrl);

    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
      },
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("Search Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// Proxy Endpoint for Market Quotes (Polling)
app.get("/api/quotes", async (req, res) => {
  try {
    const { instrument_keys } = req.query;
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

    // Upstox Quotes API V2
    const targetUrl = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${instrument_keys}`;
    console.log("Fetching Quotes:", targetUrl);

    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
      },
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("Quotes Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// Proxy Endpoint for Placing Orders
app.post("/api/order/place", async (req, res) => {
  try {
    const accessToken = req.headers.authorization || FALLBACK_ACCESS_TOKEN;

    if (!accessToken) {
      return res.status(400).json({
        error: "Missing Authorization Header and UPSTOX_ACCESS_TOKEN not configured on server",
      });
    }

    const orderData = req.body;

    // Validate required fields
    const requiredFields = [
      "instrument_token",
      "quantity",
      "product",
      "validity",
      "order_type",
      "transaction_type",
    ];
    for (const field of requiredFields) {
      if (!orderData[field]) {
        return res
          .status(400)
          .json({ error: `Missing required field: ${field}` });
      }
    }

    const targetUrl = "https://api.upstox.com/v2/order/place";
    console.log("Placing Order:", JSON.stringify(orderData, null, 2));

    const response = await axios.post(targetUrl, orderData, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    console.log("Order placed successfully:", response.data);
    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("Order Placement Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// Proxy Endpoint for Modifying Orders
app.put("/api/order/modify", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

    const targetUrl = "https://api.upstox.com/v2/order/modify";
    console.log("Modifying Order:", JSON.stringify(req.body, null, 2));

    const response = await axios.put(targetUrl, req.body, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    console.log("Order modified successfully:", response.data);
    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error(
      "Order Modification Error:",
      JSON.stringify(errorData, null, 2),
    );
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// Proxy Endpoint for Canceling Orders
app.delete("/api/order/cancel", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    const { order_id } = req.query;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

    if (!order_id) {
      return res.status(400).json({ error: "Missing order_id parameter" });
    }

    const targetUrl = `https://api.upstox.com/v2/order/cancel?order_id=${order_id}`;
    console.log("Canceling Order:", order_id);

    const response = await axios.delete(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
      },
    });

    console.log("Order canceled successfully:", response.data);
    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error(
      "Order Cancellation Error:",
      JSON.stringify(errorData, null, 2),
    );
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// GTT orders (Upstox v3)
app.post("/api/order/gtt/place", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }
    const body = req.body;
    const requiredFields = [
      "type",
      "quantity",
      "product",
      "instrument_token",
      "transaction_type",
      "rules",
    ];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }
    if (!Array.isArray(body.rules) || body.rules.length === 0) {
      return res.status(400).json({ error: "rules must be a non-empty array" });
    }
    const targetUrl = "https://api.upstox.com/v3/order/gtt/place";
    console.log("Placing GTT Order:", JSON.stringify(body, null, 2));
    const response = await axios.post(targetUrl, body, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("GTT Place Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

app.put("/api/order/gtt/modify", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }
    const body = req.body;
    const requiredFields = ["gtt_order_id", "type", "quantity", "rules"];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }
    if (!Array.isArray(body.rules) || body.rules.length === 0) {
      return res.status(400).json({ error: "rules must be a non-empty array" });
    }
    const targetUrl = "https://api.upstox.com/v3/order/gtt/modify";
    console.log("Modify GTT Order:", JSON.stringify(body, null, 2));
    const response = await axios.put(targetUrl, body, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("GTT Modify Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

app.get("/api/order/gtt", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }
    const { gtt_order_id } = req.query;
    const targetUrl = "https://api.upstox.com/v3/order/gtt";
    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
      },
      params: gtt_order_id ? { gtt_order_id } : {},
    });
    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("GTT List Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

app.delete("/api/order/gtt/cancel", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }
    const gtt_order_id = req.body?.gtt_order_id;
    if (!gtt_order_id) {
      return res.status(400).json({ error: "Missing gtt_order_id in body" });
    }
    const targetUrl = "https://api.upstox.com/v3/order/gtt/cancel";
    console.log("Cancel GTT Order:", gtt_order_id);
    const response = await axios.delete(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      data: { gtt_order_id },
    });
    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("GTT Cancel Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// Proxy Endpoint for Getting Order Book
app.get("/api/order/book", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

    const targetUrl = "https://api.upstox.com/v2/order/retrieve-all";
    console.log("Fetching Order Book");

    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
      },
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("Order Book Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// Proxy Endpoint for Getting Today's Orders
app.get("/api/order/today", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

    const targetUrl = "https://api.upstox.com/v2/order/retrieve-all";
    console.log("Fetching Today's Orders");

    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
      },
    });

    // Filter orders for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let todaysOrders = [];

    if (response.data && response.data.data) {
      todaysOrders = response.data.data.filter((order) => {
        if (!order.order_timestamp) return false;

        // Parse the order timestamp
        const orderDate = new Date(order.order_timestamp);
        orderDate.setHours(0, 0, 0, 0);

        return orderDate.getTime() === today.getTime();
      });

      // Sort by timestamp (most recent first)
      todaysOrders.sort((a, b) => {
        return new Date(b.order_timestamp) - new Date(a.order_timestamp);
      });
    }

    // Return formatted response
    res.json({
      status: "success",
      data: {
        total_orders: todaysOrders.length,
        date: today.toISOString().split("T")[0],
        orders: todaysOrders.map((order) => ({
          order_id: order.order_id,
          exchange_order_id: order.exchange_order_id,
          status: order.status,
          instrument_token: order.instrument_token,
          trading_symbol: order.trading_symbol,
          product: order.product,
          order_type: order.order_type,
          transaction_type: order.transaction_type,
          quantity: order.quantity,
          filled_quantity: order.filled_quantity,
          pending_quantity: order.pending_quantity,
          price: order.price,
          trigger_price: order.trigger_price,
          average_price: order.average_price,
          disclosed_quantity: order.disclosed_quantity,
          validity: order.validity,
          order_timestamp: order.order_timestamp,
          exchange_timestamp: order.exchange_timestamp,
          is_amo: order.is_amo,
          status_message: order.status_message,
          exchange: order.exchange,
        })),
      },
    });
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("Today's Orders Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// Proxy Endpoint for Getting Positions
app.get("/api/portfolio/positions", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

    const targetUrl =
      "https://api.upstox.com/v2/portfolio/short-term-positions";
    console.log("Fetching Positions");

    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
      },
    });

    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error("Positions Error:", JSON.stringify(errorData, null, 2));
    res
      .status(error.response ? error.response.status : 500)
      .json(error.response ? error.response.data : { error: "Proxy Error" });
  }
});

// ATM Options for Order Placement
app.get("/api/atm-options", async (req, res) => {
  try {
    const accessToken = req.headers.authorization || FALLBACK_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(400).json({
        error: "Missing Authorization Header and UPSTOX_ACCESS_TOKEN not configured on server",
      });
    }

    const instruments = await getMasterData("NFO");
    if (!instruments) return res.status(500).json({ error: "Could not load master list" });

    const niftyFutures = instruments.filter(i => i.name === "NIFTY" && i.instrument_type === "FUT");
    niftyFutures.sort((a, b) => a.expiry - b.expiry);
    const currentFuture = niftyFutures[0];
    if (!currentFuture) return res.status(404).json({ error: "No Nifty Future found" });

    const futKey = currentFuture.instrument_key;
    const futRes = await axios.get(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(futKey)}`,
      { headers: { Authorization: accessToken, Accept: "application/json" } }
    );

    let spotPrice = 0;
    if (futRes.data?.data) {
      const q = Object.values(futRes.data.data).find(q => q.instrument_token === futKey);
      if (q) spotPrice = q.last_price || 0;
    }
    if (!spotPrice) return res.status(500).json({ error: "Could not get Nifty Future price" });

    const atm = Math.round(spotPrice / 50) * 50;
    const nearStrikes = [atm - 100, atm - 50, atm, atm + 50, atm + 100];

    const niftyOptions = instruments.filter(
      i => i.name === "NIFTY" && (i.instrument_type === "CE" || i.instrument_type === "PE")
    );
    const expiries = [...new Set(niftyOptions.map(o => o.expiry))].sort((a, b) => a - b);
    const nearestExpiry = expiries[0];
    const expiryOpts = niftyOptions.filter(o => o.expiry === nearestExpiry);

    const optKeys = [];
    const optMeta = {};
    for (const strike of nearStrikes) {
      const ce = expiryOpts.find(o => o.strike_price === strike && o.instrument_type === "CE");
      const pe = expiryOpts.find(o => o.strike_price === strike && o.instrument_type === "PE");
      if (ce) {
        optKeys.push(ce.instrument_key);
        optMeta[ce.instrument_key] = { strike, type: "CE", symbol: ce.trading_symbol, lot_size: ce.lot_size || 65 };
      }
      if (pe) {
        optKeys.push(pe.instrument_key);
        optMeta[pe.instrument_key] = { strike, type: "PE", symbol: pe.trading_symbol, lot_size: pe.lot_size || 65 };
      }
    }

    const options = [];
    if (optKeys.length > 0) {
      const oRes = await axios.get(
        `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(optKeys.join(","))}`,
        { headers: { Authorization: accessToken, Accept: "application/json" } }
      );
      if (oRes.data?.data) {
        for (const [, q] of Object.entries(oRes.data.data)) {
          const meta = optMeta[q.instrument_token];
          if (!meta) continue;
          options.push({
            instrument_key: q.instrument_token,
            strike: meta.strike,
            type: meta.type,
            symbol: meta.symbol,
            lot_size: meta.lot_size,
            ltp: q.last_price || 0,
            oi: q.oi || 0,
            volume: q.volume || 0,
            change: q.net_change || 0,
            bid: q.depth?.buy?.[0]?.price || 0,
            ask: q.depth?.sell?.[0]?.price || 0,
          });
        }
      }
    }

    options.sort((a, b) => a.strike === b.strike ? (a.type === "CE" ? -1 : 1) : a.strike - b.strike);

    res.json({
      status: "success",
      data: {
        spot_price: spotPrice,
        atm_strike: atm,
        expiry: nearestExpiry,
        expiry_date: new Date(nearestExpiry).toLocaleDateString("en-IN"),
        future: buildFuturePayload(currentFuture),
        options,
      },
    });
  } catch (error) {
    console.error("ATM Options Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

function nearestStrike(strikes, spot) {
  if (!Array.isArray(strikes) || strikes.length === 0) return null;
  return [...strikes].sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))[0];
}

function parseExpiryMs(v) {
  if (v == null) return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return NaN;
  if (/^\d+$/.test(s)) return Number(s);
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return Date.parse(`${yyyy}-${mm}-${dd}T00:00:00+05:30`);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

function buildMoneynessSlots(strikesAsc, atmStrike, optionType) {
  const idx = strikesAsc.findIndex((x) => x === atmStrike);
  if (idx < 0) return {};
  const isCE = optionType === "CE";
  const itmDir = isCE ? -1 : 1;
  const otmDir = isCE ? 1 : -1;
  const at = (i) => (i >= 0 && i < strikesAsc.length ? strikesAsc[i] : null);
  return {
    ATM: at(idx),
    ITM1: at(idx + itmDir * 1),
    ITM2: at(idx + itmDir * 2),
    ITM3: at(idx + itmDir * 3),
    OTM1: at(idx + otmDir * 1),
  };
}

// MCX sandbox ladder for base instrument (default MCX_FO|554671)
app.get("/api/tools/mcx-sandbox-ladder", async (req, res) => {
  try {
    const accessToken = req.headers.authorization || FALLBACK_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(400).json({
        error: "Missing Authorization Header and UPSTOX_ACCESS_TOKEN not configured on server",
      });
    }

    const baseInstrumentKey = String(req.query.base_instrument_key || DEFAULT_MCX_BASE_KEY).trim();
    const optionType = String(req.query.option_type || "CE").toUpperCase() === "PE" ? "PE" : "CE";
    const allData = await loadCompleteData();
    if (!allData) return res.status(503).json({ error: "Could not load master list" });

    const base = allData.find((i) => i.instrument_key === baseInstrumentKey);
    if (!base) return res.status(404).json({ error: `Base instrument not found: ${baseInstrumentKey}` });

    const baseName = base.name;
    const mcxOptions = allData.filter((i) =>
      String(i.segment || "").startsWith("MCX") &&
      i.name === baseName &&
      i.instrument_type === optionType &&
      Number.isFinite(Number(i.strike_price)),
    );
    if (mcxOptions.length === 0) {
      return res.status(404).json({ error: `No MCX ${optionType} options found for ${baseName}` });
    }

    const now = Date.now();
    const expiries = [...new Set(mcxOptions.map((o) => parseExpiryMs(o.expiry)).filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
    const nearestExpiry = expiries.find((e) => e >= now) || expiries[0];
    const expiryOptions = mcxOptions.filter((o) => parseExpiryMs(o.expiry) === nearestExpiry);
    const strikesAsc = [...new Set(expiryOptions.map((o) => Number(o.strike_price)).filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
    if (strikesAsc.length === 0) return res.status(404).json({ error: "No strikes found for nearest expiry" });

    const quoteKey = (base.instrument_type === "CE" || base.instrument_type === "PE")
      ? (base.asset_key || baseInstrumentKey)
      : baseInstrumentKey;
    const quoteRes = await axios.get(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(quoteKey)}`,
      { headers: { Authorization: accessToken, Accept: "application/json" } },
    );
    const q = Object.values(quoteRes.data?.data || {})[0];
    const spot = Number(q?.last_price || 0);
    if (!spot) return res.status(500).json({ error: "Could not fetch base/underlying price" });

    const atmStrike = nearestStrike(strikesAsc, spot);
    const slotStrikes = buildMoneynessSlots(strikesAsc, atmStrike, optionType);
    const byStrike = new Map(expiryOptions.map((o) => [Number(o.strike_price), o]));

    const slots = Object.fromEntries(
      Object.entries(slotStrikes).map(([label, strike]) => {
        const inst = strike == null ? null : byStrike.get(strike) || null;
        return [label, inst ? {
          label,
          strike: Number(inst.strike_price),
          instrument_key: inst.instrument_key,
          trading_symbol: inst.trading_symbol,
          lot_size: Number(inst.lot_size || 1),
          type: optionType,
        } : null];
      }),
    );

    res.json({
      status: "success",
      data: {
        base: {
          instrument_key: baseInstrumentKey,
          trading_symbol: base.trading_symbol,
          name: baseName,
          segment: base.segment,
          quote_from_instrument_key: quoteKey,
          ltp: spot,
        },
        option_type: optionType,
        expiry: nearestExpiry,
        atm_strike: atmStrike,
        slots,
      },
    });
  } catch (error) {
    console.error("MCX ladder error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sandbox-oriented place order endpoint (defaults: qty=1, MARKET, Intraday)
app.post("/api/sandbox/order/place", async (req, res) => {
  try {
    const accessToken = req.headers.authorization || FALLBACK_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(400).json({
        error: "Missing Authorization Header and UPSTOX_ACCESS_TOKEN not configured on server",
      });
    }

    const body = req.body || {};
    const instrument_token = String(body.instrument_token || "").trim();
    if (!instrument_token) return res.status(400).json({ error: "instrument_token is required" });

    const payload = {
      quantity: Number(body.quantity || 1),
      product: String(body.product || "I"),
      validity: String(body.validity || "DAY"),
      price: Number(body.price || 0),
      tag: body.tag ? String(body.tag) : "mcx-sandbox-ui",
      instrument_token,
      order_type: String(body.order_type || "MARKET"),
      transaction_type: String(body.transaction_type || "BUY"),
      disclosed_quantity: Number(body.disclosed_quantity || 0),
      trigger_price: Number(body.trigger_price || 0),
      is_amo: Boolean(body.is_amo || false),
      slice: Boolean(body.slice || false),
    };

    const response = await axios.post("https://api-hft.upstox.com/v3/order/place", payload, {
      headers: {
        Authorization: accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    res.json(response.data);
  } catch (error) {
    const errorData = error.response ? error.response.data : { error: error.message };
    res.status(error.response?.status || 500).json(errorData);
  }
});

// Option Chain Endpoint
app.get("/api/option-chain", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    const { expiry_type } = req.query;

    const instruments = await getMasterData("NFO");
    if (!instruments) return res.status(500).json({ error: "Could not load NFO master list" });

    const niftyOptions = instruments.filter(
      (i) => i.name === "NIFTY" && (i.instrument_type === "CE" || i.instrument_type === "PE")
    );
    if (niftyOptions.length === 0) return res.status(404).json({ error: "No Nifty options found" });

    const expiries = [...new Set(niftyOptions.map((o) => o.expiry))].sort((a, b) => a - b);

    let targetExpiry;
    if (expiry_type === "monthly") {
      const niftyFutures = instruments.filter((i) => i.name === "NIFTY" && i.instrument_type === "FUT");
      const futExpiries = niftyFutures.map((f) => f.expiry);
      targetExpiry = expiries.find((e) => futExpiries.includes(e)) || expiries[0];
    } else {
      targetExpiry = expiries[0];
    }

    const expiryOptions = niftyOptions.filter((o) => o.expiry === targetExpiry);
    const strikes = [...new Set(expiryOptions.map((o) => o.strike_price))].sort((a, b) => a - b);

    const chainMap = {};
    for (const opt of expiryOptions) {
      if (!chainMap[opt.strike_price]) chainMap[opt.strike_price] = {};
      if (opt.instrument_type === "CE") {
        chainMap[opt.strike_price].ce_key = opt.instrument_key;
      } else {
        chainMap[opt.strike_price].pe_key = opt.instrument_key;
      }
    }

    const niftyFutures = instruments.filter((i) => i.name === "NIFTY" && i.instrument_type === "FUT");
    niftyFutures.sort((a, b) => a.expiry - b.expiry);
    const currentFuture = niftyFutures[0];

    let quotesData = {};
    if (accessToken) {
      const allKeys = [];
      if (currentFuture) allKeys.push(currentFuture.instrument_key);
      for (const strike of strikes) {
        const c = chainMap[strike];
        if (c.ce_key) allKeys.push(c.ce_key);
        if (c.pe_key) allKeys.push(c.pe_key);
      }

      const batchSize = 40;
      for (let i = 0; i < allKeys.length; i += batchSize) {
        const batch = allKeys.slice(i, i + batchSize);
        try {
          const keysParam = batch.join(",");
          const qRes = await axios.get(
            `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keysParam)}`,
            { headers: { Authorization: accessToken, Accept: "application/json" } }
          );
          if (qRes.data?.data) Object.assign(quotesData, qRes.data.data);
        } catch (qErr) {
          console.error("Quote batch error:", qErr.response?.data?.message || qErr.message);
        }
      }
    }

    let spotPrice = 0;
    if (currentFuture && quotesData) {
      const futQuote = Object.values(quotesData).find((q) => q.instrument_token === currentFuture.instrument_key);
      if (futQuote) spotPrice = futQuote.last_price || 0;
    }

    const chain = strikes.map((strike) => {
      const entry = chainMap[strike] || {};
      const ceQuote = entry.ce_key ? Object.values(quotesData).find((q) => q.instrument_token === entry.ce_key) : null;
      const peQuote = entry.pe_key ? Object.values(quotesData).find((q) => q.instrument_token === entry.pe_key) : null;
      return {
        strike,
        ce: ceQuote
          ? { oi: ceQuote.oi || 0, volume: ceQuote.volume || 0, ltp: ceQuote.last_price || 0, change: ceQuote.net_change || 0, key: entry.ce_key }
          : { oi: 0, volume: 0, ltp: 0, change: 0, key: entry.ce_key },
        pe: peQuote
          ? { oi: peQuote.oi || 0, volume: peQuote.volume || 0, ltp: peQuote.last_price || 0, change: peQuote.net_change || 0, key: entry.pe_key }
          : { oi: 0, volume: 0, ltp: 0, change: 0, key: entry.pe_key },
      };
    });

    res.json({
      status: "success",
      data: {
        spot_price: spotPrice,
        expiry: targetExpiry,
        expiry_date: new Date(targetExpiry).toLocaleDateString("en-IN"),
        future_key: currentFuture?.instrument_key,
        future_symbol: currentFuture?.trading_symbol,
        chain,
        strikes,
      },
    });
  } catch (error) {
    console.error("Option Chain Error:", error.message);
    res.status(500).json({ error: "Failed to build option chain: " + error.message });
  }
});

/** YYYY-MM-DD in Asia/Kolkata (NSE session calendar for API date params). */
function formatDateIST(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Minute-of-day in Asia/Kolkata (0–1439) for a candle timestamp */
function istMinuteOfDay(isoTs) {
  const d = new Date(isoTs);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  return h * 60 + m;
}

/**
 * Single synthetic 15-minute OHLC per session day (IST), built from fifteen 1m bars (Upstox feed).
 * Window: NSE cash-style first 15 minutes — 1m candle **open** times 9:15 … 9:29 IST (inclusive).
 * (15 bars × 1 minute = 15 minutes from 9:15 to end of 9:29 bar / start of 9:30.)
 * - O = open of 9:15 bar
 * - H / L = max high / min low across those bars
 * - C = close of 9:29 bar
 * - volume = sum of volumes
 * Picks the latest IST session date present in the feed (each trading day).
 */
function buildOpening15mOhlc(sortedOneMinCandles) {
  if (!sortedOneMinCandles?.length) return null;
  const start = 9 * 60 + 15;
  const end = 9 * 60 + 29;
  /** IST date -> candles whose open time falls in 9:15–9:29 IST */
  const byDate = {};
  for (const c of sortedOneMinCandles) {
    const mod = istMinuteOfDay(c[0]);
    if (mod < start || mod > end) continue;
    const sessionDate = formatDateIST(new Date(c[0]));
    if (!byDate[sessionDate]) byDate[sessionDate] = [];
    byDate[sessionDate].push(c);
  }
  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) return null;
  const lastDate = dates[dates.length - 1];
  const range = byDate[lastDate].sort((a, b) => new Date(a[0]) - new Date(b[0]));
  const O = range[0][1];
  const H = Math.max(...range.map((c) => c[2]));
  const L = Math.min(...range.map((c) => c[3]));
  const C = range[range.length - 1][4];
  const volume = range.reduce((s, c) => s + (Number(c[5]) || 0), 0);
  const oiLast = range[range.length - 1][6];
  const round2 = (x) => Math.round(Number(x) * 100) / 100;
  return {
    open: round2(O),
    high: round2(H),
    low: round2(L),
    close: round2(C),
    volume: Math.round(volume),
    oi_last: oiLast != null && !Number.isNaN(Number(oiLast)) ? Number(oiLast) : null,
    bar_count: range.length,
    session_date: lastDate,
    /** Last 1m bar in window opens 9:29 IST */
    formation_time_ist: "09:30",
    window_ist: "09:15–09:29",
  };
}

/** e.g. "30 MAR 26" (IST) — rolls automatically with the current month future */
function formatNiftyFutExpiryLabel(expiry) {
  if (expiry == null) return "";
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = (parts.find((p) => p.type === "month")?.value ?? "").toUpperCase();
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (!day || !month) return "";
  return `${day} ${month} ${year}`.trim();
}

function buildFuturePayload(currentFuture) {
  const expiryLabel = formatNiftyFutExpiryLabel(currentFuture.expiry);
  const displayName = expiryLabel
    ? `NIFTY FUT ${expiryLabel}`
    : currentFuture.trading_symbol;
  return {
    key: currentFuture.instrument_key,
    symbol: currentFuture.trading_symbol,
    expiry: currentFuture.expiry,
    expiry_label: expiryLabel,
    display_name: displayName,
  };
}

async function resolveCurrentNiftyFutureInstrument() {
  const instruments = await getMasterData("NFO");
  if (!instruments) return null;
  const niftyFutures = instruments.filter((i) => i.name === "NIFTY" && i.instrument_type === "FUT");
  niftyFutures.sort((a, b) => a.expiry - b.expiry);
  return niftyFutures[0] || null;
}

/** Fast live LTP for chart — polls Upstox quotes only (no heavy historical). */
app.get("/api/chart-quote", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    if (!accessToken) return res.status(400).json({ error: "Missing Authorization Header" });

    const currentFuture = await resolveCurrentNiftyFutureInstrument();
    if (!currentFuture) return res.status(404).json({ error: "No Nifty Future found" });

    const futKey = currentFuture.instrument_key;
    const quoteRes = await axios.get(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(futKey)}`,
      { headers: { Authorization: accessToken, Accept: "application/json" } },
    ).catch((e) => ({ data: null, error: e.response?.data || e.message }));

    if (!quoteRes.data?.data) {
      return res.status(502).json({ status: "error", error: "Quote unavailable" });
    }
    const q = Object.values(quoteRes.data.data).find((x) => x.instrument_token === futKey);
    if (!q) return res.status(502).json({ status: "error", error: "No quote for instrument" });

    const liveQuote = {
      ltp: q.last_price,
      oi: q.oi,
      volume: q.volume,
      open: q.ohlc?.open,
      high: q.ohlc?.high,
      low: q.ohlc?.low,
      close: q.ohlc?.close,
      change: q.net_change,
      change_pct: q.percentage_change,
    };

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.json({
      status: "success",
      data: {
        instrument_key: futKey,
        future: buildFuturePayload(currentFuture),
        live: liveQuote,
      },
    });
  } catch (error) {
    console.error("Chart quote error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Trade Setup Endpoint — Fetches pivot data, intraday candles, live quote + ATM OI
app.get("/api/trade-setup", async (req, res) => {
  try {
    const accessToken = req.headers.authorization;
    if (!accessToken) return res.status(400).json({ error: "Missing Authorization Header" });

    const instruments = await getMasterData("NFO");
    if (!instruments) return res.status(500).json({ error: "Could not load master list" });

    const niftyFutures = instruments.filter((i) => i.name === "NIFTY" && i.instrument_type === "FUT");
    niftyFutures.sort((a, b) => a.expiry - b.expiry);
    const currentFuture = niftyFutures[0];
    if (!currentFuture) return res.status(404).json({ error: "No Nifty Future found" });

    const futKey = currentFuture.instrument_key;
    const nowMs = Date.now();
    const todayIST = formatDateIST(new Date(nowMs));
    const fiveDaysAgoIST = formatDateIST(new Date(nowMs - 5 * 86400000));

    // Fetch daily candles (for pivot), intraday 1m (multi-day for opening 15m + 5m agg), live quote
    const [dailyRes, intradayRes, quoteRes] = await Promise.all([
      axios.get(`https://api.upstox.com/v2/historical-candle/${futKey}/day/${todayIST}/${fiveDaysAgoIST}`, {
        headers: { Authorization: accessToken, Accept: "application/json" }
      }).catch(e => ({ data: null, error: e.response?.data || e.message })),
      axios.get(`https://api.upstox.com/v2/historical-candle/${futKey}/1minute/${todayIST}/${fiveDaysAgoIST}`, {
        headers: { Authorization: accessToken, Accept: "application/json" }
      }).catch(e => ({ data: null, error: e.response?.data || e.message })),
      axios.get(`https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(futKey)}`, {
        headers: { Authorization: accessToken, Accept: "application/json" }
      }).catch(e => ({ data: null, error: e.response?.data || e.message })),
    ]);

    // Previous day OHLC for pivots
    let pivots = null;
    if (dailyRes.data?.data?.candles) {
      const candles = dailyRes.data.data.candles.sort((a, b) => new Date(a[0]) - new Date(b[0]));
      // Previous completed session vs today in IST (not server local TZ)
      const prevDay = candles.filter((c) => formatDateIST(new Date(c[0])) !== todayIST).pop();
      if (prevDay) {
        const [, O, H, L, C, V, OI] = prevDay;
        const levels = computeIntradayPivots(O, H, L, C);
        if (levels) {
          pivots = {
            date: prevDay[0],
            open: O,
            high: H,
            low: L,
            close: C,
            volume: V,
            oi: OI,
            ...levels,
          };
        }
      }
    }

    // Intraday 1-min candles → aggregate to 5-min + opening 15m OHLC (9:15–9:29 IST, 15×1m)
    let fiveMinCandles = [];
    let opening15mOhlc = null;
    if (intradayRes.data?.data?.candles) {
      const sorted = intradayRes.data.data.candles.sort((a, b) => new Date(a[0]) - new Date(b[0]));
      opening15mOhlc = buildOpening15mOhlc(sorted);
      const sortedToday = sorted.filter((c) => formatDateIST(new Date(c[0])) === todayIST);
      for (let i = 0; i < sortedToday.length; i += 5) {
        const batch = sortedToday.slice(i, i + 5);
        if (batch.length === 0) continue;
        fiveMinCandles.push({
          time: batch[0][0],
          open: batch[0][1],
          high: Math.max(...batch.map(c => c[2])),
          low: Math.min(...batch.map(c => c[3])),
          close: batch[batch.length - 1][4],
          volume: batch.reduce((s, c) => s + c[5], 0),
          oi: batch[batch.length - 1][6] || 0,
        });
      }
    }

    // Live quote
    let liveQuote = null;
    if (quoteRes.data?.data) {
      const q = Object.values(quoteRes.data.data).find(q => q.instrument_token === futKey);
      if (q) {
        liveQuote = {
          ltp: q.last_price, oi: q.oi, volume: q.volume,
          open: q.ohlc?.open, high: q.ohlc?.high, low: q.ohlc?.low, close: q.ohlc?.close,
          change: q.net_change, change_pct: q.percentage_change,
        };
      }
    }

    // ATM options OI (3 strikes around ATM)
    let atmOI = null;
    if (liveQuote && liveQuote.ltp > 0) {
      const atm = Math.round(liveQuote.ltp / 50) * 50;
      const nearStrikes = [atm - 100, atm - 50, atm, atm + 50, atm + 100];
      const niftyOptions = instruments.filter(
        (i) => i.name === "NIFTY" && (i.instrument_type === "CE" || i.instrument_type === "PE")
      );
      const expiries = [...new Set(niftyOptions.map(o => o.expiry))].sort((a, b) => a - b);
      const nearestExpiry = expiries[0];
      const expiryOpts = niftyOptions.filter(o => o.expiry === nearestExpiry);

      const optKeys = [];
      const optMap = {};
      for (const strike of nearStrikes) {
        const ce = expiryOpts.find(o => o.strike_price === strike && o.instrument_type === "CE");
        const pe = expiryOpts.find(o => o.strike_price === strike && o.instrument_type === "PE");
        if (ce) { optKeys.push(ce.instrument_key); optMap[ce.instrument_key] = { strike, type: "CE" }; }
        if (pe) { optKeys.push(pe.instrument_key); optMap[pe.instrument_key] = { strike, type: "PE" }; }
      }

      if (optKeys.length > 0) {
        try {
          const oRes = await axios.get(
            `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(optKeys.join(","))}`,
            { headers: { Authorization: accessToken, Accept: "application/json" } }
          );
          if (oRes.data?.data) {
            const strikes_data = {};
            for (const [, q] of Object.entries(oRes.data.data)) {
              const info = optMap[q.instrument_token];
              if (!info) continue;
              if (!strikes_data[info.strike]) strikes_data[info.strike] = { strike: info.strike };
              strikes_data[info.strike][info.type === "CE" ? "call_oi" : "put_oi"] = q.oi || 0;
              strikes_data[info.strike][info.type === "CE" ? "call_ltp" : "put_ltp"] = q.last_price || 0;
            }
            atmOI = {
              atm_strike: atm,
              expiry: nearestExpiry,
              strikes: Object.values(strikes_data).sort((a, b) => a.strike - b.strike),
            };
          }
        } catch (e) {
          console.error("ATM OI fetch error:", e.message);
        }
      }
    }

    res.json({
      status: "success",
      data: {
        future: buildFuturePayload(currentFuture),
        pivots,
        five_min_candles: fiveMinCandles,
        opening_15m_ohlc: opening15mOhlc,
        live: liveQuote,
        atm_oi: atmOI,
      },
    });
  } catch (error) {
    console.error("Trade Setup Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// In production, serve the built React frontend
if (IS_PROD) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // Express 5 / path-to-regexp v8: "*" is invalid; use named wildcard for SPA fallback
    app.get("/{*path}", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static frontend from dist/");
  }
}

app.listen(PORT, () => {
  console.log(`Proxy Server V3 running on http://localhost:${PORT} [${IS_PROD ? "PRODUCTION" : "DEVELOPMENT"}]`);
});
