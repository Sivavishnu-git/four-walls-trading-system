import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

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

  useEffect(() => {
    if (!instrumentKey) return;
    setForm((prev) => ({ ...prev, instrument_token: instrumentKey }));
  }, [instrumentKey]);

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

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
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || json?.message || "Order placement failed");
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
