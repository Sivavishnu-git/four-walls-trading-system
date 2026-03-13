import axios from "axios";
const token =
  "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTk0OWZhMDFmNDJkZjUxNGQxMzRlMDYiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MTM0Nzg3MiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzcxMzY1NjAwfQ.P6hCwzFa0poXC5F4fIHF2Izo_XE17OqFisb45zSjZrw";

async function search() {
  try {
    const response = await axios.get(
      "https://api.upstox.com/v2/market/instrument/search?symbol=HDFC",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    console.log(JSON.stringify(response.data, null, 2));
  } catch (e) {
    // If 404, try v2/market-quote/quotes with a known key
    console.log("Search failed, checking quote for HDFC (NSE_EQ|INE040A01034)");
    try {
      const resp = await axios.get(
        "https://api.upstox.com/v2/market-quote/quotes?instrument_key=NSE_EQ|INE040A01034",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      console.log(JSON.stringify(resp.data, null, 2));
    } catch (err) {
      console.error(err.response ? err.response.data : err.message);
    }
  }
}
search();
