import { LogIn, Shield, TrendingUp } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Shown when no Upstox access token is present. OAuth via AuthContext (callback ?token=).
 * @param {{ embeddedHeader?: boolean }} props — when true, hide card title (App shows top bar).
 */
export function LoginPage({ embeddedHeader = false }) {
  const { loginRedirect } = useAuth();

  return (
    <div
      className="login-page-root"
      style={{
        flex: embeddedHeader ? 1 : undefined,
        alignSelf: "stretch",
        minHeight: embeddedHeader ? "calc(100vh - 52px)" : "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
        background:
          "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(41, 98, 255, 0.12), transparent 55%), #131722",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "40px 36px",
          borderRadius: 16,
          border: "1px solid rgba(42, 46, 57, 0.9)",
          background: "rgba(19, 23, 34, 0.95)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03) inset",
        }}
      >
        {!embeddedHeader && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(145deg, rgba(38,166,154,0.25), rgba(41,98,255,0.2))",
              border: "1px solid rgba(38,166,154,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TrendingUp size={26} color="#26a69a" strokeWidth={2} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>
              Four Walls Trading
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#888", fontWeight: 500 }}>
              Nifty futures &amp; OI tools
            </p>
          </div>
        </div>
        )}

        <p style={{ margin: embeddedHeader ? "0 0 20px" : "0 0 24px", fontSize: "0.95rem", color: "#b0b3c0", lineHeight: 1.55 }}>
          Sign in with your <strong style={{ color: "#e0e0e0" }}>Upstox</strong> account to load live quotes, orders, and
          portfolio data. You will be redirected to Upstox to approve access.
        </p>

        <button
          type="button"
          onClick={loginRedirect}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "14px 20px",
            fontSize: "1rem",
            fontWeight: 700,
            color: "#fff",
            background: "linear-gradient(180deg, #2a7d6e 0%, #1e6b5e 100%)",
            border: "1px solid rgba(38,166,154,0.5)",
            borderRadius: 10,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(38, 166, 154, 0.25)",
          }}
        >
          <LogIn size={20} strokeWidth={2.5} />
          Sign in with Upstox
        </button>

        <div
          style={{
            marginTop: 22,
            paddingTop: 20,
            borderTop: "1px solid rgba(42, 46, 57, 0.9)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <Shield size={16} color="#666" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#666", lineHeight: 1.55 }}>
            OAuth tokens are stored in your browser. Use the same redirect URL configured in your Upstox developer app
            and on the server (<code style={{ fontSize: "0.7rem", color: "#888" }}>/api/auth/callback</code>).
          </p>
        </div>
      </div>

      <p style={{ marginTop: 28, fontSize: "0.72rem", color: "#555", textAlign: "center", maxWidth: 360 }}>
        By continuing, you agree to Upstox&apos;s terms for API access.
      </p>
    </div>
  );
}
