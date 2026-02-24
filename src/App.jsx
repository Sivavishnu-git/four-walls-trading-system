import React, { useState, useEffect } from "react";
import { OIMonitor } from "./components/OIMonitor";
import { LogIn, LogOut } from "lucide-react";

function App() {
  const [accessToken, setAccessToken] = useState(() => {
    return (
      localStorage.getItem("upstox_access_token") ||
      import.meta.env.VITE_UPSTOX_ACCESS_TOKEN ||
      ""
    );
  });

  return (
    <div
      className="App"
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: "#1e222d",
          borderBottom: "2px solid #2a2e39",
        }}
      >
        <h1
          style={{
            color: "#fff",
            margin: 0,
            fontSize: "20px",
            fontWeight: "600",
          }}
        >
          Nifty Future OI Monitor
        </h1>
      </div>

      {/* OI Monitor Content */}
      <div style={{ flex: 1, overflow: "auto", backgroundColor: "#f0f3fa" }}>
        <OIMonitor token={accessToken} />
      </div>
    </div>
  );
}

export default App;
