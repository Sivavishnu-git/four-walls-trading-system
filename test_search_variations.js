import axios from "axios";
const token = "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTk0OWZhMDFmNDJkZjUxNGQxMzRlMDYiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MTM0Nzg3MiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzcxMzY1NjAwfQ.P6hCwzFa0poXC5F4fIHF2Izo_XE17OqFisb45zSjZrw";

async function test() {
    const urls = [
        "https://api.upstox.com/v2/market/instruments/search?symbol=NIFTY",
        "https://api.upstox.com/v2/market/instrument/search?symbol=NIFTY",
        "https://api.upstox.com/v2/market/instruments/NSE/FO/search?symbol=NIFTY",
        "https://api.upstox.com/v2/market/instruments/NSE_FO/search?symbol=NIFTY"
    ];

    for (const url of urls) {
        try {
            console.log(`Trying ${url}`);
            const res = await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } });
            console.log(`Success! Data length: ${res.data.data.length}`);
            return;
        } catch (e) {
            console.log(`Failed: ${e.response?.status || e.message}`);
        }
    }
}
test();
