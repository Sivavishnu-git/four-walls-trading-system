# LiveTrading Cloud Incident Runbook

This runbook documents the exact operational flow used to diagnose and recover the LiveTrading deployment when the app is unreachable, timing out, or returning 502.

## Scope

- AWS EC2 instance deployed via CloudFormation
- Nginx on port `80`
- Node backend (`proxy-server.js`) managed by PM2 on port `3000`
- Optional Cloudflare quick tunnel (`*.trycloudflare.com`) for HTTPS callback

## Fast symptom map

- `ERR_CONNECTION_TIMED_OUT` on IP + `Test-NetConnection` fails for ports 22/80:
  - Network path issue (instance health impaired, SG/NACL/route, wrong EIP, ISP block)
- Site opens but `502 Bad Gateway`:
  - Nginx up, backend not healthy on `127.0.0.1:3000`
- `DNS_PROBE_FINISHED_NXDOMAIN` on `*.trycloudflare.com`:
  - Old/expired quick tunnel URL; create a new tunnel URL and update redirect env values

## Prerequisites

1. AWS CLI installed and configured:
   - `aws --version`
   - `aws sts get-caller-identity`
2. IAM user permissions for troubleshooting and recovery:
   - `deploy/iam-policy-cloudformation-troubleshoot.json`
   - `deploy/iam-policy-ec2-recovery.json`
3. SSH key to instance (for example):
   - `D:\Ragu_ackpat\livetrading-mumbai.pem`
4. Correct region and stack name:
   - Region example: `ap-south-1`
   - Stack name example: `livetrading-chennai`

## Phase 1 - Cloud and network checks

Run:

```powershell
cd D:\Ragu_ackpat\LiveTrading
.\deploy\cloud-troubleshoot.ps1 -Region ap-south-1 -StackName "livetrading-chennai"
```

Confirm:

- Stack exists and status is not failed/rollback
- Public IP in outputs matches target IP
- Instance appears in region and is running

Manual deep checks (if needed):

- EIP attached to expected instance and ENI
- Security group attached to instance allows:
  - `22/tcp` from your source (or temporary `0.0.0.0/0`)
  - `80/tcp` from `0.0.0.0/0`
- Route table has `0.0.0.0/0 -> igw-...`
- NACL allows inbound/outbound (default NACL is fine)

## Phase 2 - Instance health and transport

From local machine:

```powershell
Test-NetConnection -ComputerName 13.205.66.8 -Port 22
Test-NetConnection -ComputerName 13.205.66.8 -Port 80
```

If both fail but SG/NACL/route are correct, check EC2 status checks:

```powershell
aws ec2 describe-instance-status --instance-ids <instance-id> --include-all-instances --region ap-south-1
```

If `InstanceStatus` is `impaired` with reachability failure:

- Reboot instance (requires IAM permission):
  - `aws ec2 reboot-instances --instance-ids <instance-id> --region ap-south-1`
- Wait and re-check status + ports 22/80.

## Phase 3 - Service checks via SSH

SSH:

```powershell
ssh -i "D:\Ragu_ackpat\livetrading-mumbai.pem" ubuntu@13.205.66.8
```

Validate services:

```bash
sudo systemctl status nginx --no-pager
sudo -u ubuntu pm2 status
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/tools/discover-nifty-future
```

Expected:

- `nginx` active
- PM2 process `livetrading` online
- local root returns `200`
- local API returns `200`

If PM2 process missing or down:

```bash
cd /home/ubuntu/app
sudo -u ubuntu pm2 start proxy-server.js --name livetrading --env production
sudo -u ubuntu pm2 save
```

If already present:

```bash
sudo -u ubuntu pm2 restart livetrading --update-env
```

Read logs:

```bash
sudo -u ubuntu pm2 logs livetrading --lines 80 --nostream
sudo tail -50 /var/log/nginx/error.log
```

## Phase 4 - Cloudflare quick tunnel recovery (HTTPS callback)

When `trycloudflare` URL shows NXDOMAIN, the quick tunnel has expired.

On server:

```bash
pkill -f 'cloudflared tunnel --url' || true
nohup cloudflared tunnel --protocol http2 --url http://127.0.0.1:80 > ~/cloudflared-new.log 2>&1 &
sleep 8
grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' ~/cloudflared-new.log | head -n 1
```

Update app env:

```bash
cd /home/ubuntu/app
# example URL:
URL="https://example.trycloudflare.com"
sed -i "s|^UPSTOX_REDIRECT_URI=.*|UPSTOX_REDIRECT_URI=${URL}/api/auth/callback|" .env
grep -q '^FRONTEND_URI=' .env && sed -i "s|^FRONTEND_URI=.*|FRONTEND_URI=${URL}|" .env || echo "FRONTEND_URI=${URL}" >> .env
sudo -u ubuntu pm2 restart livetrading --update-env
```

Also update redirect in Upstox Developer Console:

- `https://example.trycloudflare.com/api/auth/callback`

## Known outcomes from prior incident

1. EC2 instance was running but had `InstanceStatus: impaired (reachability failed)`.
2. Reboot restored network reachability (`22` and `80` succeeded).
3. After reboot, PM2 backend was not running; starting `livetrading` fixed backend path.
4. Old Cloudflare tunnel URL had expired (`NXDOMAIN`); new quick tunnel URL fixed HTTPS callback.

## Recommended hardening

- Move from quick tunnel to named tunnel + stable hostname.
- Add systemd unit for `cloudflared` if keeping tunnel-based callback.
- Add CloudWatch alarms on instance status checks, not only CPU.
- Keep IAM recovery policy attached to on-call operator role.

