import axios from 'axios';
const token = 'eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTk0OWZhMDFmNDJkZjUxNGQxMzRlMDYiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MTM0Nzg3MiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzcxMzY1NjAwfQ.P6hCwzFa0poXC5F4fIHF2Izo_XE17OqFisb45zSjZrw';
const instrumentKey = 'NSE_FO|59182';

async function checkHistoricalOI() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Encode the key
        const encodedKey = encodeURIComponent(instrumentKey);

        // Upstox V3 historical: /v3/historical-candle/{instrumentKey}/{interval}/{to_date}/{from_date}
        const url = `https://api.upstox.com/v3/historical-candle/${encodedKey}/day/${today}/${from}`;
        console.log("Checking:", url);

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        const candles = response.data.data.candles;
        if (candles && candles.length > 0) {
            console.log("Number of candles:", candles.length);
            console.log("Last candle (most recent):", candles[0]);
            console.log("OI at index 6:", candles[0][6]);
        } else {
            console.log("No candles found.", response.data);
        }
    } catch (e) {
        console.error("Status:", e.response ? e.response.status : 'N/A');
        console.error(e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
    }
}
checkHistoricalOI();
