# Quick Reference: Upstox API Implementation

## 🎯 Current Month Nifty Future
**Instrument Key**: `NSE_FO|49229`
**Lot Size**: 65
**Tick Size**: 10

---

## 📊 Getting Future OI Data

### 1. Update OIMonitor.jsx
Change the instrument key from Index to Future:

```javascript
// OLD (Index - No OI data)
const instrumentKey = "NSE_INDEX|Nifty 50";

// NEW (Future - Has OI data)
const instrumentKey = "NSE_FO|49229";
```

### 2. API Endpoints Available

#### Real-time Market Quotes (Current Implementation)
```
GET https://api.upstox.com/v2/market-quote/quotes?instrument_key=NSE_FO|49229
```

Response includes:
- `ltp` - Last Traded Price
- `open_interest` - Current Open Interest ✅
- `volume` - Trading Volume
- `ohlc` - Open, High, Low, Close

#### Historical OI Data
```
GET https://api.upstox.com/v3/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}
```

Example:
```
GET https://api.upstox.com/v3/historical-candle/NSE_FO|49229/1minute/2025-01-24/2025-01-23
```

---

## 📝 Placing Orders

### 1. Add to proxy-server.js

```javascript
app.post('/api/order/place', async (req, res) => {
    try {
        const accessToken = req.headers.authorization;
        if (!accessToken) {
            return res.status(400).json({ error: 'Missing Authorization Header' });
        }

        const response = await axios.post(
            'https://api-v2.upstox.com/order/place',
            req.body,
            {
                headers: {
                    "Authorization": accessToken,
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                }
            }
        );

        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: "Proxy Error" }
        );
    }
});
```

### 2. Order Parameters

```javascript
const orderParams = {
    instrument_token: "NSE_FO|49229",  // Nifty Future
    quantity: 65,                       // 1 lot = 65 units
    product: "I",                       // I=Intraday, D=Delivery
    validity: "DAY",                    // DAY or IOC
    order_type: "LIMIT",                // MARKET, LIMIT, SL, SL-M
    transaction_type: "BUY",            // BUY or SELL
    price: 23450.50,                    // Required for LIMIT
    tag: "my_order_001"                 // Optional identifier
};
```

### 3. Example Usage

```javascript
const placeOrder = async () => {
    const response = await fetch('http://localhost:3000/api/order/place', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderParams)
    });
    
    const result = await response.json();
    console.log('Order ID:', result.order_id);
};
```

---

## 🔧 Implementation Steps

### Step 1: Update OIMonitor Component
```bash
# Edit src/components/OIMonitor.jsx
# Change line 16 to:
const instrumentKey = "NSE_FO|49229";
```

### Step 2: Add Order Endpoints to Proxy
```bash
# Edit proxy-server.js
# Add POST /api/order/place endpoint
# Add PUT /api/order/modify endpoint
# Add DELETE /api/order/cancel endpoint
# Add GET /api/order/book endpoint
```

### Step 3: Create Order Hook
```bash
# Create src/hooks/useOrderPlacement.js
# Implement placeOrder, modifyOrder, cancelOrder functions
```

### Step 4: Test
```bash
# Start proxy server
npm run proxy

# Start frontend
npm run dev

# Verify OI data is now showing
# Test order placement (paper trading first!)
```

---

## ⚠️ Important Notes

### Token Expiry
- Access tokens expire at midnight
- Implement token refresh mechanism
- Never commit tokens to git

### Order Safety
- Always test in paper trading first
- Implement confirmation dialogs
- Add position size limits
- Set stop-loss orders

### Rate Limits
- Respect API rate limits
- Use WebSocket for real-time data (more efficient)
- Cache data when possible

---

## 📚 Full Documentation
See `docs/API_SUGGESTIONS.md` for complete implementation guide.

---

## 🔍 Useful Scripts

### Find Current Month Future
```bash
node scripts/findNiftyFuture.js
```

### Check Order Book
```bash
curl -X GET "http://localhost:3000/api/order/book" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🎯 Next Steps

1. ✅ Update instrument key in OIMonitor.jsx
2. ⬜ Add order placement endpoints to proxy-server.js
3. ⬜ Create useOrderPlacement hook
4. ⬜ Build order placement UI component
5. ⬜ Test in paper trading mode
6. ⬜ Implement WebSocket for better performance
7. ⬜ Add risk management features

---

**Last Updated**: January 24, 2026
**Current Month Future**: NSE_FO|49229 (Lot Size: 65)
