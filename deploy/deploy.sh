#!/bin/bash
set -euo pipefail

#
# Usage (run from your local machine):
#   ./deploy/deploy.sh <EC2_IP> <PATH_TO_KEY.pem>
#
# Example:
#   ./deploy/deploy.sh 13.233.42.100 ~/my-key.pem
#

EC2_IP="${1:?Usage: deploy.sh <EC2_IP> <KEY_PATH>}"
KEY_PATH="${2:?Usage: deploy.sh <EC2_IP> <KEY_PATH>}"
SSH_USER="ubuntu"
REMOTE_DIR="/home/ubuntu/app"
SSH_CMD="ssh -i $KEY_PATH -o StrictHostKeyChecking=no $SSH_USER@$EC2_IP"
SCP_CMD="scp -i $KEY_PATH -o StrictHostKeyChecking=no"

echo "=============================="
echo "  LiveTrading AWS Deployment"
echo "  Target: $EC2_IP"
echo "=============================="

# 1. Build locally
echo "[1/6] Building React frontend..."
npm run build

# 2. Sync code to EC2
echo "[2/6] Syncing code to EC2..."
rsync -avz --delete \
  -e "ssh -i $KEY_PATH -o StrictHostKeyChecking=no" \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude logs \
  ./ $SSH_USER@$EC2_IP:$REMOTE_DIR/

# 3. Install dependencies on server
echo "[3/6] Installing dependencies on server..."
$SSH_CMD "cd $REMOTE_DIR && npm install --production"

# 4. Copy Nginx config
echo "[4/6] Configuring Nginx..."
$SCP_CMD deploy/nginx.conf $SSH_USER@$EC2_IP:/tmp/livetrading.nginx
$SSH_CMD "sudo mv /tmp/livetrading.nginx /etc/nginx/sites-available/livetrading && \
          sudo ln -sf /etc/nginx/sites-available/livetrading /etc/nginx/sites-enabled/ && \
          sudo rm -f /etc/nginx/sites-enabled/default && \
          sudo nginx -t && sudo systemctl reload nginx"

# 5. Copy PM2 config and restart
echo "[5/6] Restarting application..."
$SSH_CMD "cd $REMOTE_DIR && mkdir -p logs && \
          pm2 delete livetrading 2>/dev/null || true && \
          pm2 start deploy/ecosystem.config.cjs && \
          pm2 save"

# 6. Verify
echo "[6/6] Verifying deployment..."
sleep 3
STATUS=$($SSH_CMD "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/tools/discover-nifty-future" || echo "000")
if [ "$STATUS" = "200" ]; then
  echo ""
  echo "======================================="
  echo "  DEPLOYMENT SUCCESSFUL"
  echo "  App URL: http://$EC2_IP"
  echo "  API:     http://$EC2_IP/api/tools/discover-nifty-future"
  echo ""
  echo "  Upstox Redirect URI (update in console):"
  echo "  http://$EC2_IP/api/auth/callback"
  echo "======================================="
else
  echo ""
  echo "WARNING: API returned HTTP $STATUS"
  echo "SSH in to debug: ssh -i $KEY_PATH $SSH_USER@$EC2_IP"
  echo "Check logs: pm2 logs livetrading"
fi
