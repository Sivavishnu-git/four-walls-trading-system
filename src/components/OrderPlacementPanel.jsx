import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

function extractErrorReason(json, fallback = "Order placement failed") {
  if (!json) return fallback;
  if (typeof json === "string" && json.trim()) return json;
  if (json.error && typeof json.error === "string") return json.error;
  if (json.message && typeof json.message === "string") return json.message;
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const first = json.errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first.message === "string") return first.message;
    if (first && typeof first.error_code === "string") return first.error_code;
  }
  if (json.data && typeof json.data.error === "string") return json.data.error;
  return fallback;
}

export function OrderPlacementPanel({ instrumentKey, accessToken }) {
  const [form, setForm] = useState({
    instrument_token: instrumentKey || "",
    quantity: "1",
    product: "I",
    validity: "DAY",
    order_type: "MARKET",
    transaction_type: "BUY",
    price: "0",
    trigger_price: "0",
    disclosed_quantity: "0",
    is_amo: false,
    tag: "fw-ui",
  });
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [atmInfo, setAtmInfo] = useState(null);
  const [atmType, setAtmType] = useState("CE");
  const [loadingAtm, setLoadingAtm] = useState(false);

  useEffect(() => {
    if (!instrumentKey) return;
    setForm((prev) => ({ ...prev, instrument_token: instrumentKey }));
  }, [instrumentKey]);

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const loadAtm = async () => {
    setLoadingAtm(true);
    setError("");
    try {
      const res = await apiFetch("/api/atm-options", { accessToken });
      const json = await res.json();
      if (!res.ok || json?.status !== "success") {
        throw new Error(json?.error || "Failed to fetch ATM options");
      }
      setAtmInfo(json.data);
      const atmStrike = json.data?.atm_strike;
      const options = Array.isArray(json.data?.options) ? json.data.options : [];
      const preferred = options.find((o) => o.strike === atmStrike && o.type === atmType);
      const fallback = options.find((o) => o.strike === atmStrike) || options[0];
      const selected = preferred || fallback;
      if (selected?.instrument_key) {
        setForm((prev) => ({
          ...prev,
          instrument_token: selected.instrument_key,
          quantity: String(selected.lot_size || prev.quantity || "1"),
        }));
      }
    } catch (e) {
      setError(e.message || "Failed to fetch ATM options");
    } finally {
      setLoadingAtm(false);
    }
  };

  useEffect(() => {
    loadAtm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!atmInfo?.options?.length) return;
    const atmStrike = atmInfo.atm_strike;
    const selected = atmInfo.options.find((o) => o.strike === atmStrike && o.type === atmType);
    if (!selected?.instrument_key) return;
    setForm((prev) => ({
      ...prev,
      instrument_token: selected.instrument_key,
      quantity: String(selected.lot_size || prev.quantity || "1"),
    }));
  }, [atmType, atmInfo]);

  const placeOrder = async () => {
    setPlacing(true);
    setError("");
    setResult(null);
    try {
      const payload = {
        instrument_token: form.instrument_token.trim(),
        quantity: Number(form.quantity),
        product: form.product,
        validity: form.validity,
        order_type: form.order_type,
        transaction_type: form.transaction_type,
        price: Number(form.price || 0),
        trigger_price: Number(form.trigger_price || 0),
        disclosed_quantity: Number(form.disclosed_quantity || 0),
        is_amo: Boolean(form.is_amo),
        tag: form.tag?.trim() || undefined,
      };

      const res = await apiFetch("/api/order/place", {
        accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text || null;
      }
      if (!res.ok) {
        const reason = extractErrorReason(json, `Order placement failed (HTTP ${res.status})`);
        throw new Error(reason);
      }
      setResult(json);
    } catch (e) {
      setError(e.message || "Order placement failed");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div
      style={{
        margin: "16px 24px 0",
        padding: "12px",
        background: "linear-gradient(135deg, #1e222d 0%, #252a38 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ color: "#fff", fontSize: "0.92rem", fontWeight: 700 }}>Quick Order Placement</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={loadAtm} disabled={loadingAtm}>
          {loadingAtm ? "Finding ATM..." : "Use Nifty ATM"}
        </button>
        <select value={atmType} onChange={(e) => setAtmType(e.target.value)}>
          <option value="CE">ATM CE</option>
          <option value="PE">ATM PE</option>
        </select>
        {atmInfo?.atm_strike ? (
          <span style={{ color: "#b0b3c0", fontSize: "0.8rem" }}>
            Spot {Number(atmInfo.spot_price || 0).toFixed(2)} | ATM {atmInfo.atm_strike}
          </span>
        ) : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
        <input value={form.instrument_token} onChange={(e) => onChange("instrument_token", e.target.value)} placeholder="Instrument token" />
        <input value={form.quantity} onChange={(e) => onChange("quantity", e.target.value.replace(/[^\d]/g, ""))} placeholder="Qty" />
        <select value={form.transaction_type} onChange={(e) => onChange("transaction_type", e.target.value)}>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <select value={form.order_type} onChange={(e) => onChange("order_type", e.target.value)}>
          <option value="MARKET">MARKET</option>
          <option value="LIMIT">LIMIT</option>
          <option value="SL">SL</option>
          <option value="SL-M">SL-M</option>
        </select>
        <select value={form.product} onChange={(e) => onChange("product", e.target.value)}>
          <option value="I">I</option>
          <option value="D">D</option>
          <option value="MTF">MTF</option>
        </select>
        <input value={form.price} onChange={(e) => onChange("price", e.target.value)} placeholder="Price" />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={placeOrder} disabled={placing}>
          {placing ? "Placing..." : "Place Order"}
        </button>
        {error ? <span style={{ color: "#ef5350", fontSize: "0.8rem" }}>{error}</span> : null}
        {result ? (
          <span style={{ color: "#26a69a", fontSize: "0.8rem" }}>
            Order sent: {JSON.stringify(result?.data || result)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
