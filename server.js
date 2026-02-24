import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import querystring from "querystring";
import path from "path";
import { fileURLToPath } from "url";
import { updateEnvToken, getCurrentToken } from "./utils/tokenManager.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.UPSTOX_API_KEY;
const CLIENT_SECRET = process.env.UPSTOX_API_SECRET;
const NODE_ENV = process.env.NODE_ENV || "development";

// Dynamic URLs based on environment
const REDIRECT_URI =
  process.env.UPSTOX_REDIRECT_URI ||
  (NODE_ENV === "production"
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME || "your-app.onrender.com"}/api/auth/callback`
    : "http://localhost:3000/api/auth/callback");

const FRONTEND_URI =
  NODE_ENV === "production"
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME || "your-app.onrender.com"}`
    : "http://localhost:5173";

// Middleware
app.use(
  cors({
    origin: NODE_ENV === "production" ? FRONTEND_URI : "*",
    credentials: true,
  }),
);
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- AUTH ENDPOINTS ---

// 1. Redirect to Upstox Login
app.get("/api/auth/login", (req, res) => {
  const params = querystring.stringify({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: "random_state_string",
  });
  const loginUrl = `https://api.upstox.com/v2/login/authorization/dialog?${params}`;
  console.log("Redirecting to Upstox Login:", loginUrl);
  res.redirect(loginUrl);
});

// 2. Handle Callback & Exchange Code
app.get("/api/auth/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URI}?error=${error}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_URI}?error=no_code`);
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

    // In production, you might want to store this in a database
    // For now, we'll update .env in development only
    if (NODE_ENV === "development") {
      const tokenUpdated = updateEnvToken(accessToken);
      if (tokenUpdated) {
        console.log("✅ Token automatically saved to .env file");
      }
    }

    // Redirect back to frontend with token
    res.redirect(`${FRONTEND_URI}?token=${accessToken}`);
  } catch (err) {
    console.error(
      "Token Exchange Error:",
      err.response ? err.response.data : err.message,
    );
    res.redirect(`${FRONTEND_URI}?error=token_exchange_failed`);
  }
});

// Proxy Endpoint for Market Quotes (Polling) - Main endpoint for OI Monitor
app.get("/api/quotes", async (req, res) => {
  try {
    const { instrument_keys } = req.query;
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Authorization Header" });
    }

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

// Tool Endpoint: Find Nifty Future Keys
app.get("/api/tools/find-nifty-future", async (req, res) => {
  try {
    console.log(
      "Upstox Search API is currently unavailable via direct endpoint.",
    );

    // Provide helpful instructions and some common keys
    res.json({
      status: "info",
      message:
        "Direct instrument search is currently limited. Please use the Upstox Developer Console or Terminal to find the exact instrument key.",
      help: 'The instrument key for Nifty Futures usually starts with "NSE_FO|".',
      common_keys: [
        {
          symbol: "NIFTY FEB FUT",
          key: "NSE_FO|49229",
          note: "Typical Feb 2026 Key",
        },
        {
          symbol: "NIFTY MAR FUT",
          key: "NSE_FO|49242",
          note: "Typical Mar 2026 Key",
        },
      ],
      instructions: [
        "1. Go to Upstox Developer Console",
        "2. Download the NSE Instrument Master JSON",
        '3. Search for "NIFTY" with segment "NSE_FO" and type "FUT"',
        "4. Update VITE_INSTRUMENT_KEY in your .env file",
      ],
    });
  } catch (error) {
    console.error("Tool Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Serve static files in production
if (NODE_ENV === "production") {
  // Serve static files from the dist directory
  app.use(express.static(path.join(__dirname, "dist")));

  // Handle React routing - return index.html for all non-API routes
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${NODE_ENV}`);
  console.log(`🔗 Redirect URI: ${REDIRECT_URI}`);
  if (NODE_ENV === "production") {
    console.log(`🌐 Serving static files from dist/`);
  }
});
