import { useState } from "react";
import { KeyRound, LogIn, Shield, TrendingUp } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { MIN_ACCESS_TOKEN_LEN, normalizeAccessToken } from "../utils/authToken";

/**
 * Shown when no Upstox access token is present. OAuth or paste token (stored via AuthContext).
 */
export function LoginPage() {
  const { saveAccessToken, loginRedirect } = useAuth();
  const [tokenInput, setTokenInput] = useState("");
  const [pasteError, setPasteError] = useState(null);

  const handleUsePastedToken = () => {
    const t = normalizeAccessToken(tokenInput);
    if (t.length < MIN_ACCESS_TOKEN_LEN) {
      setPasteError(
        `Enter a token at least ${MIN_ACCESS_TOKEN_LEN} characters (optional "Bearer " prefix is stripped).`,
      );
      return;
    }
    setPasteError(null);
    saveAccessToken(t);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
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

        <p style={{ margin: "0 0 24px", fontSize: "0.95rem", color: "#b0b3c0", lineHeight: 1.55 }}>
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
            display: "flex",
            alignItems: "center",
            gap: 14,
            margin: "22px 0 18px",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "rgba(42, 46, 57, 0.9)" }} />
          <span style={{ fontSize: "0.75rem", color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            or paste token
          </span>
          <div style={{ flex: 1, height: 1, background: "rgba(42, 46, 57, 0.9)" }} />
        </div>

        <label htmlFor="login-access-token" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#9aa0ae", marginBottom: 8 }}>
          Access token
        </label>
        <textarea
          id="login-access-token"
          value={tokenInput}
          onChange={(e) => {
            setTokenInput(e.target.value);
            if (pasteError) setPasteError(null);
          }}
          placeholder="Paste Upstox access token (Bearer prefix optional)"
          spellCheck={false}
          autoComplete="off"
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            fontSize: "0.8rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineHeight: 1.45,
            color: "#e8e8e8",
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(42, 46, 57, 0.95)",
            borderRadius: 10,
            resize: "vertical",
            minHeight: 72,
            marginBottom: 10,
          }}
        />
        {pasteError && (
          <p style={{ margin: "0 0 12px", fontSize: "0.78rem", color: "#ef5350" }}>{pasteError}</p>
        )}
        <button
          type="button"
          onClick={handleUsePastedToken}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 18px",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "#2962ff",
            background: "rgba(41, 98, 255, 0.12)",
            border: "1px solid rgba(41, 98, 255, 0.35)",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          <KeyRound size={18} />
          Continue with pasted token
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
