import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.UPSTOX_ACCESS_TOKEN || process.env.VITE_UPSTOX_ACCESS_TOKEN;
const key = process.env.VITE_INSTRUMENT_KEY || 'NSE_FO|59182';

async function check() {
    try {
        console.log(`Checking key: ${key}`);
        const url = `http://localhost:3000/api/quotes?instrument_keys=${encodeURIComponent(key)}`;
        const res = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('Response Status:', res.status);
        console.log('Data:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

check();
