#Requires -Version 5.1
<#
  Refresh Cloudflare quick tunnel on EC2 and optionally update /home/ubuntu/app/.env + PM2.

  Requires: OpenSSH client, PEM key, Ubuntu user with the app under /home/ubuntu/app.

  Example:
    .\doc\Refresh-QuickTunnel.ps1 -PublicIp "1.2.3.4" -KeyPath "D:\keys\my.pem"

  Then set Upstox redirect URL to the printed .../api/auth/callback (script reminds you).
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $PublicIp,
    [Parameter(Mandatory = $true)]
    [string] $KeyPath,
    [string] $User = "ubuntu",
    [string] $AppDir = "/home/ubuntu/app",
    [switch] $SkipEnvUpdate,
    [switch] $Redeploy
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "Key not found: $KeyPath"
}

$remoteBash = @'
set -euo pipefail
ORIGIN="${ORIGIN:-http://127.0.0.1:80}"
LOG="$HOME/cloudflared-new.log"
pkill -f 'cloudflared tunnel --url' 2>/dev/null || true
sleep 1
if ! command -v cloudflared >/dev/null 2>&1; then
  cd ~
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
  sudo dpkg -i /tmp/cloudflared.deb
fi
: >"$LOG"
nohup cloudflared tunnel --protocol http2 --url "$ORIGIN" >>"$LOG" 2>&1 &
for i in $(seq 1 50); do
  URL=$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -n1 || true)
  if [ -n "${URL:-}" ]; then
    echo "NEW_URL=$URL"
    exit 0
  fi
  sleep 1
done
echo "TIMEOUT" >&2
tail -40 "$LOG" >&2
exit 1
'@
$remoteBash = $remoteBash -replace "`r",""

Write-Host "SSH $User@$PublicIp - restarting cloudflared quick tunnel..." -ForegroundColor Cyan
$raw = $remoteBash | & ssh -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${User}@${PublicIp}" "bash -s" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Remote tunnel start failed: $raw"
}

$line = $raw | Where-Object { $_ -match '^NEW_URL=' } | Select-Object -First 1
if (-not $line) { throw "Could not parse NEW_URL from output: $raw" }
$newUrl = ($line -replace '^NEW_URL=','').Trim()
if ($newUrl -notmatch '^https://[-a-z0-9]+\.trycloudflare\.com$') {
    throw "Bad URL: $newUrl"
}

Write-Host ""
Write-Host "New tunnel base URL:" -ForegroundColor Green
Write-Host "  $newUrl"
Write-Host ""
Write-Host "Upstox redirect URL (must match exactly):" -ForegroundColor Yellow
Write-Host "  $newUrl/api/auth/callback"
Write-Host ""

if ($SkipEnvUpdate) {
    Write-Host "Skipped .env (you passed -SkipEnvUpdate). Set UPSTOX_REDIRECT_URI and FRONTEND_URI manually, then pm2 restart livetrading --update-env" -ForegroundColor Yellow
    exit 0
}

$envRemote = @(
    'set -e'
    ("cd '{0}'" -f $AppDir)
    ("if [ ! -f .env ]; then echo 'Missing .env in {0}'; exit 1; fi" -f $AppDir)
    "if grep -q '^UPSTOX_REDIRECT_URI=' .env; then"
    ("  sed -i 's|^UPSTOX_REDIRECT_URI=.*|UPSTOX_REDIRECT_URI={0}/api/auth/callback|' .env" -f $newUrl)
    'else'
    ("  echo 'UPSTOX_REDIRECT_URI={0}/api/auth/callback' >> .env" -f $newUrl)
    'fi'
    "if grep -q '^FRONTEND_URI=' .env; then"
    ("  sed -i 's|^FRONTEND_URI=.*|FRONTEND_URI={0}|' .env" -f $newUrl)
    'else'
    ("  echo 'FRONTEND_URI={0}' >> .env" -f $newUrl)
    'fi'
    'sudo -u ubuntu pm2 restart livetrading --update-env'
    "grep -nE '^(UPSTOX_REDIRECT_URI|FRONTEND_URI)=' .env"
) -join "`n"
$envRemote = $envRemote -replace "`r",""

Write-Host "Updating $AppDir/.env and restarting PM2..." -ForegroundColor Cyan
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envRemote))
$runEnv = "echo $b64 | base64 -d | bash"
& ssh -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${User}@${PublicIp}" $runEnv
if ($LASTEXITCODE -ne 0) {
    throw "Remote .env update failed."
}

if ($Redeploy) {
    Write-Host "Running remote redeploy (npm install/build + PM2 restart)..." -ForegroundColor Cyan
    $redeployRemote = @(
        'set -e'
        ("cd '{0}'" -f $AppDir)
        'if [ -f package-lock.json ]; then'
        '  npm ci'
        'else'
        '  npm install'
        'fi'
        'npm run build'
        'sudo -u ubuntu pm2 restart livetrading --update-env'
        'sudo -u ubuntu pm2 save'
    ) -join "`n"
    $redeployRemote = $redeployRemote -replace "`r",""
    $b64Deploy = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($redeployRemote))
    $runDeploy = "echo $b64Deploy | base64 -d | bash"
    & ssh -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${User}@${PublicIp}" $runDeploy
    if ($LASTEXITCODE -ne 0) {
        throw "Remote redeploy failed."
    }
}

Write-Host ""
Write-Host "Done. Open the app at: $newUrl" -ForegroundColor Green
Write-Host "If login still fails, confirm Upstox app redirect = $newUrl/api/auth/callback" -ForegroundColor Yellow
