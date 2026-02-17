# 🚀 Quick Deploy to Render (5 Minutes)

## Prerequisites
- GitHub account
- Upstox Developer account with API credentials
- Your code pushed to GitHub

---

## Step-by-Step Deployment

### 1️⃣ Prepare Your Repository

Make sure your code is pushed to GitHub:

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2️⃣ Sign Up on Render

1. Go to [render.com](https://render.com)
2. Click **"Get Started for Free"**
3. Sign up with GitHub

### 3️⃣ Create New Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Select your `LiveTrading` repository

### 4️⃣ Configure Service

Fill in the following:

| Field | Value |
|-------|-------|
| **Name** | `nifty-oi-monitor` (or your choice) |
| **Region** | Singapore (or closest to you) |
| **Branch** | `main` |
| **Root Directory** | (leave empty) |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node server.js` |
| **Plan** | `Free` |

### 5️⃣ Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these variables:

```
NODE_ENV=production
UPSTOX_API_KEY=your_api_key_here
UPSTOX_API_SECRET=your_api_secret_here
UPSTOX_REDIRECT_URI=https://your-app-name.onrender.com/api/auth/callback
```

**Important**: Replace `your-app-name` with your actual Render app name!

### 6️⃣ Deploy

1. Click **"Create Web Service"**
2. Wait for deployment (2-3 minutes)
3. You'll get a URL like: `https://your-app-name.onrender.com`

### 7️⃣ Update Upstox Developer Console

1. Go to [Upstox Developer Console](https://account.upstox.com/developer/apps)
2. Select your app
3. Update **Redirect URI** to: `https://your-app-name.onrender.com/api/auth/callback`
4. Save changes

### 8️⃣ Test Your Application

1. Visit your Render URL: `https://your-app-name.onrender.com`
2. Click **"Login to Upstox"**
3. Authorize the application
4. You should see the OI Monitor dashboard!

---

## 🎉 You're Live!

Your OI Monitor is now deployed and accessible from anywhere!

---

## 📝 Important Notes

### Free Tier Limitations
- App sleeps after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- 750 hours/month free (enough for 24/7 if you have only one app)

### Keeping App Awake (Optional)
Use a service like [UptimeRobot](https://uptimerobot.com) to ping your app every 5 minutes:
- Ping URL: `https://your-app-name.onrender.com/api/health`

### Updating Your App
Just push to GitHub:
```bash
git add .
git commit -m "Update app"
git push origin main
```
Render will automatically redeploy!

---

## 🔧 Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Ensure `package.json` has all dependencies
- Verify Node.js version compatibility

### Login Doesn't Work
- Verify `UPSTOX_REDIRECT_URI` matches exactly
- Check Upstox Developer Console redirect URI
- Must use HTTPS in production

### App Shows Error
- Check logs in Render dashboard
- Verify all environment variables are set
- Test `/api/health` endpoint

---

## 📊 Monitoring

### View Logs
1. Go to Render dashboard
2. Click your service
3. Click **"Logs"** tab

### Check Status
Visit: `https://your-app-name.onrender.com/api/health`

Should return:
```json
{
  "status": "ok",
  "environment": "production",
  "timestamp": "2026-02-17T..."
}
```

---

## 🆙 Upgrade Options

If you need better performance:
- **Starter Plan** ($7/month) - No sleep, faster
- **Standard Plan** ($25/month) - More resources

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Render account created
- [ ] Web service created
- [ ] Environment variables set
- [ ] Deployment successful
- [ ] Upstox redirect URI updated
- [ ] Login tested
- [ ] OI data loading correctly
- [ ] (Optional) Uptime monitoring setup

---

## 🎯 Next Steps

1. **Share your app** - Send the URL to others
2. **Monitor usage** - Check Render dashboard regularly
3. **Update instrument key** - When Nifty Future contract changes
4. **Add features** - Customize as needed

---

## 💡 Pro Tips

1. **Custom Domain**: Add your own domain in Render settings
2. **Auto-deploy**: Enable auto-deploy from GitHub
3. **Notifications**: Set up deploy notifications in Render
4. **Backups**: Keep your code in GitHub (automatic backup)

---

Need help? Check the full [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for more options!
