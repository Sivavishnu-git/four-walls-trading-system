import React, { useState, useEffect } from 'react';
import { OIMonitor } from './components/OIMonitor';
import { LogIn, LogOut } from 'lucide-react';

function App() {
    const [accessToken, setAccessToken] = useState(() => {
        return localStorage.getItem('upstox_access_token') || import.meta.env.VITE_UPSTOX_ACCESS_TOKEN || "";
    });

    // Handle OAuth Callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const error = params.get('error');

        if (token) {
            setAccessToken(token);
            localStorage.setItem('upstox_access_token', token);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            alert("Login Successful! Token saved.");
        } else if (error) {
            alert("Login Failed: " + error);
        }
    }, []);

    const handleLogin = () => {
        window.location.href = 'http://localhost:3000/api/auth/login';
    };

    const handleLogout = () => {
        setAccessToken("");
        localStorage.removeItem('upstox_access_token');
    };

    return (
        <div className="App" style={{ height: '100vh', width: '100vw', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: '#1e222d',
                borderBottom: '2px solid #2a2e39'
            }}>
                <h1 style={{
                    color: '#fff',
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: '600'
                }}>
                    Nifty Future OI Monitor
                </h1>

                {/* Login/Logout Button */}
                <div>
                    {!accessToken ? (
                        <button
                            onClick={handleLogin}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                background: '#2962ff',
                                border: 'none',
                                color: '#fff',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            <LogIn size={16} /> Login to Upstox
                        </button>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ color: '#4caf50', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ● Connected
                            </span>
                            <button
                                onClick={handleLogout}
                                title="Logout / Clear Token"
                                style={{
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    color: '#aaa',
                                    padding: '6px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* OI Monitor Content */}
            <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f0f3fa' }}>
                <OIMonitor token={accessToken} />
            </div>
        </div>
    );
}

export default App;
