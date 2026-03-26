#Requires -Version 5.1
<#
  Fixes ALB target state "Unused": the load balancer must have a subnet in the SAME
  Availability Zone as the EC2 instance. If the ALB was created with only two AZs that
  exclude the instance AZ, this script adds a public subnet from the instance AZ.

  Usage:
    .\deploy\fix-alb-target-unused.ps1 -MainStackName "livetrading-chennai" -AlbStackName "livetrading-alb-https"
#>
param(
    [string] $Region = "",
    [string] $MainStackName = "LiveTrading",
    [string] $AlbStackName = "LiveTrading-AlbHttps"
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "AWS CLI not found." -ForegroundColor Red
    exit 1
}
if (-not $Region) {
    $Region = $env:AWS_DEFAULT_REGION
    if (-not $Region) { $Region = "ap-south-1" }
}
$env:AWS_DEFAULT_REGION = $Region

$mainOut = aws cloudformation describe-stacks --stack-name $MainStackName --region $Region --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
$ec2Id = ($mainOut | Where-Object { $_.OutputKey -eq "EC2InstanceId" }).OutputValue
if (-not $ec2Id) {
    Write-Host "Stack $MainStackName has no EC2InstanceId output." -ForegroundColor Red
    exit 1
}

$inst = aws ec2 describe-instances --instance-ids $ec2Id --region $Region --query "Reservations[0].Instances[0].{VpcId:VpcId,Az:Placement.AvailabilityZone,SubnetId:SubnetId}" --output json | ConvertFrom-Json
$vpc = $inst.VpcId
$ec2Az = $inst.Az
$ec2SubnetId = $inst.SubnetId

$albDns = aws cloudformation describe-stacks --stack-name $AlbStackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDnsName'].OutputValue" --output text
if (-not $albDns) {
    Write-Host "Could not read LoadBalancerDnsName from stack $AlbStackName" -ForegroundColor Red
    exit 1
}

$albArn = aws elbv2 describe-load-balancers --region $Region --query "LoadBalancers[?DNSName=='$albDns'].LoadBalancerArn | [0]" --output text
if (-not $albArn -or $albArn -eq "None") {
    Write-Host "Could not resolve ALB ARN for DNS $albDns" -ForegroundColor Red
    exit 1
}

$lb = aws elbv2 describe-load-balancers --load-balancer-arns $albArn --region $Region --output json | ConvertFrom-Json
$azInfo = $lb.LoadBalancers[0].AvailabilityZones
$currentSubnetIds = @($azInfo | ForEach-Object { $_.SubnetId })
$currentAzs = @($azInfo | ForEach-Object { $_.ZoneName })

Write-Host "EC2 $ec2Id in AZ $ec2Az" -ForegroundColor DarkGray
Write-Host "ALB subnets: $($currentSubnetIds -join ', ')" -ForegroundColor DarkGray
Write-Host "ALB AZs:     $($currentAzs -join ', ')" -ForegroundColor DarkGray

if ($currentAzs -contains $ec2Az) {
    Write-Host ""
    Write-Host "ALB already includes AZ $ec2Az. 'Unused' is likely registration/SG/health — check Target Group targets and security groups." -ForegroundColor Yellow
    $tgArn = aws cloudformation describe-stacks --stack-name $AlbStackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='TargetGroupArn'].OutputValue" --output text
    if ($tgArn) {
        Write-Host "Re-registering instance with target group..." -ForegroundColor Cyan
        aws elbv2 register-targets --target-group-arn $tgArn --targets "Id=$ec2Id,Port=80" --region $Region
    }
    exit 0
}

$subnetsRaw = aws ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc" --region $Region --output json | ConvertFrom-Json
$public = @($subnetsRaw.Subnets | Where-Object { $_.MapPublicIpOnLaunch -eq $true })
if ($public.Count -lt 1) { $public = @($subnetsRaw.Subnets) }

$subnetInEc2Az = $public | Where-Object { $_.AvailabilityZone -eq $ec2Az } | Select-Object -First 1
if (-not $subnetInEc2Az) {
    Write-Host ""
    Write-Host "No public subnet (MapPublicIpOnLaunch) in AZ $ec2Az. Create one or move the instance." -ForegroundColor Red
    exit 1
}

$newId = $subnetInEc2Az.SubnetId
if ($currentSubnetIds -contains $newId) {
    Write-Host "Subnet $newId already on ALB but AZ mismatch — describe ALB state in console." -ForegroundColor Yellow
    exit 1
}

$allSubnets = @($currentSubnetIds) + @($newId)
Write-Host ""
Write-Host "Adding subnet $newId ($ec2Az) to ALB so traffic can reach the instance..." -ForegroundColor Cyan
$awsArgs = @("elbv2", "set-subnets", "--load-balancer-arn", $albArn, "--subnets") + $allSubnets + @("--region", $Region)
& aws @awsArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$tgArn = aws cloudformation describe-stacks --stack-name $AlbStackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='TargetGroupArn'].OutputValue" --output text
Write-Host "Registering EC2 with target group..." -ForegroundColor Cyan
aws elbv2 register-targets --target-group-arn $tgArn --targets "Id=$ec2Id,Port=80" --region $Region

Write-Host ""
Write-Host "Done. Wait 1-2 minutes, then refresh Target health in the console (Unused should clear when healthy)." -ForegroundColor Green
