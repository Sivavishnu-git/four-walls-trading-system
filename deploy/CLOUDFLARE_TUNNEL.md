# HTTPS redirect without buying a domain (Cloudflare Tunnel)

Upstox requires **`https://`** redirect URLs. A **Cloudflare Tunnel** gives you a free `https://….trycloudflare.com` URL that forwards to Nginx on your EC2 (port **80**).

## Quick tunnel (try in 2 minutes — URL changes each restart)

SSH to your server, then:

```bash
cd ~
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Point tunnel at Nginx (serves your app + /api proxy)
cloudflared tunnel --url http://127.0.0.1:80
```

The terminal prints a line like:

```text
https://random-words-here.trycloudflare.com
```

1. Copy that **exact** base URL (no trailing slash).
2. **Upstox app** → Redirect URL:
   - `https://YOUR-SUBDOMAIN.trycloudflare.com/api/auth/callback`
3. On the server, edit **`/home/ubuntu/app/.env`**:

   ```env
   UPSTOX_REDIRECT_URI=https://YOUR-SUBDOMAIN.trycloudflare.com/api/auth/callback
   FRONTEND_URI=https://YOUR-SUBDOMAIN.trycloudflare.com
   ```

4. Restart Node:

   ```bash
   pm2 restart livetrading --update-env
   ```

5. Open the app at **`https://YOUR-SUBDOMAIN.trycloudflare.com`** (not the IP).

**Caveat:** After you **stop** `cloudflared`, the URL is gone. Next run you get a **new** URL → update Upstox + `.env` again. For a **fixed** URL, use “Named tunnel” below.

---

## Run tunnel in background (still quick / ephemeral URL)

```bash
nohup cloudflared tunnel --url http://127.0.0.1:80 > ~/cloudflared.log 2>&1 &
tail -f ~/cloudflared.log
```

Find the `https://….trycloudflare.com` line in the log, then `Ctrl+C` to stop tailing.

---

## Recovery: `https://hammer-….trycloudflare.com` no longer loads

Quick tunnel URLs **stop working** when:

- `cloudflared` exited or the server rebooted, or  
- you started a **new** tunnel (new random hostname).

**You cannot “revive” an old hostname.** You must use the **current** URL from a running `cloudflared`.

### Option A — From your Windows PC (one command)

If the app runs on EC2 and you have the SSH key:

```powershell
cd C:\path\to\LiveTrading
.\deploy\Refresh-QuickTunnel.ps1 -PublicIp "YOUR_EC2_IP" -KeyPath "D:\path\to\your.pem"
```

This SSHs in, restarts `cloudflared`, updates `/home/ubuntu/app/.env` (`UPSTOX_REDIRECT_URI`, `FRONTEND_URI`), and runs `pm2 restart livetrading --update-env`.  
Then set the **Upstox** redirect URL to the printed `…/api/auth/callback` (the script reminds you).

Use `-SkipEnvUpdate` if you only want a new tunnel URL and will edit `.env` yourself.

### Option B — On the server (Linux)

Copy `deploy/refresh-quick-tunnel.sh` to the server, then:

```bash
chmod +x ~/refresh-quick-tunnel.sh
~/refresh-quick-tunnel.sh
```

It stops any old quick tunnel, starts a new one pointing at Nginx (`http://127.0.0.1:80` by default), and prints:

- `UPSTOX_REDIRECT_URI=…/api/auth/callback`
- `FRONTEND_URI=…`

Edit `/home/ubuntu/app/.env`, set those two lines, then:

```bash
pm2 restart livetrading --update-env
```

In the **Upstox** developer app, set the redirect URL to the **same** callback URL the script printed.

### Option C — Manual

```bash
pkill -f 'cloudflared tunnel --url' || true
nohup cloudflared tunnel --protocol http2 --url http://127.0.0.1:80 > ~/cloudflared.log 2>&1 &
tail -f ~/cloudflared.log
```

Copy the new `https://….trycloudflare.com` line, then update **Upstox**, **`.env`** (`UPSTOX_REDIRECT_URI`, `FRONTEND_URI`), and run **`pm2 restart livetrading --update-env`** — same steps as in the **Quick tunnel** section at the top of this file.

### Stop this from happening every week

Quick tunnels are **not** stable. For a URL that does not change when `cloudflared` restarts, use a **named tunnel + DNS** (section below) or serve HTTPS on a real domain.

---

## Named tunnel (stable hostname — free Cloudflare account)

1. Install `cloudflared` (same as above).
2. Login and create a tunnel (interactive):

   ```bash
   cloudflared tunnel login
   cloudflared tunnel create livetrading
   cloudflared tunnel route dns livetrading app.yourdomain.com
   ```

   You need **any** zone on Cloudflare (can use a cheap domain or free dev subdomain if you add one later). Alternatively Cloudflare Zero Trust dashboard → **Networks** → **Tunnels** → create tunnel and get the install command.

3. Use the generated **config.yml** to route `hostname` → `http://127.0.0.1:80`, run:

   ```bash
   cloudflared tunnel run livetrading
   ```

4. Set Upstox + `.env` to `https://app.yourdomain.com/...` as usual.

---

## Security group

EC2 must allow **SSH**. Tunnel is **outbound** from EC2 to Cloudflare — you do **not** need to open port 80 to the public internet for the tunnel to work (Nginx can stay on localhost-only if you only use tunnel — usually keep 80 open for direct IP access or close it if tunnel-only).

---

## Summary

| Method              | Stable URL? | Needs paid domain?      |
|---------------------|------------|-------------------------|
| Quick tunnel        | No         | No                      |
| Named tunnel + DNS  | Yes        | Yes (on Cloudflare DNS) |

For production long-term, a real domain + Let’s Encrypt or Cloudflare orange-cloud is still simpler than maintaining tunnels.
