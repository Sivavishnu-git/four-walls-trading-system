# Upstox API Suggestions for Future OI Data & Order Placement

## Overview
Based on your current implementation and Upstox API documentation, here are comprehensive suggestions for getting future Open Interest (OI) data and placing orders.

---

## 1. Getting Future Open Interest (OI) Data

### Current Implementation Analysis
Your current setup uses:
- **Polling approach** via `useUpstoxPolling` hook
- **Market Quotes API v2**: `https://api.upstox.com/v2/market-quote/quotes`
- **Instrument**: `NSE_INDEX|Nifty 50` (Index, not Future)

### ⚠️ Issue Identified
You're currently monitoring the **Nifty 50 Index**, which doesn't have Open Interest data. You need to monitor **Nifty Futures** instead.

### ✅ Solution: Switch to Nifty Futures

#### Step 1: Get the Correct Instrument Key
Nifty Futures have a specific instrument key format. You need to:

1. **Use the correct instrument key format**:
   ```
   NSE_FO|NIFTY<EXPIRY_DATE>FUT
   ```
   Example: `NSE_FO|NIFTY26FEB25FUT` (for February 2025 expiry)

2. **Find the exact instrument key** from the NSE.json file in your docs folder:
   ```javascript
   // Search in docs/NSE.json for current month Nifty Future
   // Look for entries with:
   // - "segment": "NSE_FO"
   // - "name": "NIFTY"
   // - "instrument_type": "FUT"
   ```

#### Step 2: API Endpoints for OI Data

##### A. Real-time OI Data (Current Approach - Polling)
**Endpoint**: `GET https://api.upstox.com/v2/market-quote/quotes`

**Request**:
```javascript
const response = await axios.get(
  `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${instrumentKey}`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  }
);
```

**Response Structure**:
```json
{
  "status": "success",
  "data": {
    "NSE_FO|NIFTY26FEB25FUT": {
      "ltp": 23450.50,
      "open_interest": 1234567,  // ← This is what you need
      "volume": 987654,
      "ohlc": {
        "open": 23400.00,
        "high": 23500.00,
        "low": 23350.00,
        "close": 23450.50
      },
      "depth": { ... }
    }
  }
}
```

##### B. Historical OI Data (For Analysis)
**Endpoint**: `GET https://api.upstox.com/v3/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}`

**Request**:
```javascript
const response = await axios.get(
  `https://api.upstox.com/v3/historical-candle/${instrumentKey}/1minute/${toDate}/${fromDate}`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  }
);
```

**Response Structure**:
```json
{
  "status": "success",
  "data": {
    "candles": [
      [
        "2025-01-24T09:15:00+05:30",  // timestamp
        23400.00,  // open
        23450.00,  // high
        23380.00,  // low
        23420.00,  // close
        150000,    // volume
        1234567    // open_interest ← Historical OI
      ],
      // ... more candles
    ]
  }
}
```

**Intervals Available**: `1minute`, `30minute`, `day`, `week`, `month`

##### C. WebSocket for Real-time OI Updates (Most Efficient)
**WebSocket URL**: `wss://api-v2.upstox.com/feed/market-data-feed/v3`

**Advantages**:
- Lower latency
- Reduced API calls
- Real-time updates
- Lower bandwidth usage

**Implementation**:
```javascript
const WebSocket = require('ws');

const connectWebSocket = (accessToken, instrumentKeys) => {
  const ws = new WebSocket('wss://api-v2.upstox.com/feed/market-data-feed/v3', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Api-Version': '3.0'
    }
  });

  ws.on('open', () => {
    console.log('WebSocket connected');
    
    // Subscribe to instruments
    const subscribeMessage = {
      guid: 'someguid',
      method: 'sub',
      data: {
        mode: 'full',  // full mode includes OI
        instrumentKeys: instrumentKeys
      }
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  });

  ws.on('message', (data) => {
    // Parse protobuf or JSON data
    const feedData = parseFeedData(data);
    console.log('OI Update:', feedData.open_interest);
  });

  return ws;
};
```

---

## 2. Placing Orders via API

### Order Placement Endpoint
**Endpoint**: `POST https://api-v2.upstox.com/order/place`

### Required Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `instrument_token` | string | Unique identifier for the contract | `NSE_FO\|67360` |
| `quantity` | integer | Number of units/lots | `50` |
| `product` | string | Product type: `I` (Intraday), `D` (Delivery), `MTF` | `I` |
| `validity` | string | Order validity: `DAY`, `IOC` | `DAY` |
| `order_type` | string | Order type: `MARKET`, `LIMIT`, `SL`, `SL-M` | `LIMIT` |
| `transaction_type` | string | Buy or Sell: `BUY`, `SELL` | `BUY` |
| `price` | float | Price (required for LIMIT orders) | `23450.50` |
| `trigger_price` | float | Trigger price (for SL orders) | `23400.00` |
| `is_amo` | boolean | After Market Order (auto-inferred) | `false` |
| `tag` | string | Optional unique identifier | `my_order_123` |

### Example Implementation

#### A. Add Order Placement Proxy Endpoint
Add this to your `proxy-server.js`:

```javascript
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
        const response = await axios.put(targetUrl, req.body, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });

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

        const targetUrl = `https://api-v2.upstox.com/order/cancel?order_id=${order_id}`;
        const response = await axios.delete(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

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
```

#### B. Create Order Placement Hook
Create `src/hooks/useOrderPlacement.js`:

```javascript
import { useState } from 'react';
import axios from 'axios';

export const useOrderPlacement = (token) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const placeOrder = async (orderParams) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.post(
                'http://localhost:3000/api/order/place',
                orderParams,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setLoading(false);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    const modifyOrder = async (orderId, modifyParams) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.put(
                'http://localhost:3000/api/order/modify',
                { order_id: orderId, ...modifyParams },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setLoading(false);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    const cancelOrder = async (orderId) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.delete(
                `http://localhost:3000/api/order/cancel?order_id=${orderId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            setLoading(false);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    const getOrderBook = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(
                'http://localhost:3000/api/order/book',
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            setLoading(false);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    return {
        placeOrder,
        modifyOrder,
        cancelOrder,
        getOrderBook,
        loading,
        error
    };
};
```

#### C. Example Usage in Component

```javascript
import { useOrderPlacement } from '../hooks/useOrderPlacement';

const TradingComponent = () => {
    const token = "your_access_token";
    const { placeOrder, loading, error } = useOrderPlacement(token);

    const handleBuyOrder = async () => {
        const orderParams = {
            instrument_token: "NSE_FO|67360",  // Get from NSE.json
            quantity: 50,
            product: "I",  // Intraday
            validity: "DAY",
            order_type: "LIMIT",
            transaction_type: "BUY",
            price: 23450.50,
            tag: "nifty_future_buy_001"
        };

        const result = await placeOrder(orderParams);
        
        if (result.success) {
            console.log("Order placed successfully:", result.data);
            alert(`Order ID: ${result.data.order_id}`);
        } else {
            console.error("Order failed:", result.error);
            alert(`Order failed: ${result.error}`);
        }
    };

    return (
        <button onClick={handleBuyOrder} disabled={loading}>
            {loading ? 'Placing Order...' : 'Buy Nifty Future'}
        </button>
    );
};
```

---

## 3. Recommended Implementation Steps

### Step 1: Fix Instrument Key in OIMonitor.jsx
```javascript
// Change from:
const instrumentKey = "NSE_INDEX|Nifty 50";

// To (find exact key from NSE.json):
const instrumentKey = "NSE_FO|NIFTY26FEB25FUT";  // Current month future
```

### Step 2: Add Option Greeks Endpoint (Optional)
If you want to monitor options as well:

```javascript
// In proxy-server.js
app.get('/api/option-greeks', async (req, res) => {
    try {
        const { instrument_keys } = req.query;
        const accessToken = req.headers.authorization;

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        const targetUrl = `https://api.upstox.com/v2/option/greeks?instrument_key=${instrument_keys}`;
        console.log("Fetching Option Greeks:", targetUrl);

        const response = await axios.get(targetUrl, {
            headers: {
                "Authorization": accessToken,
                "Accept": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Option Greeks Error:", JSON.stringify(errorData, null, 2));
        res.status(error.response ? error.response.status : 500).json(error.response ? error.response.data : { error: "Proxy Error" });
    }
});
```

### Step 3: Create Utility to Find Current Month Future
Create `src/utils/instrumentHelper.js`:

```javascript
export const findCurrentMonthNiftyFuture = async () => {
    try {
        // Load NSE.json
        const response = await fetch('/docs/NSE.json');
        const instruments = await response.json();

        // Find current month Nifty Future
        const niftyFutures = instruments.filter(inst => 
            inst.segment === 'NSE_FO' && 
            inst.name === 'NIFTY' && 
            inst.instrument_type === 'FUT'
        );

        // Sort by expiry date and get the nearest one
        niftyFutures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
        
        const currentFuture = niftyFutures.find(f => new Date(f.expiry) > new Date());
        
        return currentFuture?.instrument_key || null;
    } catch (error) {
        console.error("Error finding Nifty Future:", error);
        return null;
    }
};
```

---

## 4. Important Notes & Best Practices

### Authentication
- Access tokens expire daily at midnight
- Implement token refresh mechanism
- Store tokens securely (never commit to git)

### Rate Limits
- Market Quotes API: Check Upstox documentation for current limits
- WebSocket: More efficient for real-time data
- Historical Data: Limited requests per minute

### Order Placement Safety
- Always validate order parameters before submission
- Implement confirmation dialogs for order placement
- Add position size limits
- Implement stop-loss mechanisms
- Test thoroughly in paper trading mode first

### Error Handling
- Handle network errors gracefully
- Implement retry logic with exponential backoff
- Log all API errors for debugging
- Show user-friendly error messages

### Data Validation
- Validate instrument keys before API calls
- Check market hours before placing orders
- Verify sufficient margin before order placement
- Validate price ranges (circuit limits)

---

## 5. Testing Checklist

- [ ] Verify correct Nifty Future instrument key
- [ ] Test OI data retrieval
- [ ] Test historical OI data
- [ ] Test order placement in paper trading
- [ ] Test order modification
- [ ] Test order cancellation
- [ ] Test error scenarios
- [ ] Verify token expiry handling
- [ ] Test during market hours
- [ ] Test during non-market hours

---

## 6. Additional Resources

- **Upstox API Documentation**: https://upstox.com/developer/api-documentation/
- **WebSocket Feed Documentation**: https://upstox.com/developer/api-documentation/websocket-feed
- **Order Placement Guide**: https://upstox.com/developer/api-documentation/order-placement
- **Instrument Master Files**: Updated daily on Upstox developer portal

---

## Summary

1. **For OI Data**: Switch from `NSE_INDEX|Nifty 50` to the correct Nifty Future instrument key
2. **For Orders**: Implement the order placement endpoints in your proxy server
3. **Best Approach**: Consider migrating to WebSocket for real-time OI updates
4. **Safety First**: Always test in paper trading mode before live trading
