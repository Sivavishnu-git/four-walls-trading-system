import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import querystring from 'querystring';
import { updateEnvToken } from './utils/tokenManager.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const CLIENT_ID = process.env.UPSTOX_API_KEY;
const CLIENT_SECRET = process.env.UPSTOX_API_SECRET;
const REDIRECT_URI = process.env.UPSTOX_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
const FRONTEND_URI = 'http://localhost:5173';

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- AUTH ENDPOINTS ---

// 1. Redirect to Upstox Login
app.get('/api/auth/login', (req, res) => {
    const params = querystring.stringify({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        state: 'random_state_string'
    });
    const loginUrl = `https://api.upstox.com/v2/login/authorization/dialog?${params}`;
    console.log("Redirecting to Upstox Login:", loginUrl);
    res.redirect(loginUrl);
});

// 2. Handle Callback & Exchange Code
app.get('/api/auth/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.redirect(`${FRONTEND_URI}?error=${error}`);
    }

    if (!code) {
        return res.redirect(`${FRONTEND_URI}?error=no_code`);
    }

    try {
        const tokenUrl = 'https://api.upstox.com/v2/login/authorization/token';
        const data = querystring.stringify({
            code: code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        });

        console.log("Exchanging code for token...");

        const response = await axios.post(tokenUrl, data, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });

        const accessToken = response.data.access_token;
        console.log("Access Token received");

        // Automatically update .env file with new token
        const tokenUpdated = updateEnvToken(accessToken);
        if (tokenUpdated) {
            console.log("✅ Token automatically saved to .env file");
            console.log("⚠️  Frontend will use this token after restart");
        }

        // Redirect back to frontend with token
        res.redirect(`${FRONTEND_URI}?token=${accessToken}`);

    } catch (err) {
        console.error("Token Exchange Error:", err.response ? err.response.data : err.message);
        res.redirect(`${FRONTEND_URI}?error=token_exchange_failed`);
    }
});

// Manual Token Update Endpoint
app.post('/api/auth/update-token', (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token is required in request body'
            });
        }

        const updated = updateEnvToken(token);

        if (updated) {
            res.json({
                success: true,
                message: 'Token updated successfully in .env file',
                note: 'Please restart the frontend to use the new token'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to update token in .env file'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Proxy Endpoint for Historical Data
app.get('/api/historical', async (req, res) => {
    try {
        const { instrument_key, interval, to_date, from_date } = req.query;
        const accessToken = req.headers.authorization;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        const targetUrl = `https://api.upstox.com/v3/historical-candle/${instrument_key}/${interval}/${to_date}/${from_date}`;
        console.log("Fetching Historical Data:", targetUrl);

        const response = await axios.get(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Historical Data Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});

// Tool Endpoint: Find Nifty Future Keys
app.get('/api/tools/find-nifty-future', async (req, res) => {
    try {
        // Get token from .env via tokenManager
        const { getCurrentToken } = await import('./utils/tokenManager.js');
        const token = getCurrentToken();

        if (!token || token === 'your_access_token_here') {
            return res.status(401).json({ error: 'No valid token found in .env. Please login first.' });
        }

        console.log("Searching for Nifty Futures...");

        // Search for "NIFTY"
        const searchUrl = `https://api.upstox.com/v2/market/instrument/search?symbol=NIFTY`;
        const response = await axios.get(searchUrl, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        });

        if (response.data.status === 'success') {
            // Filter for Futures (NSE_FO) and sorted by expiry
            const futures = response.data.data
                .filter(inst => inst.segment === 'NSE_FO' && inst.instrument_type === 'FUT')
                .map(inst => ({
                    name: inst.name,
                    trading_symbol: inst.trading_symbol,
                    expiry: inst.expiry,
                    instrument_key: inst.instrument_key,
                    lot_size: inst.lot_size
                }))
                .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

            res.json({ status: 'success', data: futures });
        } else {
            res.json(response.data);
        }

    } catch (error) {
        console.error("Tool Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.message });
    }
});

// Proxy Endpoint for Instrument Search
app.get('/api/search', async (req, res) => {
    try {
        const { symbol } = req.query;
        const accessToken = req.headers.authorization;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        // Using V2 search API which is standard for Upstox
        const targetUrl = `https://api.upstox.com/v2/market/instrument/search?symbol=${symbol}`;
        console.log("Searching Instrument:", targetUrl);

        const response = await axios.get(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Search Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});

// Proxy Endpoint for Market Quotes (Polling)
app.get('/api/quotes', async (req, res) => {
    try {
        const { instrument_keys } = req.query;
        const accessToken = req.headers.authorization;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        // Upstox Quotes API V2
        const targetUrl = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${instrument_keys}`;
        console.log("Fetching Quotes:", targetUrl);

        const response = await axios.get(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Quotes Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});

// Proxy Endpoint for Placing Orders
app.post('/api/order/place', async (req, res) => {
    try {
        const accessToken = req.headers.authorization;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        const orderData = req.body;

        // Validate required fields
        const requiredFields = ['instrument_token', 'quantity', 'product', 'validity', 'order_type', 'transaction_type'];
        for (const field of requiredFields) {
            if (!orderData[field]) {
                return res.status(400).json({ error: `Missing required field: ${field}` });
            }
        }

        const targetUrl = 'https://api-v2.upstox.com/order/place';
        console.log("Placing Order:", JSON.stringify(orderData, null, 2));

        const response = await axios.post(targetUrl, orderData, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });

        console.log("Order placed successfully:", response.data);
        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Order Placement Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});

// Proxy Endpoint for Modifying Orders
app.put('/api/order/modify', async (req, res) => {
    try {
        const accessToken = req.headers.authorization;
        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        const targetUrl = 'https://api-v2.upstox.com/order/modify';
        console.log("Modifying Order:", JSON.stringify(req.body, null, 2));

        const response = await axios.put(targetUrl, req.body, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });

        console.log("Order modified successfully:", response.data);
        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Order Modification Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});

// Proxy Endpoint for Canceling Orders
app.delete('/api/order/cancel', async (req, res) => {
    try {
        const accessToken = req.headers.authorization;
        const { order_id } = req.query;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        if (!order_id) {
            return res.status(400).json({ error: 'Missing order_id parameter' });
        }

        const targetUrl = `https://api-v2.upstox.com/order/cancel?order_id=${order_id}`;
        console.log("Canceling Order:", order_id);

        const response = await axios.delete(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

        console.log("Order canceled successfully:", response.data);
        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Order Cancellation Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});

// Proxy Endpoint for Getting Order Book
app.get('/api/order/book', async (req, res) => {
    try {
        const accessToken = req.headers.authorization;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        const targetUrl = 'https://api-v2.upstox.com/order/retrieve-all';
        console.log("Fetching Order Book");

        const response = await axios.get(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Order Book Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});

// Proxy Endpoint for Getting Today's Orders
app.get('/api/order/today', async (req, res) => {
    try {
        const accessToken = req.headers.authorization;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        const targetUrl = 'https://api-v2.upstox.com/order/retrieve-all';
        console.log("Fetching Today's Orders");

        const response = await axios.get(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

        // Filter orders for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let todaysOrders = [];

        if (response.data && response.data.data) {
            todaysOrders = response.data.data.filter(order => {
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
            status: 'success',
            data: {
                total_orders: todaysOrders.length,
                date: today.toISOString().split('T')[0],
                orders: todaysOrders.map(order => ({
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
                    exchange: order.exchange
                }))
            }
        });
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Today's Orders Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});

// Proxy Endpoint for Getting Positions
app.get('/api/portfolio/positions', async (req, res) => {
    try {
        const accessToken = req.headers.authorization;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        const targetUrl = 'https://api-v2.upstox.com/portfolio/short-term-positions';
        console.log("Fetching Positions");

        const response = await axios.get(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Positions Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});


app.listen(PORT, () => {
    console.log(`Proxy Server V3 running on http://localhost:${PORT}`);
});
