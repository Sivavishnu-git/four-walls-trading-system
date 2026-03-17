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
import { updateEnvToken } from "./utils/tokenManager.js";

const gunzip = promisify(zlib.gunzip);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MASTER LIST CACHE (using complete.json.gz) ---
const COMPLETE_CACHE = { data: null, lastFetched: null };
const COMPLETE_URL = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

const loadCompleteData = async () => {
  const today = new Date().toDateString();
  if (COMPLETE_CACHE.data && COMPLETE_CACHE.lastFetched === today) {
    return COMPLETE_CACHE.data;
  }
  try {
    console.log("📥 Downloading Complete Master List...");
    const response = await axios.get(COMPLETE_URL, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const decompressed = await gunzip(response.data);
    const data = JSON.parse(decompressed.toString());
    COMPLETE_CACHE.data = data;
    COMPLETE_CACHE.lastFetched = today;
    console.log(`✅ Loaded ${data.length} instruments`);
    return data;
  } catch (err) {
    console.error("Error fetching master list:", err.message);
    return COMPLETE_CACHE.data;
  }
};

const getMasterData = async (exchange) => {
  const allData = await loadCompleteData();
  if (!allData) return null;
  const segmentMap = { NFO: "NSE_FO", NSE: "NSE_EQ" };
  const segment = segmentMap[exchange] || exchange;
  return allData.filter(i => i.segment === segment);
};

const PORT = 3000;
const CLIENT_ID = process.env.UPSTOX_API_KEY;
const CLIENT_SECRET = process.env.UPSTOX_API_SECRET;
const REDIRECT_URI =
  process.env.UPSTOX_REDIRECT_URI || "http://localhost:3000/api/auth/callback";
const IS_PROD = process.env.NODE_ENV === "production";
const FRONTEND_URI = IS_PROD
  ? (process.env.FRONTEND_URI || `http://localhost:${PORT}`)
  : (process.env.FRONTEND_URI || "http://localhost:5173");

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- AUTH ENDPOINTS ---

// In-memory map of OAuth state -> frontend origin to avoid global cross-user leakage
const OAUTH_STATE_STORE = new Map();

// 1. Redirect to Upstox Login
app.get("/api/auth/login", (req, res) => {
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

// Manual Token Update Endpoint
app.post("/api/auth/update-token", (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Token is required in request body",
      });
    }

    const updated = updateEnvToken(token);

    if (updated) {
      res.json({
        success: true,
        message: "Token updated successfully in .env file",
        note: "Please restart the frontend to use the new token",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to update token in .env file",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
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

    const targetUrl = `https://api.upstox.com/v2/historical-candle/${instrument_key}/${interval}/${to_date}/${from_date}`;
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
    if (!instruments) return res.status(500).json({ error: "Could not load NFO master list" });

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
      data: currentFuture
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
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
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
    const accessToken = req.headers.authorization;
    if (!accessToken) return res.status(400).json({ error: "Missing Authorization Header" });

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
        optMeta[ce.instrument_key] = { strike, type: "CE", symbol: ce.trading_symbol, lot_size: ce.lot_size || 25 };
      }
      if (pe) {
        optKeys.push(pe.instrument_key);
        optMeta[pe.instrument_key] = { strike, type: "PE", symbol: pe.trading_symbol, lot_size: pe.lot_size || 25 };
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
        future: { key: futKey, symbol: currentFuture.trading_symbol },
        options,
      },
    });
  } catch (error) {
    console.error("ATM Options Error:", error.message);
    res.status(500).json({ error: error.message });
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
    const today = new Date().toISOString().split("T")[0];
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().split("T")[0];

    // Fetch daily candles (for pivot), intraday 5-min candles, and live quote in parallel
    const [dailyRes, intradayRes, quoteRes] = await Promise.all([
      axios.get(`https://api.upstox.com/v2/historical-candle/${futKey}/day/${today}/${fiveDaysAgo}`, {
        headers: { Authorization: accessToken, Accept: "application/json" }
      }).catch(e => ({ data: null, error: e.response?.data || e.message })),
      axios.get(`https://api.upstox.com/v2/historical-candle/${futKey}/1minute/${today}/${today}`, {
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
      const todayStr = new Date().toDateString();
      // Find previous trading day (not today)
      const prevDay = candles.filter(c => new Date(c[0]).toDateString() !== todayStr).pop();
      if (prevDay) {
        const [, O, H, L, C, V, OI] = prevDay;
        const P = (H + L + C) / 3;
        pivots = {
          date: prevDay[0],
          open: O, high: H, low: L, close: C, volume: V, oi: OI,
          pp: Math.round(P * 100) / 100,
          r1: Math.round((2 * P - L) * 100) / 100,
          r2: Math.round((P + (H - L)) * 100) / 100,
          r3: Math.round((H + 2 * (P - L)) * 100) / 100,
          s1: Math.round((2 * P - H) * 100) / 100,
          s2: Math.round((P - (H - L)) * 100) / 100,
          s3: Math.round((L - 2 * (H - P)) * 100) / 100,
        };
      }
    }

    // Intraday 1-min candles → aggregate to 5-min
    let fiveMinCandles = [];
    if (intradayRes.data?.data?.candles) {
      const sorted = intradayRes.data.data.candles.sort((a, b) => new Date(a[0]) - new Date(b[0]));
      for (let i = 0; i < sorted.length; i += 5) {
        const batch = sorted.slice(i, i + 5);
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
        future: { key: futKey, symbol: currentFuture.trading_symbol },
        pivots,
        five_min_candles: fiveMinCandles,
        live: liveQuote,
        atm_oi: atmOI,
      },
    });
  } catch (error) {
    console.error("Trade Setup Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ========================
// HISTORICAL REPLAY ENGINE
// ========================
// Per-session replay storage keyed by access token (or IP as fallback)
const REPLAY_SESSIONS = new Map();

const getReplayKey = (req) => {
  const rawAuth = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (rawAuth) return rawAuth;
  return req.ip || "anonymous";
};

const getOrCreateReplay = (key) => {
  if (!REPLAY_SESSIONS.has(key)) {
    REPLAY_SESSIONS.set(key, {
      active: false,
      candles: [],
      position: 0,
      speed: 1,
      playing: false,
      date: null,
      pivots: null,
      paperOrders: [],
      paperPositions: [],
      timer: null,
      futKey: null,
      futSymbol: null,
    });
  }
  return REPLAY_SESSIONS.get(key);
};

app.post("/api/replay/start", async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    const token = (req.headers.authorization || "").replace("Bearer ", "") || process.env.UPSTOX_ACCESS_TOKEN;
    const master = await loadCompleteData();
    const today = new Date();
    const niftyFutures = master.filter(i =>
      i.segment === "NSE_FO" && i.name === "NIFTY" && i.instrument_type === "FUT" &&
      new Date(i.expiry) >= today
    ).sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    const fut = niftyFutures[0];
    if (!fut) return res.status(500).json({ error: "Could not find NIFTY FUT" });
    const futKey = `NSE_FO|${fut.instrument_key || fut.token}`;

    const dateObj = new Date(date);
    const toStr = dateObj.toISOString().split("T")[0];
    const prevDate = new Date(dateObj);
    prevDate.setDate(prevDate.getDate() - 10);
    const fromStr = prevDate.toISOString().split("T")[0];

    const histRes = await axios.get(
      `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(futKey)}/1minute/${toStr}/${fromStr}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    const allCandles = (histRes.data?.data?.candles || []).sort((a, b) => new Date(a[0]) - new Date(b[0]));
    const dayCandles = allCandles.filter(c => c[0].startsWith(date));
    if (dayCandles.length === 0) return res.status(400).json({ error: `No candle data for ${date}` });

    const prevDayCandles = allCandles.filter(c => !c[0].startsWith(date));
    let pivots = null;
    if (prevDayCandles.length > 0) {
      const last = prevDayCandles[prevDayCandles.length - 1];
      const dayGroup = {};
      prevDayCandles.forEach(c => {
        const d = c[0].split("T")[0];
        if (!dayGroup[d]) dayGroup[d] = [];
        dayGroup[d].push(c);
      });
      const days = Object.keys(dayGroup).sort();
      const prevDayKey = days[days.length - 1];
      const pdc = dayGroup[prevDayKey];
      if (pdc && pdc.length > 0) {
        const H = Math.max(...pdc.map(c => c[2]));
        const L = Math.min(...pdc.map(c => c[3]));
        const C = pdc[pdc.length - 1][4];
        const O = pdc[0][1];
        const P = (H + L + C) / 3;
        pivots = {
          date: prevDayKey, O, H, L, C,
          P: +P.toFixed(2),
          R1: +(2 * P - L).toFixed(2), S1: +(2 * P - H).toFixed(2),
          R2: +(P + (H - L)).toFixed(2), S2: +(P - (H - L)).toFixed(2),
          R3: +(H + 2 * (P - L)).toFixed(2), S3: +(L - 2 * (H - P)).toFixed(2),
        };
      }
    }

    const replayKey = getReplayKey(req);
    const REPLAY = getOrCreateReplay(replayKey);

    REPLAY.active = true;
    REPLAY.candles = dayCandles;
    REPLAY.position = 0;
    REPLAY.speed = 1;
    REPLAY.playing = false;
    REPLAY.date = date;
    REPLAY.pivots = pivots;
    REPLAY.paperOrders = [];
    REPLAY.paperPositions = [];
    REPLAY.futKey = futKey;
    REPLAY.futSymbol = fut.trading_symbol;
    if (REPLAY.timer) { clearInterval(REPLAY.timer); REPLAY.timer = null; }

    res.json({
      status: "success",
      data: {
        date, totalCandles: dayCandles.length,
        startTime: dayCandles[0][0], endTime: dayCandles[dayCandles.length - 1][0],
        pivots, futKey, futSymbol: fut.trading_symbol,
      },
    });
  } catch (err) {
    console.error("Replay start error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/replay/control", (req, res) => {
  const replayKey = getReplayKey(req);
  const REPLAY = getOrCreateReplay(replayKey);
  const { action, speed } = req.body;
  if (!REPLAY.active) return res.status(400).json({ error: "No active replay session" });

  switch (action) {
    case "play":
      REPLAY.playing = true;
      if (REPLAY.timer) clearInterval(REPLAY.timer);
      REPLAY.timer = setInterval(() => {
        if (REPLAY.position < REPLAY.candles.length - 1) {
          REPLAY.position++;
        } else {
          REPLAY.playing = false;
          clearInterval(REPLAY.timer);
          REPLAY.timer = null;
        }
      }, 1000 / REPLAY.speed);
      break;
    case "pause":
      REPLAY.playing = false;
      if (REPLAY.timer) { clearInterval(REPLAY.timer); REPLAY.timer = null; }
      break;
    case "step":
      if (REPLAY.position < REPLAY.candles.length - 1) REPLAY.position++;
      break;
    case "step_back":
      if (REPLAY.position > 0) REPLAY.position--;
      break;
    case "reset":
      REPLAY.position = 0;
      REPLAY.playing = false;
      if (REPLAY.timer) { clearInterval(REPLAY.timer); REPLAY.timer = null; }
      break;
    case "stop":
      REPLAY.active = false;
      REPLAY.playing = false;
      REPLAY.candles = [];
      REPLAY.position = 0;
      REPLAY.paperOrders = [];
      REPLAY.paperPositions = [];
      if (REPLAY.timer) { clearInterval(REPLAY.timer); REPLAY.timer = null; }
      break;
    case "speed":
      if (speed) {
        REPLAY.speed = speed;
        if (REPLAY.playing && REPLAY.timer) {
          clearInterval(REPLAY.timer);
          REPLAY.timer = setInterval(() => {
            if (REPLAY.position < REPLAY.candles.length - 1) REPLAY.position++;
            else { REPLAY.playing = false; clearInterval(REPLAY.timer); REPLAY.timer = null; }
          }, 1000 / REPLAY.speed);
        }
      }
      break;
    case "goto": {
      const pos = req.body.position;
      if (pos != null && pos >= 0 && pos < REPLAY.candles.length) REPLAY.position = pos;
      break;
    }
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
  const candle = REPLAY.candles[REPLAY.position];
  res.json({
    status: "success",
    data: {
      active: REPLAY.active, playing: REPLAY.playing, speed: REPLAY.speed,
      position: REPLAY.position, total: REPLAY.candles.length,
      currentTime: candle?.[0], currentPrice: candle?.[4],
    },
  });
});

app.get("/api/replay/status", (req, res) => {
  const replayKey = getReplayKey(req);
  const REPLAY = getOrCreateReplay(replayKey);
  if (!REPLAY.active) return res.json({ status: "success", data: { active: false } });
  const candle = REPLAY.candles[REPLAY.position];
  res.json({
    status: "success",
    data: {
      active: true, playing: REPLAY.playing, speed: REPLAY.speed,
      position: REPLAY.position, total: REPLAY.candles.length,
      date: REPLAY.date, currentTime: candle?.[0], currentPrice: candle?.[4],
    },
  });
});

app.get("/api/replay/quotes", (req, res) => {
  const replayKey = getReplayKey(req);
  const REPLAY = getOrCreateReplay(replayKey);
  if (!REPLAY.active || REPLAY.candles.length === 0) return res.json({ data: {} });
  const c = REPLAY.candles[REPLAY.position];
  const key = REPLAY.futKey;
  res.json({
    data: {
      [key]: {
        last_price: c[4], open: c[1], high: c[2], low: c[3], close: c[4],
        oi: c[6] || 0, volume: c[5] || 0, symbol: REPLAY.futSymbol, timestamp: c[0],
      },
    },
  });
});

app.get("/api/replay/trade-setup", (req, res) => {
  const replayKey = getReplayKey(req);
  const REPLAY = getOrCreateReplay(replayKey);
  if (!REPLAY.active || REPLAY.candles.length === 0)
    return res.status(400).json({ error: "No active replay" });

  const visibleCandles = REPLAY.candles.slice(0, REPLAY.position + 1);
  const fiveMinCandles = [];
  for (let i = 0; i < visibleCandles.length; i += 5) {
    const chunk = visibleCandles.slice(i, i + 5);
    if (chunk.length === 0) continue;
    fiveMinCandles.push({
      time: chunk[0][0],
      open: chunk[0][1],
      high: Math.max(...chunk.map(c => c[2])),
      low: Math.min(...chunk.map(c => c[3])),
      close: chunk[chunk.length - 1][4],
      volume: chunk.reduce((s, c) => s + (c[5] || 0), 0),
      oi: chunk[chunk.length - 1][6] || 0,
    });
  }

  const current = visibleCandles[visibleCandles.length - 1];
  res.json({
    status: "success",
    data: {
      future: { key: REPLAY.futKey, symbol: REPLAY.futSymbol },
      pivots: REPLAY.pivots,
      five_min_candles: fiveMinCandles,
      live: {
        last_price: current[4], open: current[1], high: current[2],
        low: current[3], close: current[4], oi: current[6] || 0,
        volume: current[5] || 0,
      },
      replay: {
        position: REPLAY.position, total: REPLAY.candles.length,
        time: current[0], playing: REPLAY.playing,
      },
    },
  });
});

app.post("/api/replay/order", (req, res) => {
  const replayKey = getReplayKey(req);
  const REPLAY = getOrCreateReplay(replayKey);
  if (!REPLAY.active) return res.status(400).json({ error: "No active replay" });
  const { instrument_token, transaction_type, quantity, order_type, price } = req.body;
  const candle = REPLAY.candles[REPLAY.position];
  const fillPrice = order_type === "MARKET" ? candle[4] : (price || candle[4]);
  const order = {
    order_id: `PAPER-${Date.now()}`,
    instrument_token,
    transaction_type,
    quantity,
    order_type,
    price: fillPrice,
    status: "complete",
    timestamp: candle[0],
  };
  REPLAY.paperOrders.push(order);
  const existingPos = REPLAY.paperPositions.find(p => p.instrument_token === instrument_token);
  const qty = transaction_type === "BUY" ? quantity : -quantity;
  if (existingPos) {
    existingPos.quantity += qty;
    if (existingPos.quantity === 0) {
      REPLAY.paperPositions = REPLAY.paperPositions.filter(p => p.instrument_token !== instrument_token);
    }
  } else {
    REPLAY.paperPositions.push({
      instrument_token, quantity: qty, average_price: fillPrice, last_price: fillPrice,
    });
  }
  res.json({ status: "success", data: { order_id: order.order_id, message: "Paper order filled" } });
});

app.get("/api/replay/orders", (req, res) => {
  const replayKey = getReplayKey(req);
  const REPLAY = getOrCreateReplay(replayKey);
  if (REPLAY.active) {
    REPLAY.paperPositions.forEach(p => {
      const candle = REPLAY.candles[REPLAY.position];
      if (candle) p.last_price = candle[4];
    });
  }
  res.json({
    status: "success",
    orders: REPLAY.paperOrders,
    positions: REPLAY.paperPositions,
  });
});

// In production, serve the built React frontend
if (IS_PROD) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static frontend from dist/");
  }
}

app.listen(PORT, () => {
  console.log(`Proxy Server V3 running on http://localhost:${PORT} [${IS_PROD ? "PRODUCTION" : "DEVELOPMENT"}]`);
});
