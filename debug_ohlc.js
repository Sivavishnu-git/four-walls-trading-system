import axios from 'axios';
const token = 'eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTk0OWZhMDFmNDJkZjUxNGQxMzRlMDYiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MTM0Nzg3MiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzcxMzY1NjAwfQ.P6hCwzFa0poXC5F4fIHF2Izo_XE17OqFisb45zSjZrw';
const instrumentKey = 'NSE_FO|59182';

async function checkOHLC() {
    try {
        const url = `https://api.upstox.com/v2/market-quote/ohlc?instrument_key=${encodeURIComponent(instrumentKey)}&interval=1d`;
        console.log("Checking:", url);

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        console.log(JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
checkOHLC();
