import axios from "axios";
import fs from "fs";

const token =
  "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTk0OWZhMDFmNDJkZjUxNGQxMzRlMDYiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MTM0Nzg3MiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzcxMzY1NjAwfQ.P6hCwzFa0poXC5F4fIHF2Izo_XE17OqFisb45zSjZrw";

async function scanKeys() {
  const results = [];
  const baseKey = 49200;
  const batchSize = 10;

  console.log("Scanning instrument keys to find Nifty Futures...");

  for (let i = 0; i < 100; i += batchSize) {
    const keys = [];
    for (let j = 0; j < batchSize; j++) {
      keys.push(`NSE_FO|${baseKey + i + j}`);
    }

    try {
      const resp = await axios.get(
        `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${keys.join(",")}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );

      if (resp.data.data) {
        Object.keys(resp.data.data).forEach((k) => {
          const item = resp.data.data[k];
          results.push({
            instrument_key: item.instrument_token || k,
            symbol: item.symbol,
            last_price: item.last_price,
            oi: item.oi,
          });
        });
      }
    } catch (e) {
      // Ignore errors
    }
  }

  fs.writeFileSync(
    "SCANNED_INSTRUMENTS.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    `Finished! Found ${results.length} valid instruments. Output saved to SCANNED_INSTRUMENTS.json`,
  );
}

scanKeys();
