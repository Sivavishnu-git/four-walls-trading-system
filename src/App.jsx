import React, { useState } from 'react';
import { Chart } from './components/Chart';
import { OIMonitor } from './components/OIMonitor';
import { OrderPlacementDemo } from './components/OrderPlacementDemo';
import { BarChart3, Activity, ShoppingCart } from 'lucide-react';

function App() {
    const [activeTab, setActiveTab] = useState('oi'); // Default to OI Monitor

    return (
        <div className="App" style={{ height: '100vh', width: '100vw', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Tab Navigation */}
            <div style={{
                display: 'flex',
                gap: '8px',
                padding: '12px 16px',
                background: '#1e222d',
                borderBottom: '2px solid #2a2e39'
            }}>
                <button
                    onClick={() => setActiveTab('oi')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        background: activeTab === 'oi' ? 'linear-gradient(135deg, #26a69a 0%, #4caf50 100%)' : 'rgba(255, 255, 255, 0.05)',
                        border: activeTab === 'oi' ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#fff',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'oi' ? '600' : '400',
                        transition: 'all 0.3s ease',
                    }}
                >
                    <Activity size={18} />
                    <span>OI Monitor</span>
                </button>

                <button
                    onClick={() => setActiveTab('chart')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        background: activeTab === 'chart' ? 'linear-gradient(135deg, #26a69a 0%, #4caf50 100%)' : 'rgba(255, 255, 255, 0.05)',
                        border: activeTab === 'chart' ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#fff',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'chart' ? '600' : '400',
                        transition: 'all 0.3s ease',
                    }}
                >
                    <BarChart3 size={18} />
                    <span>Price Chart</span>
                </button>

                <button
                    onClick={() => setActiveTab('orders')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        background: activeTab === 'orders' ? 'linear-gradient(135deg, #26a69a 0%, #4caf50 100%)' : 'rgba(255, 255, 255, 0.05)',
                        border: activeTab === 'orders' ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#fff',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'orders' ? '600' : '400',
                        transition: 'all 0.3s ease',
                    }}
                >
                    <ShoppingCart size={18} />
                    <span>Place Orders</span>
                </button>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                {activeTab === 'oi' && <OIMonitor />}
                {activeTab === 'chart' && <Chart />}
                {activeTab === 'orders' && <OrderPlacementDemo token={import.meta.env.VITE_UPSTOX_ACCESS_TOKEN || ""} />}
            </div>
        </div>
    );
}

export default App;
