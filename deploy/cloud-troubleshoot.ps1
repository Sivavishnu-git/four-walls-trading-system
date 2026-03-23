#Requires -Version 5.1
<#
  Run from repo root. Checks CloudFormation stack + EC2 for LiveTrading.

  Stack name (must match CloudFormation console exactly):
    - Pass:  -StackName "your-stack-name"
    - Or set once:  $env:LIVETRADING_STACK_NAME = "your-stack-name"
    - Else default:  LiveTrading

  Usage: .\deploy\cloud-troubleshoot.ps1 [-StackName my-stack] [-Region ap-south-1]
#>
param(
    [string] $StackName = "",
    [string] $Region = ""
)

if (-not $StackName) { $StackName = $env:LIVETRADING_STACK_NAME }
if (-not $StackName) { $StackName = "LiveTrading" }

$ErrorActionPreference = "Continue"
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

if (-not $Region) {
    $Region = $env:AWS_DEFAULT_REGION
    if (-not $Region) { $Region = "ap-south-1" }
}
$env:AWS_DEFAULT_REGION = $Region

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "Install AWS CLI: winget install Amazon.AWSCLI" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== AWS identity ===" -ForegroundColor Cyan
aws sts get-caller-identity 2>&1

Write-Host "`nUsing stack name: $StackName ($Region)" -ForegroundColor DarkGray

Write-Host "`n=== Stack status: $StackName ($Region) ===" -ForegroundColor Cyan
$st = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].StackStatus" --output text 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $st
    Write-Host "`nStack missing or wrong name/region. Deploy with: .\deploy\deploy-live.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Host "Status: $st"

Write-Host "`n=== Recent stack events ===" -ForegroundColor Cyan
aws cloudformation describe-stack-events --stack-name $StackName --region $Region `
    --query "StackEvents[0:12].[Timestamp,ResourceStatus,LogicalResourceId,ResourceStatusReason]" --output table 2>&1

Write-Host "`n=== Stack outputs (App URL) ===" -ForegroundColor Cyan
$outs = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs" --output json 2>&1 | ConvertFrom-Json
$outs | Format-Table -AutoSize
$ip = ($outs | Where-Object { $_.OutputKey -eq "PublicIP" }).OutputValue

if ($ip -and $ip -match '^\d+\.') {
    Write-Host "`n=== Quick HTTP check: http://$ip/ ===" -ForegroundColor Cyan
    try {
        $r = Invoke-WebRequest -Uri "http://$ip/" -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
        Write-Host "HTTP $($r.StatusCode) - page reachable." -ForegroundColor Green
    } catch {
        Write-Host "HTTP failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Common causes: instance stopped, security group blocks :80, nginx/pm2 not running, user-data still running." -ForegroundColor Yellow
    }
}

Write-Host "`n=== EC2 (all in region - check your instance) ===" -ForegroundColor Cyan
aws ec2 describe-instances --region $Region `
    --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,PublicIp:PublicIpAddress}' `
    --output table 2>&1

Write-Host "`n--- On the server (SSH as ubuntu), run: ---" -ForegroundColor Gray
Write-Host 'sudo tail -100 /var/log/user-data.log'
Write-Host 'sudo systemctl status nginx --no-pager'
Write-Host 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/'
Write-Host 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/tools/discover-nifty-future'
Write-Host 'sudo -u ubuntu pm2 status'
Write-Host 'sudo -u ubuntu pm2 logs livetrading --lines 30'
