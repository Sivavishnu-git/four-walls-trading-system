import axios from "axios";
import zlib from "zlib";
import { promisify } from "util";
const gunzip = promisify(zlib.gunzip);

async function findMarchFuture() {
    const url = "https://assets.upstox.com/market-quote/instruments/exchange/NFO.json.gz";
    try {
        console.log("Downloading NFO master list...");
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log("Decompressing...");
        const decompressed = await gunzip(response.data);
        const data = JSON.parse(decompressed.toString());

        console.log("Searching for NIFTY MAR 2026 Future...");
        const matches = data.filter(i =>
            i.name === "NIFTY" &&
            i.instrument_type === "FUT" &&
            i.trading_symbol.includes("MAR") &&
            i.trading_symbol.includes("26")
        );

        if (matches.length > 0) {
            matches.forEach(m => {
                console.log(`Symbol: ${m.trading_symbol}, Key: ${m.instrument_key}, Expiry: ${m.expiry}`);
            });
        } else {
            console.log("No matches found. Showing first few NIFTY FUT results:");
            console.log(data.filter(i => i.name === "NIFTY" && i.instrument_type === "FUT").slice(0, 5));
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}
findMarchFuture();
