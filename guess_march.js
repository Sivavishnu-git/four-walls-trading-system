import axios from "axios";
const token = "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTk0OWZhMDFmNDJkZjUxNGQxMzRlMDYiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MTM0Nzg3MiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzcxMzY1NjAwfQ.P6hCwzFa0poXC5F4fIHF2Izo_XE17OqFisb45zSjZrw";

async function guess() {
    const keys = ["NSE_FO:NIFTY26MARFUT", "NSE_FO:NIFTY26MAR26FUT"];
    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${keys.join(",")}`;
    try {
        const res = await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } });
        console.log("Results:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log("Error:", e.response?.data || e.message);
    }
}
guess();
