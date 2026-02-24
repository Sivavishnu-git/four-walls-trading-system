# 🚀 Deployment Guide - Nifty Future OI Monitor

This guide covers deploying your OI Monitor application to the cloud.

## 📋 Deployment Options

### Option 1: Render (Recommended - Free Tier Available)
### Option 2: Railway (Easy Setup)
### Option 3: Heroku (Paid)
### Option 4: VPS (DigitalOcean, AWS EC2, etc.)

---

## 🎯 Option 1: Deploy to Render (Recommended)

Render offers a free tier and is perfect for this application.

### Step 1: Prepare Your Application

1. **Update package.json** - Add start script
2. **Create render.yaml** - Configuration file (already created)
3. **Update environment variables** for production

### Step 2: Push to GitHub

```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### Step 3: Deploy on Render

1. Go to [render.com](https://render.com) and sign up
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `nifty-oi-monitor`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server.js`
   - **Plan**: Free

5. Add Environment Variables:
   ```
   UPSTOX_API_KEY=your_api_key
   UPSTOX_API_SECRET=your_api_secret
   UPSTOX_REDIRECT_URI=https://your-app.onrender.com/api/auth/callback
   NODE_ENV=production
   ```

6. Click "Create Web Service"

### Step 4: Update Redirect URI

After deployment, update:
1. Your Upstox app redirect URI to: `https://your-app.onrender.com/api/auth/callback`
2. The `UPSTOX_REDIRECT_URI` environment variable in Render

---

## 🎯 Option 2: Deploy to Railway

Railway is another excellent option with a generous free tier.

### Step 1: Install Railway CLI (Optional)

```bash
npm install -g @railway/cli
railway login
```

### Step 2: Deploy

```bash
railway init
railway up
```

### Step 3: Add Environment Variables

In Railway dashboard:
1. Go to your project
2. Click "Variables"
3. Add:
   ```
   UPSTOX_API_KEY=your_api_key
   UPSTOX_API_SECRET=your_api_secret
   UPSTOX_REDIRECT_URI=https://your-app.railway.app/api/auth/callback
   NODE_ENV=production
   ```

### Step 4: Update Redirect URI

Update your Upstox app redirect URI to match Railway's URL.

---

## 🎯 Option 3: Deploy to VPS (DigitalOcean, AWS, etc.)

For more control, deploy to a VPS.

### Step 1: Setup VPS

```bash
# SSH into your server
ssh root@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (Process Manager)
npm install -g pm2
```

### Step 2: Clone and Setup

```bash
# Clone your repository
git clone https://github.com/your-username/your-repo.git
cd your-repo

# Install dependencies
npm install

# Build frontend
npm run build
```

### Step 3: Configure Environment

```bash
# Create .env file
nano .env
```

Add your environment variables.

### Step 4: Start with PM2

```bash
# Start the server
pm2 start server.js --name oi-monitor

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Step 5: Setup Nginx (Optional)

```bash
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/oi-monitor
```

Add configuration (see nginx.conf in this repo).

---

## 📝 Important Notes

### Security Considerations

1. **Never commit .env file** - Already in .gitignore
2. **Use environment variables** for all secrets
3. **Enable HTTPS** in production
4. **Rotate access tokens** regularly

### Upstox Configuration

After deployment, update:
1. **Redirect URI** in Upstox Developer Console
2. **Allowed Origins** if required

### Monitoring

- Check logs regularly
- Set up error monitoring (Sentry, LogRocket)
- Monitor API rate limits

---

## 🔧 Troubleshooting

### Issue: OAuth Callback Not Working

**Solution**: Ensure `UPSTOX_REDIRECT_URI` matches exactly with:
- Environment variable
- Upstox Developer Console setting
- Must use HTTPS in production

### Issue: CORS Errors

**Solution**: Update CORS configuration in `server.js` to allow your frontend domain.

### Issue: Build Fails

**Solution**: 
- Check Node.js version (use v18 or v20)
- Ensure all dependencies are in `package.json`
- Check build logs for specific errors

---

## 📊 Post-Deployment Checklist

- [ ] Application is accessible via URL
- [ ] Login to Upstox works
- [ ] OI data is loading correctly
- [ ] No console errors
- [ ] Environment variables are set
- [ ] HTTPS is enabled
- [ ] Redirect URI is updated in Upstox
- [ ] Monitoring is setup

---

## 🆘 Support

If you encounter issues:
1. Check application logs
2. Verify environment variables
3. Test Upstox API credentials
4. Check network/firewall settings

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Upstox API Documentation](https://upstox.com/developer/api-documentation)
- [PM2 Documentation](https://pm2.keymetrics.io/docs)
