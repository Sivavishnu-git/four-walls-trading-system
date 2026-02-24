// Native fetch used

async function search() {
  const token =
    "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiIzOUJER0MiLCJqdGkiOiI2OTcyZDY4YmJkNDA4NDUyZWJkZDU2Y2QiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc2OTEzMzcwNywiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzY5MjA1NjAwfQ.Y07xBGIEMTbHT3UAHKJQnBhkaycugRF72zoU94VkFko";
  const symbol = "NIFTY";

  try {
    const response = await fetch(
      `http://localhost:3000/api/search?symbol=${encodeURIComponent(symbol)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}

search();
