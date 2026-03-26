#Requires -Version 5.1
<#
  Deploy Application Load Balancer + ACM certificate + Route 53 alias (HTTPS) in front of
  an existing LiveTrading EC2 stack.

  Prerequisites:
    - Main stack deployed from deploy\cloudformation.yaml (updated so outputs include
      EC2InstanceId and AppSecurityGroupId). If missing, redeploy the main stack once.
    - Route 53 hosted zone for your domain in this AWS account.
    - DNS name (e.g. app.example.com) as an A record will point to the ALB (created here).

  Usage:
    .\deploy\deploy-alb-https.ps1 -DomainName "app.example.com" -HostedZoneId "Z0123456789ABCDEFGHIJ"
    .\deploy\deploy-alb-https.ps1 -MainStackName "LiveTrading" -AlbStackName "LiveTrading-AlbHttps" `
      -DomainName "app.example.com" -HostedZoneId "Z..." -Region "ap-south-1"

  After success:
    - Update /home/ubuntu/app/.env on EC2: FRONTEND_URI and UPSTOX_REDIRECT_URI to https://app.example.com
    - Set Upstox developer redirect to https://app.example.com/api/auth/callback
    - pm2 restart livetrading --update-env
#>
param(
    [string] $Region = "",
    [string] $MainStackName = "LiveTrading",
    [string] $AlbStackName = "LiveTrading-AlbHttps",
    [Parameter(Mandatory = $true)]
    [string] $DomainName,
    [Parameter(Mandatory = $true)]
    [string] $HostedZoneId
)

$ErrorActionPreference = "Stop"
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "AWS CLI not found. Install: winget install Amazon.AWSCLI" -ForegroundColor Red
    exit 1
}

if (-not $Region) {
    $Region = $env:AWS_DEFAULT_REGION
    if (-not $Region) { $Region = "ap-south-1" }
}
$env:AWS_DEFAULT_REGION = $Region

$ScriptDir = $PSScriptRoot
$Template = Join-Path $ScriptDir "cloudformation-alb-https.yaml"
if (-not (Test-Path -LiteralPath $Template)) {
    Write-Host "Template not found: $Template" -ForegroundColor Red
    exit 1
}

Write-Host "Reading outputs from stack '$MainStackName' ($Region)..." -ForegroundColor Cyan
$outJson = aws cloudformation describe-stacks --stack-name $MainStackName --region $Region --query "Stacks[0].Outputs" --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $outJson
    exit 1
}
$main = $outJson | ConvertFrom-Json
$ec2Id = ($main | Where-Object { $_.OutputKey -eq "EC2InstanceId" }).OutputValue
$appSg = ($main | Where-Object { $_.OutputKey -eq "AppSecurityGroupId" }).OutputValue

if (-not $ec2Id -or -not $appSg) {
    Write-Host ""
    Write-Host "Main stack must export EC2InstanceId and AppSecurityGroupId." -ForegroundColor Red
    Write-Host "Redeploy the main stack: .\deploy\deploy-live.ps1  (same stack name), then rerun this script." -ForegroundColor Yellow
    exit 1
}

$vpc = aws ec2 describe-instances --instance-ids $ec2Id --region $Region --query "Reservations[0].Instances[0].VpcId" --output text
if (-not $vpc -or $vpc -eq "None") {
    Write-Host "Could not resolve VPC for instance $ec2Id" -ForegroundColor Red
    exit 1
}

$instAz = aws ec2 describe-instances --instance-ids $ec2Id --region $Region --query "Reservations[0].Instances[0].Placement.AvailabilityZone" --output text
if (-not $instAz -or $instAz -eq "None") {
    Write-Host "Could not read instance AZ for $ec2Id" -ForegroundColor Red
    exit 1
}

$subnetsRaw = aws ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc" --region $Region --output json | ConvertFrom-Json
$public = @($subnetsRaw.Subnets | Where-Object { $_.MapPublicIpOnLaunch -eq $true })
if ($public.Count -lt 2) {
    $public = @($subnetsRaw.Subnets)
}

# ALB must cover the EC2 AZ or targets stay "Unused" (ALB only routes to AZs where it has subnets).
$subnetInEc2Az = $public | Where-Object { $_.AvailabilityZone -eq $instAz } | Select-Object -First 1
if (-not $subnetInEc2Az) {
    Write-Host ""
    Write-Host "No public subnet (MapPublicIpOnLaunch) in the same AZ as EC2 ($instAz)." -ForegroundColor Red
    Write-Host "Create a public subnet in $instAz or move the instance to an AZ that has one." -ForegroundColor Yellow
    exit 1
}
$otherAz = @($public | Where-Object { $_.AvailabilityZone -ne $instAz })
if ($otherAz.Count -lt 1) {
    Write-Host "Need a second public subnet in a different AZ than $instAz for ALB. Found none." -ForegroundColor Red
    exit 1
}

$subnet1 = $subnetInEc2Az.SubnetId
$subnet2 = ($otherAz | Select-Object -First 1).SubnetId

Write-Host ""
Write-Host "EC2 instance:     $ec2Id (AZ $instAz)" -ForegroundColor DarkGray
Write-Host "VPC:              $vpc" -ForegroundColor DarkGray
Write-Host "Subnets (ALB):    $subnet1 , $subnet2  (one subnet is always in the instance AZ — avoids Unused)" -ForegroundColor DarkGray
Write-Host "Domain:           $DomainName" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Deploying ALB stack '$AlbStackName' (ACM DNS validation can take several minutes)..." -ForegroundColor Cyan

& aws cloudformation deploy `
    --template-file $Template `
    --stack-name $AlbStackName `
    --region $Region `
    --parameter-overrides `
        DomainName=$DomainName `
        HostedZoneId=$HostedZoneId `
        VpcId=$vpc `
        PublicSubnet1=$subnet1 `
        PublicSubnet2=$subnet2 `
        EC2InstanceId=$ec2Id `
        AppSecurityGroupId=$appSg

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$tgArn = aws cloudformation describe-stacks --stack-name $AlbStackName --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='TargetGroupArn'].OutputValue" --output text

Write-Host "Registering EC2 instance with target group..." -ForegroundColor Cyan
aws elbv2 register-targets --target-group-arn $tgArn --targets "Id=$ec2Id,Port=80" --region $Region
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "========== ALB STACK OUTPUTS ==========" -ForegroundColor Green
aws cloudformation describe-stacks --stack-name $AlbStackName --region $Region `
    --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" --output table

Write-Host ""
Write-Host "HTTPS URL: https://$DomainName" -ForegroundColor Green
Write-Host ""
Write-Host "On the EC2 host, set in /home/ubuntu/app/.env:" -ForegroundColor Yellow
Write-Host "  FRONTEND_URI=https://$DomainName" -ForegroundColor Gray
Write-Host "  UPSTOX_REDIRECT_URI=https://$DomainName/api/auth/callback" -ForegroundColor Gray
Write-Host "Then: sudo -u ubuntu pm2 restart livetrading --update-env" -ForegroundColor Gray
Write-Host "And set the same redirect URL in the Upstox developer console." -ForegroundColor Gray
