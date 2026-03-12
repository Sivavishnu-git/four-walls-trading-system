import axios from "axios";
const token =
  "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTk0OWZhMDFmNDJkZjUxNGQxMzRlMDYiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MTM0Nzg3MiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzcxMzY1NjAwfQ.P6hCwzFa0poXC5F4fIHF2Izo_XE17OqFisb45zSjZrw";

async function trySearch() {
  const endpoints = [
    "https://api.upstox.com/v2/market/instruments/search?symbol=NIFTY",
    "https://api.upstox.com/v2/market/instrument/search?symbol=NIFTY",
    "https://api.upstox.com/v2/market/instruments/NSE_FO",
    "https://api.upstox.com/v2/market/instrument/NSE_FO",
  ];

  for (const url of endpoints) {
    console.log(`Checking ${url}...`);
    try {
      const resp = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      console.log(
        `Success on ${url}:`,
        JSON.stringify(resp.data).substring(0, 100),
      );
      return;
    } catch (e) {
      console.log(
        `Failed on ${url}: ${e.response ? e.response.status : e.message}`,
      );
    }
  }
}
trySearch();
