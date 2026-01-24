import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
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
