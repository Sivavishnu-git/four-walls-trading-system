#!/usr/bin/env bash
# Run on your Linux server (e.g. EC2) over SSH.
# Restarts the Cloudflare *quick* tunnel and prints the NEW trycloudflare.com URL.
# Quick tunnels get a new hostname every time cloudflared restarts — update Upstox + .env after each run.

set -euo pipefail

ORIGIN="${ORIGIN:-http://127.0.0.1:80}"
LOG="${CLOUDFLARED_LOG:-$HOME/cloudflared.log}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Install cloudflared first (see deploy/CLOUDFLARE_TUNNEL.md)." >&2
  exit 1
fi

echo "Stopping any existing quick tunnel..."
pkill -f 'cloudflared tunnel --url' 2>/dev/null || true
sleep 1

: >"$LOG"
echo "Starting cloudflared → $ORIGIN (log: $LOG)"
nohup cloudflared tunnel --protocol http2 --url "$ORIGIN" >>"$LOG" 2>&1 &
echo "Waiting for public URL (up to ~45s)..."
for _ in $(seq 1 45); do
  URL=$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -n1 || true)
  if [[ -n "${URL:-}" ]]; then
    echo ""
    echo "============================================================"
    echo "NEW URL (old hammer-*.trycloudflare.com is INVALID now)"
    echo "============================================================"
    echo ""
    echo "  Base:  $URL"
    echo ""
    echo "Add to /home/ubuntu/app/.env (or your app path), then:"
    echo "  pm2 restart livetrading --update-env"
    echo ""
    echo "  UPSTOX_REDIRECT_URI=${URL}/api/auth/callback"
    echo "  FRONTEND_URI=${URL}"
    echo ""
    echo "Upstox developer app → Redirect URL must match exactly:"
    echo "  ${URL}/api/auth/callback"
    echo "============================================================"
    exit 0
  fi
  sleep 1
done

echo "Timed out — check: tail -80 $LOG" >&2
exit 1
