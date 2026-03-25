#Requires -Version 5.1
<#
Deploy LiveTrading to AWS (EC2 + EIP + Nginx + PM2) via CloudFormation.

Usage:
  .\deploy\deploy-live.ps1 -StackName "livetrading-chennai" -Region "ap-south-1"
  $env:LIVETRADING_STACK_NAME = "livetrading-chennai"; .\deploy\deploy-live.ps1

After the stack update, optionally SSH to the instance and restart the Node app (PM2) so nginx
is not left with nothing on :3000 (502). Pass your PEM path:

  .\deploy\deploy-live.ps1 -KeyPath "D:\path\to\your-key.pem"
  $env:LIVETRADING_KEY_PATH = "D:\path\to\your-key.pem"; .\deploy\deploy-live.ps1

Skip the PM2 step (CloudFormation only):  -SkipPm2Restart
#>
param(
    [string] $Region = "",
    [string] $StackName = "",
    [string] $TemplateFile = "",
    [string] $KeyPath = "",
    [switch] $SkipPm2Restart
)

if (-not $StackName) { $StackName = $env:LIVETRADING_STACK_NAME }
if (-not $StackName) { $StackName = "LiveTrading" }

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
if (-not $TemplateFile) { $TemplateFile = Join-Path $Root "deploy\cloudformation.yaml" }
$ParamsFile = Join-Path $PSScriptRoot "cfn-params.json"
$ExampleFile = Join-Path $PSScriptRoot "cfn-params.example.json"

$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

function Require-AwsCli {
    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
        Write-Host "AWS CLI not found. Install with: winget install Amazon.AWSCLI" -ForegroundColor Red
        exit 1
    }
}

function Resolve-Region {
    if ($Region) { return $Region }
    if ($env:AWS_REGION) { return $env:AWS_REGION }
    if ($env:AWS_DEFAULT_REGION) { return $env:AWS_DEFAULT_REGION }
    return "ap-south-1"
}

Require-AwsCli
$deployRegion = Resolve-Region
$env:AWS_DEFAULT_REGION = $deployRegion

$stsOut = aws sts get-caller-identity 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $stsOut
    Write-Host "Run aws configure (or set AWS env vars) and retry." -ForegroundColor Red
    exit 1
}
$ident = $stsOut | ConvertFrom-Json
Write-Host "AWS account: $($ident.Account)  ARN: $($ident.Arn)" -ForegroundColor Green

if (-not (Test-Path $ParamsFile)) {
    Write-Host "Missing $ParamsFile" -ForegroundColor Yellow
    Write-Host "Copy-Item '$ExampleFile' '$ParamsFile'" -ForegroundColor Gray
    if (Test-Path $ExampleFile) {
        Copy-Item $ExampleFile $ParamsFile
        Write-Host "Created cfn-params.json from example. Edit it and rerun." -ForegroundColor Cyan
    }
    exit 1
}

if (-not (Test-Path $TemplateFile)) {
    Write-Host "Template not found: $TemplateFile" -ForegroundColor Red
    exit 1
}

$raw = Get-Content $ParamsFile -Raw -Encoding UTF8 | ConvertFrom-Json
$pairs = @()
foreach ($prop in $raw.PSObject.Properties) {
    $name = $prop.Name
    $val = [string]$prop.Value
    if ($val -match "REPLACE_|YOUR_" -or $val -like "*YOUR_*") {
        Write-Host "Edit cfn-params.json - placeholder still in: $name" -ForegroundColor Red
        exit 1
    }
    $pairs += "$name=$val"
}

Write-Host ""
Write-Host "Deploying stack '$StackName' in $deployRegion ..." -ForegroundColor Cyan
Write-Host ""

$awsArgs = @(
    "cloudformation", "deploy",
    "--template-file", $TemplateFile,
    "--stack-name", $StackName,
    "--capabilities", "CAPABILITY_NAMED_IAM",
    "--region", $deployRegion,
    "--parameter-overrides"
) + $pairs

& aws @awsArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "========== STACK OUTPUTS ==========" -ForegroundColor Green
aws cloudformation describe-stacks --stack-name $StackName --region $deployRegion `
    --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" --output table

if (-not $KeyPath) { $KeyPath = $env:LIVETRADING_KEY_PATH }

if (-not $SkipPm2Restart -and $KeyPath) {
    if (-not (Test-Path -LiteralPath $KeyPath)) {
        Write-Host ""
        Write-Host "KeyPath not found: $KeyPath - skipping PM2 restart." -ForegroundColor Yellow
    } else {
        $publicIp = aws cloudformation describe-stacks --stack-name $StackName --region $deployRegion `
            --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" --output text 2>&1
        if ($LASTEXITCODE -ne 0 -or -not $publicIp -or $publicIp -notmatch '^\d+\.\d+\.\d+\.\d+$') {
            Write-Host ""
            Write-Host "Could not read PublicIP from stack; skipping PM2 restart." -ForegroundColor Yellow
        } else {
            Write-Host ""
            Write-Host "========== PM2 restart on $publicIp ==========" -ForegroundColor Cyan
            $remote = @'
set -e
cd /home/ubuntu/app
pm2 delete livetrading 2>/dev/null || true
if [ -f deploy/ecosystem.config.cjs ]; then
  pm2 start deploy/ecosystem.config.cjs
else
  pm2 start proxy-server.js --name livetrading --env production
fi
pm2 save
curl -s -o /dev/null -w "API localhost:3000 -> %{http_code}\n" http://127.0.0.1:3000/api/tools/discover-nifty-future || true
'@
            $remote = $remote -replace "`r",""
            $remote | & ssh -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "ubuntu@${publicIp}" "bash -s"
            if ($LASTEXITCODE -ne 0) {
                Write-Host "PM2 restart SSH command failed (exit $LASTEXITCODE). Check key, security group SSH, and instance state." -ForegroundColor Red
            } else {
                Write-Host "PM2 restart finished." -ForegroundColor Green
            }
        }
    }
} elseif (-not $SkipPm2Restart) {
    Write-Host ""
    Write-Host "Tip: pass -KeyPath (or `$env:LIVETRADING_KEY_PATH) to restart PM2 on the instance after deploy and avoid 502 when the app is down." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Next: open AppURL and update Upstox redirect URI from output." -ForegroundColor Cyan
