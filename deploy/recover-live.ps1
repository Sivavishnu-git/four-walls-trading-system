#Requires -Version 5.1
<#
  Automated recovery helper for LiveTrading cloud incidents.

  What this script can do:
    1) Run CloudFormation + EC2 diagnostics
    2) Reboot instance when status checks are impaired (optional)
    3) SSH and verify/fix nginx + PM2 backend
    4) Optionally refresh Cloudflare quick tunnel and update app .env

  Example:
    .\deploy\recover-live.ps1 `
      -StackName "livetrading-chennai" `
      -Region "ap-south-1" `
      -KeyPath "D:\Ragu_ackpat\livetrading-mumbai.pem" `
      -AutoRebootIfImpaired `
      -RefreshQuickTunnel `
      -UpdateAppEnvFromTunnel
#>
param(
    [string] $StackName = "",
    [string] $Region = "",
    [string] $KeyPath = "",
    [string] $PublicIp = "",
    [string] $InstanceId = "",
    [switch] $AutoRebootIfImpaired,
    [switch] $RefreshQuickTunnel,
    [switch] $UpdateAppEnvFromTunnel
)

$ErrorActionPreference = "Stop"

if (-not $StackName) { $StackName = $env:LIVETRADING_STACK_NAME }
if (-not $StackName) { $StackName = "LiveTrading" }
if (-not $Region) {
    $Region = $env:AWS_DEFAULT_REGION
    if (-not $Region) { $Region = "ap-south-1" }
}

$env:AWS_DEFAULT_REGION = $Region
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

function Require-Tool([string]$name, [string]$hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name not found. $hint"
    }
}

function Exec-Aws([string[]]$args) {
    $out = & aws @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "aws $($args -join ' ') failed: $out"
    }
    return $out
}

function Write-Section([string]$name) {
    Write-Host ""
    Write-Host "=== $name ===" -ForegroundColor Cyan
}

function Invoke-Ssh([string]$ip, [string]$command) {
    if (-not $KeyPath) { throw "KeyPath is required for SSH actions." }
    $out = & ssh -i $KeyPath -o BatchMode=yes -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no "ubuntu@$ip" $command 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "SSH command failed: $out"
    }
    return $out
}

Require-Tool "aws" "Install: winget install Amazon.AWSCLI"
Require-Tool "ssh" "Install OpenSSH client on Windows."

Write-Section "AWS Identity"
Exec-Aws @("sts","get-caller-identity","--output","table") | Write-Host

Write-Section "Stack Status"
$stackStatus = Exec-Aws @("cloudformation","describe-stacks","--stack-name",$StackName,"--region",$Region,"--query","Stacks[0].StackStatus","--output","text")
Write-Host "Stack: $StackName"
Write-Host "Status: $stackStatus"

Write-Section "Stack Outputs"
$outputsJson = Exec-Aws @("cloudformation","describe-stacks","--stack-name",$StackName,"--region",$Region,"--query","Stacks[0].Outputs","--output","json")
$outputs = $outputsJson | ConvertFrom-Json
$outputs | Format-Table -AutoSize | Out-String | Write-Host

if (-not $PublicIp) {
    $PublicIp = ($outputs | Where-Object { $_.OutputKey -eq "PublicIP" }).OutputValue
}
if (-not $PublicIp -or $PublicIp -notmatch '^\d+\.\d+\.\d+\.\d+$') {
    throw "PublicIp not found. Pass -PublicIp explicitly."
}
Write-Host "Using PublicIp: $PublicIp" -ForegroundColor Yellow

Write-Section "EIP + Instance mapping"
$eipInfo = Exec-Aws @("ec2","describe-addresses","--public-ips",$PublicIp,"--query","Addresses[0].{InstanceId:InstanceId,AssociationId:AssociationId,AllocationId:AllocationId,NetworkInterfaceId:NetworkInterfaceId}","--output","json") | ConvertFrom-Json
if (-not $InstanceId) { $InstanceId = $eipInfo.InstanceId }
if (-not $InstanceId) { throw "InstanceId not found for EIP $PublicIp." }
$eipInfo | ConvertTo-Json -Depth 4 | Write-Host

Write-Section "EC2 Status checks"
$status = Exec-Aws @("ec2","describe-instance-status","--instance-ids",$InstanceId,"--include-all-instances","--query","InstanceStatuses[0].{State:InstanceState.Name,System:SystemStatus.Status,Instance:InstanceStatus.Status,Details:InstanceStatus.Details}","--output","json") | ConvertFrom-Json
$status | ConvertTo-Json -Depth 6 | Write-Host

$isImpaired = ($status.Instance -ne "ok")
if ($isImpaired) {
    Write-Host "Instance status is impaired." -ForegroundColor Red
    if ($AutoRebootIfImpaired) {
        Write-Section "Rebooting instance"
        Exec-Aws @("ec2","reboot-instances","--instance-ids",$InstanceId) | Out-Null
        Write-Host "Reboot requested. Waiting 75 seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds 75
        $status2 = Exec-Aws @("ec2","describe-instance-status","--instance-ids",$InstanceId,"--include-all-instances","--query","InstanceStatuses[0].{State:InstanceState.Name,System:SystemStatus.Status,Instance:InstanceStatus.Status,Details:InstanceStatus.Details}","--output","json") | ConvertFrom-Json
        $status2 | ConvertTo-Json -Depth 6 | Write-Host
    } else {
        Write-Host "Tip: rerun with -AutoRebootIfImpaired to reboot automatically." -ForegroundColor Yellow
    }
}

Write-Section "Port reachability from local machine"
Test-NetConnection -ComputerName $PublicIp -Port 22 | Select-Object ComputerName,RemotePort,TcpTestSucceeded | Format-Table -AutoSize | Out-String | Write-Host
Test-NetConnection -ComputerName $PublicIp -Port 80 | Select-Object ComputerName,RemotePort,TcpTestSucceeded | Format-Table -AutoSize | Out-String | Write-Host

if (-not $KeyPath) {
    Write-Host "Skipping SSH service checks (no -KeyPath provided)." -ForegroundColor Yellow
    exit 0
}
if (-not (Test-Path $KeyPath)) {
    throw "KeyPath not found: $KeyPath"
}

Write-Section "SSH service checks (nginx + pm2 + local HTTP)"
$serviceCmd = "hostname; uptime; sudo systemctl is-active nginx; sudo -u ubuntu pm2 status; curl -s -o /dev/null -w 'ROOT:%{http_code}\n' http://127.0.0.1/; curl -s -o /dev/null -w 'API:%{http_code}\n' http://127.0.0.1:3000/api/tools/discover-nifty-future || true"
$serviceOut = Invoke-Ssh -ip $PublicIp -command $serviceCmd
$serviceOut | Write-Host

if ($serviceOut -notmatch "API:200") {
    Write-Section "Attempting backend recovery (PM2 start/restart)"
    $fixCmd = "cd /home/ubuntu/app; sudo -u ubuntu pm2 start proxy-server.js --name livetrading --env production || true; sudo -u ubuntu pm2 restart livetrading --update-env || true; sudo -u ubuntu pm2 save; sudo -u ubuntu pm2 status; curl -s -o /dev/null -w 'API_AFTER:%{http_code}\n' http://127.0.0.1:3000/api/tools/discover-nifty-future || true"
    Invoke-Ssh -ip $PublicIp -command $fixCmd | Write-Host
}

if ($RefreshQuickTunnel) {
    Write-Section "Refreshing Cloudflare quick tunnel"
    $tunnelCmd = @"
pkill -f 'cloudflared tunnel --url' >/dev/null 2>&1 || true
if ! command -v cloudflared >/dev/null 2>&1; then
  cd ~
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
  sudo dpkg -i cloudflared.deb
fi
rm -f ~/cloudflared-new.log
nohup cloudflared tunnel --protocol http2 --url http://127.0.0.1:80 > ~/cloudflared-new.log 2>&1 &
sleep 8
grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' ~/cloudflared-new.log | head -n 1
"@
    $newUrl = (Invoke-Ssh -ip $PublicIp -command $tunnelCmd).Trim()
    if (-not $newUrl -or $newUrl -notmatch '^https://[-a-z0-9]+\.trycloudflare\.com$') {
        throw "Failed to obtain fresh quick tunnel URL."
    }
    Write-Host "New tunnel URL: $newUrl" -ForegroundColor Green

    if ($UpdateAppEnvFromTunnel) {
        Write-Section "Updating app .env redirect/frontend URL and restarting PM2"
        $esc = $newUrl.Replace("'","''")
        $envCmd = "cd /home/ubuntu/app; if grep -q '^UPSTOX_REDIRECT_URI=' .env; then sed -i 's|^UPSTOX_REDIRECT_URI=.*|UPSTOX_REDIRECT_URI=$esc/api/auth/callback|' .env; else echo 'UPSTOX_REDIRECT_URI=$esc/api/auth/callback' >> .env; fi; if grep -q '^FRONTEND_URI=' .env; then sed -i 's|^FRONTEND_URI=.*|FRONTEND_URI=$esc|' .env; else echo 'FRONTEND_URI=$esc' >> .env; fi; sudo -u ubuntu pm2 restart livetrading --update-env; grep -nE '^(UPSTOX_REDIRECT_URI|FRONTEND_URI)=' .env"
        Invoke-Ssh -ip $PublicIp -command $envCmd | Write-Host
        Write-Host "IMPORTANT: Update Upstox redirect URI to: $newUrl/api/auth/callback" -ForegroundColor Yellow
    } else {
        Write-Host "Tip: rerun with -UpdateAppEnvFromTunnel to auto-write .env and PM2 restart." -ForegroundColor Yellow
    }
}

Write-Section "Done"
Write-Host "Recovery flow completed."

