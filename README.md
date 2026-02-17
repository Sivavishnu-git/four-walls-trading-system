# Nifty Future OI Monitor

A real-time Open Interest (OI) monitoring application for Nifty Futures using Upstox API.

## 🚀 Quick Deploy

**Deploy to cloud in 5 minutes!** → [QUICK_DEPLOY.md](./QUICK_DEPLOY.md)

## Features

- **Real-time OI Tracking**: Monitor Open Interest changes for Nifty Futures
- **OI Change Detection**: Track increases and decreases in Open Interest
- **Live Data Updates**: Polling-based updates every few seconds
- **Upstox Integration**: OAuth authentication with Upstox API
- **Cloud Ready**: Deploy to Render, Railway, or any Node.js hosting

## Setup

### Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env`
   - Add your Upstox API credentials:
     ```
     UPSTOX_API_KEY=your_api_key
     UPSTOX_API_SECRET=your_api_secret
     UPSTOX_REDIRECT_URI=http://localhost:3000/api/auth/callback
     VITE_INSTRUMENT_KEY=NSE_FO|49229
     ```

3. **Run the Application**
   ```bash
   # Start the proxy server (in one terminal)
   node proxy-server.js

   # Start the frontend (in another terminal)
   npm run dev
   ```

4. **Login to Upstox**
   - Click the "Login to Upstox" button
   - Authorize the application
   - You'll be redirected back with an access token

### Production Deployment

#### Option 1: Render (Recommended - Free)
See [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) for 5-minute deployment guide.

#### Option 2: Railway
```bash
railway init
railway up
```

#### Option 3: VPS/Cloud Server
See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

## Project Structure

```
├── src/
│   ├── components/
│   │   └── OIMonitor.jsx       # Main OI monitoring component
│   ├── hooks/
│   │   └── useUpstoxPolling.js # Polling hook for data fetching
│   ├── App.jsx                  # Main application
│   └── main.jsx                 # Entry point
├── proxy-server.js              # Development proxy server
├── server.js                    # Production server (API + static files)
├── scripts/
│   └── findNiftyFuture.js      # Utility to find Nifty Future instrument
└── utils/
    └── tokenManager.js          # Token management utilities
```

## Usage

Once logged in, the OI Monitor will display:
- Current Open Interest value
- OI change (increase/decrease)
- Real-time updates with visual indicators
- Last update timestamp

## Technologies

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **API**: Upstox Developer API
- **Styling**: CSS-in-JS (inline styles)
- **Deployment**: Render / Railway / VPS

## Scripts

```bash
npm run dev      # Start development server (frontend only)
npm run proxy    # Start proxy server (development)
npm run build    # Build for production
npm start        # Start production server
npm run preview  # Preview production build
```

## Environment Variables

### Required
- `UPSTOX_API_KEY` - Your Upstox API key
- `UPSTOX_API_SECRET` - Your Upstox API secret
- `UPSTOX_REDIRECT_URI` - OAuth redirect URI

### Optional
- `VITE_INSTRUMENT_KEY` - Nifty Future instrument key (default: NSE_FO|49229)
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)

## Deployment Guides

- **Quick Start**: [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) - Deploy in 5 minutes
- **Comprehensive**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - All deployment options
- **Cleanup Log**: [CLEANUP_SUMMARY.md](./CLEANUP_SUMMARY.md) - What was removed

## Testing Production Build Locally

```bash
# Windows
test_production.bat

# Linux/Mac
npm run build && npm start
```

Then visit: http://localhost:3000

## API Endpoints

### Authentication
- `GET /api/auth/login` - Redirect to Upstox login
- `GET /api/auth/callback` - OAuth callback handler

### Market Data
- `GET /api/quotes?instrument_keys=NSE_FO|49229` - Get market quotes
- `GET /api/tools/find-nifty-future` - Find Nifty Future contracts

### Health Check
- `GET /api/health` - Server health status

## Troubleshooting

### Login Issues
- Verify `UPSTOX_REDIRECT_URI` matches in both .env and Upstox Developer Console
- Use HTTPS in production
- Check browser console for errors

### OI Data Not Loading
- Ensure you're logged in
- Check instrument key is correct
- Verify access token is valid
- Check browser console and network tab

### Deployment Issues
- Verify all environment variables are set
- Check build logs for errors
- Ensure Node.js version is 18 or higher

## Notes

- The application uses polling instead of WebSockets for data updates
- Access tokens are stored in localStorage
- The proxy server handles CORS and API authentication
- Free tier on Render sleeps after 15 minutes of inactivity

## Support

For issues or questions:
1. Check the deployment guides
2. Review browser console logs
3. Verify Upstox API credentials
4. Check server logs

## License

MIT

---

**Ready to deploy?** → [QUICK_DEPLOY.md](./QUICK_DEPLOY.md)
