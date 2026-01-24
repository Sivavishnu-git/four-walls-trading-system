# How to Deploy "LiveTrading" to AWS

Since this is a web-based mobile app (React + Vite), "running it in the cloud" means **hosting the website** so you can access it from any device in the world.

The best service on AWS for this is **AWS Amplify**. It is designed for React apps and handles everything automatically.

## Prerequisites
1. An **AWS Account** (aws.amazon.com).
2. A **GitHub Account**.

## Step 1: Push your code to GitHub
You need to put your code online so AWS can read it.
1. Create a new Repository on GitHub (e.g., `nifty-live-chart`).
2. Run these commands in your projects terminal:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/nifty-live-chart.git
   git push -u origin main
   ```

## Step 2: Connect to AWS Amplify
1. Log in to the [AWS Console](https://console.aws.amazon.com/).
2. Search for **"Amplify"** in the search bar and click it.
3. Scroll down and click **"Get started"** (or "New App" -> "Host Web App").
4. Select **GitHub** and click **Continue**.
5. Authorize AWS to access your GitHub account.
6. Select your repository (`nifty-live-chart`) and the `main` branch.

## Step 3: Configure Build Settings
Amplify usually detects Vite settings automatically, but double-check these:
- **Build command**: `npm run build`
- **Output directory**: `dist`

Click **Next** and then **Save and Deploy**.

## Step 4: Access Your App
Wait 2-3 minutes. AWS is now:
1. Cloning your code.
2. Installing dependencies.
3. Building the website.
4. Deploying it to a global CDN.

Once finished, you will see a URL like:
`https://main.d2x3y4z.amplifyapp.com`

**Open this URL on your Mobile Phone.** You now have your app running in the cloud!
