import axios from "axios";
const token =
  "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTk0OWZhMDFmNDJkZjUxNGQxMzRlMDYiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MTM0Nzg3MiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzcxMzY1NjAwfQ.P6hCwzFa0poXC5F4fIHF2Izo_XE17OqFisb45zSjZrw";

async function search() {
  try {
    const response = await axios.get(
      "https://api.upstox.com/v2/market/instrument/search?symbol=NIFTY",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    const futures = response.data.data.filter(
      (i) => i.segment === "NSE_FO" && i.instrument_type === "FUT",
    );
    console.log(JSON.stringify(futures, null, 2));
  } catch (e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
search();
