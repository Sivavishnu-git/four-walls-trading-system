# 📋 Deployment Checklist

Use this checklist to ensure a smooth deployment of your Nifty OI Monitor.

---

## Pre-Deployment

### Code Preparation
- [ ] All files committed to Git
- [ ] `.env` file is in `.gitignore` (never commit secrets!)
- [ ] `package.json` has `"start": "node server.js"` script
- [ ] Production server file (`server.js`) is present
- [ ] Build command works locally: `npm run build`

### Test Locally
- [ ] Development mode works: `npm run dev`
- [ ] Proxy server works: `node proxy-server.js`
- [ ] Login flow works
- [ ] OI data loads correctly
- [ ] No console errors

### Test Production Build Locally
- [ ] Run: `npm run build`
- [ ] Run: `npm start`
- [ ] Visit: http://localhost:3000
- [ ] Test login and OI monitoring

### Upstox Configuration
- [ ] Have Upstox Developer account
- [ ] API app created in Upstox Developer Console
- [ ] Have API Key
- [ ] Have API Secret
- [ ] Know your app name (for redirect URI)

---

## Deployment Platform Setup

### Option A: Render.com
- [ ] Render account created
- [ ] GitHub repository connected
- [ ] Web service created
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `node server.js`
- [ ] Region selected (e.g., Singapore)
- [ ] Plan selected (Free tier is fine)

### Option B: Railway.app
- [ ] Railway account created
- [ ] Project initialized
- [ ] GitHub repository connected
- [ ] Build and start commands configured

### Option C: VPS/Cloud Server
- [ ] Server provisioned
- [ ] Node.js installed (v18 or v20)
- [ ] PM2 installed globally
- [ ] Nginx configured (optional)
- [ ] SSL certificate setup (Let's Encrypt)

---

## Environment Variables

### Required Variables (Set in Platform)
- [ ] `NODE_ENV=production`
- [ ] `UPSTOX_API_KEY=your_api_key`
- [ ] `UPSTOX_API_SECRET=your_api_secret`
- [ ] `UPSTOX_REDIRECT_URI=https://your-app.onrender.com/api/auth/callback`

### Optional Variables
- [ ] `PORT=3000` (usually auto-set by platform)
- [ ] `VITE_INSTRUMENT_KEY=NSE_FO|49229`

**Important**: Replace `your-app.onrender.com` with your actual deployment URL!

---

## Post-Deployment

### Update Upstox Developer Console
- [ ] Go to [Upstox Developer Console](https://account.upstox.com/developer/apps)
- [ ] Select your app
- [ ] Update Redirect URI to: `https://your-app.onrender.com/api/auth/callback`
- [ ] Save changes
- [ ] **CRITICAL**: URI must match EXACTLY (including https://)

### Test Deployed Application
- [ ] Visit your deployment URL
- [ ] Page loads without errors
- [ ] Click "Login to Upstox"
- [ ] Redirected to Upstox login
- [ ] Authorize the application
- [ ] Redirected back to your app
- [ ] See "Connected" status
- [ ] OI data starts loading
- [ ] OI values update every few seconds
- [ ] No errors in browser console

### Health Check
- [ ] Visit: `https://your-app.onrender.com/api/health`
- [ ] Should return: `{"status":"ok","environment":"production",...}`

---

## Optional Enhancements

### Keep App Awake (Free Tier)
- [ ] Sign up for [UptimeRobot](https://uptimerobot.com)
- [ ] Create HTTP monitor
- [ ] URL: `https://your-app.onrender.com/api/health`
- [ ] Interval: 5 minutes
- [ ] This prevents app from sleeping

### Custom Domain
- [ ] Purchase domain (optional)
- [ ] Add custom domain in Render settings
- [ ] Update DNS records
- [ ] Update Upstox redirect URI

### Monitoring & Alerts
- [ ] Set up error tracking (Sentry, LogRocket)
- [ ] Configure uptime monitoring
- [ ] Set up email alerts for downtime
- [ ] Monitor API rate limits

---

## Troubleshooting

### Build Fails
- [ ] Check build logs in platform dashboard
- [ ] Verify Node.js version (should be 18+)
- [ ] Ensure all dependencies in `package.json`
- [ ] Test build locally first

### Deployment Succeeds but App Doesn't Work
- [ ] Check application logs
- [ ] Verify all environment variables are set
- [ ] Check health endpoint: `/api/health`
- [ ] Look for errors in platform logs

### Login Doesn't Work
- [ ] Verify `UPSTOX_REDIRECT_URI` is correct
- [ ] Check Upstox Developer Console redirect URI
- [ ] Ensure both use `https://` (not `http://`)
- [ ] Check browser console for errors
- [ ] Verify API key and secret are correct

### OI Data Not Loading
- [ ] Check if logged in (see "Connected" status)
- [ ] Verify instrument key is correct
- [ ] Check browser network tab for API errors
- [ ] Look at server logs for errors
- [ ] Test `/api/quotes` endpoint directly

### App Sleeps (Free Tier)
- [ ] Normal behavior on free tier
- [ ] Set up UptimeRobot to ping every 5 minutes
- [ ] Or upgrade to paid plan

---

## Maintenance

### Regular Tasks
- [ ] Monitor app health weekly
- [ ] Check logs for errors
- [ ] Update instrument key when Nifty contract changes
- [ ] Renew access token if expired
- [ ] Update dependencies monthly: `npm update`

### When Nifty Future Contract Changes
- [ ] Use `/api/tools/find-nifty-future` to find new contract
- [ ] Update `VITE_INSTRUMENT_KEY` environment variable
- [ ] Redeploy or restart app

### Security
- [ ] Never commit `.env` file
- [ ] Rotate API credentials periodically
- [ ] Monitor for unauthorized access
- [ ] Keep dependencies updated

---

## Success Criteria

Your deployment is successful when:
- ✅ App is accessible via public URL
- ✅ Login to Upstox works
- ✅ OI data loads and updates
- ✅ No errors in console or logs
- ✅ Health endpoint returns OK
- ✅ App stays responsive

---

## Quick Reference

### Deployment URLs
- **Render**: `https://your-app.onrender.com`
- **Railway**: `https://your-app.railway.app`
- **Custom**: `https://your-domain.com`

### Important Endpoints
- **App**: `https://your-app.onrender.com`
- **Health**: `https://your-app.onrender.com/api/health`
- **Login**: `https://your-app.onrender.com/api/auth/login`

### Support Resources
- [Render Docs](https://render.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Upstox API Docs](https://upstox.com/developer/api-documentation)

---

## Notes

- **Free Tier Limitations**: App sleeps after 15 minutes of inactivity
- **First Request**: Takes ~30 seconds to wake up
- **Monthly Limit**: 750 hours (enough for 24/7 with one app)
- **Upgrade**: Consider paid plan for always-on service

---

**Ready to deploy?** Follow [QUICK_DEPLOY.md](./QUICK_DEPLOY.md)!

**Need help?** Check [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.
