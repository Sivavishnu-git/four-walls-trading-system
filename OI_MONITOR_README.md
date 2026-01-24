# Nifty Future OI Monitor - User Guide

## 🎯 Overview

The **Nifty Future OI Monitor** is a real-time Open Interest (OI) tracking system that captures and displays OI changes for Nifty Future using the Upstox REST API polling.

## ✨ Features

### 1. **Real-Time OI Tracking**
- Captures Open Interest data every 2 minutes automatically
- Displays current OI value with live updates
- Shows OI change from the previous interval
- Tracks up to 5 historical data points (10 minutes of data)

### 2. **Beautiful Dashboard**
- **Stats Cards**: Display key metrics including:
  - Current OI
  - OI Change (2 min interval)
  - Last Update Time
  - Number of Data Points Captured
  
- **History Table**: Shows detailed OI change history with:
  - Timestamp
  - Open Interest value
  - Change amount (with color coding)
  - Change percentage
  - Last Traded Price (LTP)

### 3. **Visual Indicators**
- 🟢 Green for OI increase (bullish)
- 🔴 Red for OI decrease (bearish)
- Animated status indicators
- Smooth transitions and hover effects

### 4. **Tab Navigation**
- **OI Monitor Tab**: Real-time OI tracking (default view)
- **Price Chart Tab**: Candlestick chart with technical analysis

## 🚀 Getting Started

### Prerequisites
1. **Upstox Account**: You need an active Upstox trading account
2. **Access Token**: Generate an access token from Upstox Developer Console

### Starting the Application

1. **Start the Proxy Server** (Terminal 1):
   ```bash
   node proxy-server.js
   ```
   This will start on `http://localhost:3000`

2. **Start the Frontend** (Terminal 2):
   ```bash
   npm run dev
   ```
   This will start on `http://localhost:5173`

3. **Open in Browser**:
   Navigate to `http://localhost:5173`

## 📱 How to Use

### Step 1: Enter Access Token
1. Click the **"Enter Token"** button (🔒 icon) in the header
2. Paste your Upstox Access Token in the password field
3. Click **"Go Live"** button

### Step 2: Monitor OI Changes
- The system will automatically connect to Upstox API via polling
- Status indicator will show **"Live (Polling)"** with a green dot
- OI data will be captured immediately and then updated every 2 seconds (configurable)
- Watch the stats cards update in real-time
- View historical changes in the table below (tracked every 2 minutes)

### Step 3: Disconnect
- Click the **"Disconnect"** button to stop monitoring
- All captured data will be preserved until you refresh the page

## 🔧 Configuration

### Instrument Key
The default instrument is set to Nifty Future. To change it:

1. Open `src/components/OIMonitor.jsx`
2. Locate line 16:
   ```javascript
   const instrumentKey = "NSE_FO|43650"; // Example: Nifty Future current month
   ```
3. Replace with your desired instrument key

### Data Retention
Currently set to keep **5 records** (10 minutes of data). To change:

1. Open `src/components/OIMonitor.jsx`
2. Locate line 51-52:
   ```javascript
   // Keep only last 5 entries (10 minutes of data)
   if (updated.length > 5) {
   ```
3. Change `5` to your desired number

### Capture Interval
Currently set to **2 minutes**. To change:

1. Open `src/components/OIMonitor.jsx`
2. Locate line 72:
   ```javascript
   intervalRef.current = setInterval(captureOI, 2 * 60 * 1000);
   ```
3. Modify `2 * 60 * 1000` (milliseconds) to your desired interval

## 📊 Understanding the Data

### Open Interest (OI)
- **Definition**: Total number of outstanding derivative contracts
- **Increasing OI**: New positions are being created (bullish/bearish depending on price)
- **Decreasing OI**: Positions are being closed (profit booking or stop losses)

### OI Change Interpretation
- **+OI with +Price**: Strong bullish sentiment (long buildup)
- **+OI with -Price**: Strong bearish sentiment (short buildup)
- **-OI with +Price**: Short covering (bullish)
- **-OI with -Price**: Long unwinding (bearish)

## 🎨 UI Components

### Header Section
- **Title**: "Nifty Future OI Monitor" with animated icon
- **Status Badge**: Shows connection status (Live/Disconnected/Connecting)
- **Token Input**: Secure password field for API token
- **Connect/Disconnect Button**: Control the live feed

### Stats Grid
Four cards displaying:
1. **Current OI**: Latest Open Interest value
2. **OI Change**: Change from last interval with trend icon
3. **Last Update**: Timestamp of last data capture
4. **Data Points**: Number of intervals captured

### History Table
- **Sticky Header**: Remains visible while scrolling
- **Latest Row Highlight**: Most recent data highlighted in green
- **Color-Coded Changes**: Green for increase, red for decrease
- **Responsive Design**: Works on desktop and mobile

## 🔐 Security Notes

1. **Never commit your access token** to version control
2. Access tokens are stored only in component state (not persisted)
3. Use the password input field to keep token hidden
4. Tokens expire - generate new ones as needed

## 🐛 Troubleshooting

### Connection Issues
- **Error: "Auth Failed"**
  - Check if your access token is valid
  - Ensure proxy server is running on port 3000
  - Verify Upstox API is accessible

- **Status shows "Connecting" indefinitely**
  - Check browser console for errors
  - Verify instrument key is correct
  - Ensure WebSocket connection is not blocked by firewall

### No Data Appearing
- **OI shows 0**
  - Verify you're using the correct instrument key for Nifty Future
  - Check if market is open (OI updates during trading hours)
  - Ensure "full" mode subscription is working

### Proxy Server Issues
- **Port 3000 already in use**
  - Stop other applications using port 3000
  - Or change the port in `proxy-server.js` and update API calls

## 📝 Technical Details

### Technology Stack
- **Frontend**: React 19 with Hooks
- **Styling**: Vanilla CSS with gradients and animations
- **Charts**: Lightweight Charts library
- **API Mode**: Upstox Market Quote API v2 (Polling)
- **Icons**: Lucide React

### Data Flow
1. User enters access token
2. Frontend calls proxy server `/api/quotes`
3. Proxy server fetches JSON data from Upstox
4. Data is transformed and updated in the UI
5. History table captures a snapshot every 2 minutes

### File Structure
```
src/
├── components/
│   ├── OIMonitor.jsx       # Main OI Monitor component
│   └── Chart.jsx           # Price chart component
├── hooks/
│   └── useUpstoxPolling.js   # REST API polling hook
├── App.jsx                 # Main app with tab navigation
└── index.css              # Styles including OI Monitor styles
```

## 🎯 Future Enhancements

Potential features to add:
- Export data to CSV
- OI vs Price correlation chart
- Alerts for significant OI changes
- Multiple instrument monitoring
- Historical OI data analysis
- Mobile app version

## 📞 Support

For issues or questions:
1. Check the browser console for error messages
2. Verify all prerequisites are met
3. Ensure Upstox API credentials are valid
4. Review the troubleshooting section

## 📄 License

This project is part of the LiveTrading application.

---

**Happy Trading! 📈**

*Remember: This tool is for informational purposes only. Always do your own research before making trading decisions.*
