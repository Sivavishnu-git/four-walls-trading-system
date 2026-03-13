import axios from "axios";
import fs from "fs";
import zlib from "zlib";

async function downloadAndFormat() {
  const url =
    "https://assets.upstox.com/market-quote/instruments/exchange/NFO.json.gz";
  const filePath = "NFO.json.gz";

  console.log("Downloading NFO Master List...");
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => {
      console.log("Download complete. Decompressing and formatting...");

      const fileContent = fs.readFileSync(filePath);
      zlib.gunzip(fileContent, (err, decompress) => {
        if (err) return reject(err);

        const data = JSON.parse(decompress.toString());
        const niftyFutures = data.filter(
          (i) =>
            i.trading_symbol.startsWith("NIFTY") && i.instrument_type === "FUT",
        );

        fs.writeFileSync(
          "NIFTY_FUTURES.json",
          JSON.stringify(niftyFutures, null, 2),
        );
        console.log(
          "Success! Formatted Nifty futures saved to NIFTY_FUTURES.json",
        );
        resolve();
      });
    });
    writer.on("error", reject);
  });
}

downloadAndFormat().catch(console.error);
