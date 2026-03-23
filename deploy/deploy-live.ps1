#Requires -Version 5.1
<#
  Deploy LiveTrading to AWS (EC2 + Elastic IP + Nginx + PM2) via CloudFormation.

  Prerequisites:
    1) AWS account, IAM user with CloudFormation + EC2 + VPC + IAM permissions
    2) aws configure   (or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION)
    3) EC2 key pair created in the TARGET region (EC2 > Key Pairs)
    4) Copy deploy/cfn-params.example.json -> deploy/cfn-params.json and fill secrets

  Usage (from repo root):
    .\deploy\deploy-live.ps1 -StackName "your-stack-name"
    $env:LIVETRADING_STACK_NAME = "your-stack-name"; .\deploy\deploy-live.ps1

  Stack name must match an existing stack (update) or the new stack name (create). See cloud-troubleshoot.ps1 header.

  After success: open AppURL from stack Outputs; set Upstox redirect URI to http://<EIP>/api/auth/callback
#>
param(
    [string] $Region = "",
    [string] $StackName = "",
    [string] $TemplateFile = ""
)

if (-not $StackName) { $StackName = $env:LIVETRADING_STACK_NAME }
if (-not $StackName) { $StackName = "LiveTrading" }

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
if (-not $TemplateFile) { $TemplateFile = Join-Path $Root "deploy\cloudformation.yaml" }
$ParamsFile = Join-Path $PSScriptRoot "cfn-params.json"
$ExampleFile = Join-Path $PSScriptRoot "cfn-params.example.json"

# Refresh PATH (AWS CLI installer)
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

function Test-AwsCli {
    $aws = Get-Command aws -ErrorAction SilentlyContinue
    if (-not $aws) {
        Write-Host "AWS CLI not found. Install: winget install Amazon.AWSCLI" -ForegroundColor Red
        exit 1
    }
}

function Get-DeployRegion {
    if ($Region) { return $Region }
    $r = $env:AWS_REGION
    if (-not $r) { $r = $env:AWS_DEFAULT_REGION }
    if (-not $r) {
        $r = Read-Host "AWS region (e.g. ap-south-1 for Mumbai)"
        if (-not $r) { $r = "ap-south-1" }
    }
    return $r
}

Test-AwsCli

$stsOut = aws sts get-caller-identity 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $stsOut
    Write-Host "Run: aws configure   (or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)" -ForegroundColor Red
    exit 1
}
$ident = $stsOut | ConvertFrom-Json
Write-Host "AWS account: $($ident.Account)  ARN: $($ident.Arn)" -ForegroundColor Green

if (-not (Test-Path $ParamsFile)) {
    Write-Host "Missing $ParamsFile" -ForegroundColor Yellow
    Write-Host "Copy:  Copy-Item '$ExampleFile' '$ParamsFile'"
    if (Test-Path $ExampleFile) {
        Copy-Item $ExampleFile $ParamsFile
        Write-Host "Created cfn-params.json from example. Edit it, then re-run this script." -ForegroundColor Cyan
        notepad $ParamsFile
    }
    exit 1
}

if (-not (Test-Path $TemplateFile)) {
    Write-Host "Template not found: $TemplateFile" -ForegroundColor Red
    exit 1
}

$deployRegion = Get-DeployRegion
$env:AWS_DEFAULT_REGION = $deployRegion

$raw = Get-Content $ParamsFile -Raw -Encoding UTF8 | ConvertFrom-Json
$pairs = @()
foreach ($prop in $raw.PSObject.Properties) {
    $name = $prop.Name
    $val = [string]$prop.Value
    if ($val -match 'REPLACE_|YOUR_' -or $val -like '*YOUR_*') {
        Write-Host "Edit cfn-params.json — placeholder still in: $name" -ForegroundColor Red
        exit 1
    }
    $pairs += "${name}=$val"
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

Write-Host ""
Write-Host "Next: 1) Open AppURL in browser  2) Upstox Developer Console -> redirect URI = UpstoxRedirectURI output" -ForegroundColor Cyan
Write-Host "Code updates later: use Git Bash WSL or fix paths and run deploy/deploy.sh <EIP> <key.pem>" -ForegroundColor Gray
