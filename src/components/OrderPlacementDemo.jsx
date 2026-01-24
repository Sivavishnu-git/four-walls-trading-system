import { useState } from 'react';
import { useOrderPlacement } from '../hooks/useOrderPlacement';
import { TrendingUp, TrendingDown, X, Check, AlertCircle } from 'lucide-react';

export const OrderPlacementDemo = ({ token, instrumentKey = "NSE_FO|49229" }) => {
    const { placeOrder, loading, error, lastOrder } = useOrderPlacement(token);

    const [orderType, setOrderType] = useState('LIMIT');
    const [transactionType, setTransactionType] = useState('BUY');
    const [quantity, setQuantity] = useState(65); // 1 lot = 65 units
    const [price, setPrice] = useState('');
    const [triggerPrice, setTriggerPrice] = useState('');
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(null);

    const handlePlaceOrder = async () => {
        // Build order parameters
        const orderParams = {
            instrument_token: instrumentKey,
            quantity: parseInt(quantity),
            product: "I", // Intraday
            validity: "DAY",
            order_type: orderType,
            transaction_type: transactionType,
            tag: `nifty_future_${Date.now()}`
        };

        // Add price for LIMIT and SL orders
        if (orderType === 'LIMIT' || orderType === 'SL') {
            if (!price) {
                alert('Please enter a price for LIMIT/SL orders');
                return;
            }
            orderParams.price = parseFloat(price);
        }

        // Add trigger price for SL and SL-M orders
        if (orderType === 'SL' || orderType === 'SL-M') {
            if (!triggerPrice) {
                alert('Please enter a trigger price for Stop Loss orders');
                return;
            }
            orderParams.trigger_price = parseFloat(triggerPrice);
        }

        setShowConfirmation(false);

        const result = await placeOrder(orderParams);

        if (result.success) {
            setOrderSuccess({
                type: 'success',
                message: `Order placed successfully! Order ID: ${result.data.order_id || 'N/A'}`,
                data: result.data
            });
            // Reset form
            setPrice('');
            setTriggerPrice('');
        } else {
            setOrderSuccess({
                type: 'error',
                message: `Order failed: ${result.error}`,
                data: null
            });
        }

        // Clear success/error message after 5 seconds
        setTimeout(() => setOrderSuccess(null), 5000);
    };

    const confirmOrder = () => {
        setShowConfirmation(true);
    };

    const getLotSize = () => {
        return Math.floor(quantity / 65);
    };

    return (
        <div className="order-placement-demo">
            <div className="order-form-container">
                <h2>Place Order - Nifty Future</h2>
                <p className="instrument-info">Instrument: {instrumentKey}</p>

                {/* Transaction Type */}
                <div className="form-group">
                    <label>Transaction Type</label>
                    <div className="button-group">
                        <button
                            className={`btn ${transactionType === 'BUY' ? 'btn-buy active' : 'btn-buy'}`}
                            onClick={() => setTransactionType('BUY')}
                        >
                            <TrendingUp size={18} />
                            BUY
                        </button>
                        <button
                            className={`btn ${transactionType === 'SELL' ? 'btn-sell active' : 'btn-sell'}`}
                            onClick={() => setTransactionType('SELL')}
                        >
                            <TrendingDown size={18} />
                            SELL
                        </button>
                    </div>
                </div>

                {/* Order Type */}
                <div className="form-group">
                    <label>Order Type</label>
                    <select
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value)}
                        className="form-select"
                    >
                        <option value="MARKET">MARKET</option>
                        <option value="LIMIT">LIMIT</option>
                        <option value="SL">SL (Stop Loss Limit)</option>
                        <option value="SL-M">SL-M (Stop Loss Market)</option>
                    </select>
                </div>

                {/* Quantity */}
                <div className="form-group">
                    <label>Quantity (Lot Size: {getLotSize()} lots)</label>
                    <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        step="65"
                        min="65"
                        className="form-input"
                        placeholder="Enter quantity (multiples of 65)"
                    />
                </div>

                {/* Price (for LIMIT and SL orders) */}
                {(orderType === 'LIMIT' || orderType === 'SL') && (
                    <div className="form-group">
                        <label>Price</label>
                        <input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            step="0.05"
                            className="form-input"
                            placeholder="Enter limit price"
                        />
                    </div>
                )}

                {/* Trigger Price (for SL and SL-M orders) */}
                {(orderType === 'SL' || orderType === 'SL-M') && (
                    <div className="form-group">
                        <label>Trigger Price</label>
                        <input
                            type="number"
                            value={triggerPrice}
                            onChange={(e) => setTriggerPrice(e.target.value)}
                            step="0.05"
                            className="form-input"
                            placeholder="Enter trigger price"
                        />
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div className="alert alert-error">
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}

                {/* Success/Error Message */}
                {orderSuccess && (
                    <div className={`alert ${orderSuccess.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                        {orderSuccess.type === 'success' ? <Check size={18} /> : <X size={18} />}
                        {orderSuccess.message}
                    </div>
                )}

                {/* Place Order Button */}
                <button
                    onClick={confirmOrder}
                    disabled={loading || !token}
                    className={`btn-place-order ${transactionType === 'BUY' ? 'btn-buy' : 'btn-sell'}`}
                >
                    {loading ? 'Placing Order...' : `Place ${transactionType} Order`}
                </button>

                {!token && (
                    <p className="warning-text">⚠️ Please provide an access token to place orders</p>
                )}
            </div>

            {/* Confirmation Modal */}
            {showConfirmation && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Confirm Order</h3>
                        <div className="order-summary">
                            <p><strong>Type:</strong> {transactionType} {orderType}</p>
                            <p><strong>Instrument:</strong> Nifty Future</p>
                            <p><strong>Quantity:</strong> {quantity} ({getLotSize()} lots)</p>
                            {price && <p><strong>Price:</strong> ₹{price}</p>}
                            {triggerPrice && <p><strong>Trigger Price:</strong> ₹{triggerPrice}</p>}
                            <p><strong>Product:</strong> Intraday</p>
                            <p><strong>Validity:</strong> DAY</p>
                        </div>
                        <div className="modal-actions">
                            <button
                                onClick={() => setShowConfirmation(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePlaceOrder}
                                className={`btn ${transactionType === 'BUY' ? 'btn-buy' : 'btn-sell'}`}
                            >
                                Confirm {transactionType}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .order-placement-demo {
                    max-width: 500px;
                    margin: 20px auto;
                    padding: 20px;
                    background: #1a1a2e;
                    border-radius: 12px;
                    color: #fff;
                }

                .order-form-container h2 {
                    margin-bottom: 10px;
                    color: #fff;
                }

                .instrument-info {
                    color: #888;
                    font-size: 0.9rem;
                    margin-bottom: 20px;
                }

                .form-group {
                    margin-bottom: 20px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 8px;
                    color: #aaa;
                    font-size: 0.9rem;
                }

                .button-group {
                    display: flex;
                    gap: 10px;
                }

                .btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.3s ease;
                    flex: 1;
                    justify-content: center;
                }

                .btn-buy {
                    background: rgba(38, 166, 154, 0.2);
                    color: #26a69a;
                    border: 2px solid transparent;
                }

                .btn-buy.active,
                .btn-buy:hover {
                    background: #26a69a;
                    color: #fff;
                }

                .btn-sell {
                    background: rgba(239, 83, 80, 0.2);
                    color: #ef5350;
                    border: 2px solid transparent;
                }

                .btn-sell.active,
                .btn-sell:hover {
                    background: #ef5350;
                    color: #fff;
                }

                .btn-secondary {
                    background: #333;
                    color: #fff;
                }

                .btn-secondary:hover {
                    background: #444;
                }

                .form-select,
                .form-input {
                    width: 100%;
                    padding: 12px;
                    background: #0f0f1e;
                    border: 1px solid #333;
                    border-radius: 8px;
                    color: #fff;
                    font-size: 1rem;
                }

                .form-select:focus,
                .form-input:focus {
                    outline: none;
                    border-color: #26a69a;
                }

                .btn-place-order {
                    width: 100%;
                    margin-top: 10px;
                }

                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .alert {
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .alert-error {
                    background: rgba(239, 83, 80, 0.2);
                    color: #ef5350;
                    border: 1px solid #ef5350;
                }

                .alert-success {
                    background: rgba(38, 166, 154, 0.2);
                    color: #26a69a;
                    border: 1px solid #26a69a;
                }

                .warning-text {
                    color: #ff9800;
                    font-size: 0.9rem;
                    text-align: center;
                    margin-top: 10px;
                }

                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }

                .modal-content {
                    background: #1a1a2e;
                    padding: 30px;
                    border-radius: 12px;
                    max-width: 400px;
                    width: 90%;
                    border: 1px solid #333;
                }

                .modal-content h3 {
                    margin-bottom: 20px;
                    color: #fff;
                }

                .order-summary {
                    background: #0f0f1e;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }

                .order-summary p {
                    margin: 8px 0;
                    color: #aaa;
                }

                .order-summary strong {
                    color: #fff;
                }

                .modal-actions {
                    display: flex;
                    gap: 10px;
                }
            `}</style>
        </div>
    );
};
