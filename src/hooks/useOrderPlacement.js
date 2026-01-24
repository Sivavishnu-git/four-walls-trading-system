import { useState } from 'react';
import axios from 'axios';

const PROXY_BASE_URL = 'http://localhost:3000';

export const useOrderPlacement = (token) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastOrder, setLastOrder] = useState(null);

    const placeOrder = async (orderParams) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.post(
                `${PROXY_BASE_URL}/api/order/place`,
                orderParams,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setLoading(false);
            setLastOrder(response.data);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    const modifyOrder = async (orderId, modifyParams) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.put(
                `${PROXY_BASE_URL}/api/order/modify`,
                { order_id: orderId, ...modifyParams },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setLoading(false);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    const cancelOrder = async (orderId) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.delete(
                `${PROXY_BASE_URL}/api/order/cancel?order_id=${orderId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            setLoading(false);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    const getOrderBook = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(
                `${PROXY_BASE_URL}/api/order/book`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            setLoading(false);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    const getPositions = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(
                `${PROXY_BASE_URL}/api/portfolio/positions`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            setLoading(false);
            return { success: true, data: response.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
            setError(errorMessage);
            setLoading(false);
            return { success: false, error: errorMessage };
        }
    };

    return {
        placeOrder,
        modifyOrder,
        cancelOrder,
        getOrderBook,
        getPositions,
        loading,
        error,
        lastOrder
    };
};
