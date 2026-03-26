#Requires -Version 5.1
<#
  Verifies Route 53 + ALB alignment for the HTTPS stack.

  Usage:
    .\deploy\verify-route53.ps1 -DomainName "app.fourwalls-trading.biz" -HostedZoneId "Z09530791VWENDU111DCC" -AlbStackName "livetrading-alb-https" -Region "ap-south-1"
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $DomainName,
    [Parameter(Mandatory = $true)]
    [string] $HostedZoneId,
    [string] $AlbStackName = "livetrading-alb-https",
    [string] $Region = "ap-south-1"
)

$ErrorActionPreference = "Continue"
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "Install AWS CLI." -ForegroundColor Red
    exit 1
}
$env:AWS_DEFAULT_REGION = $Region

Write-Host "`n=== Hosted zone ===" -ForegroundColor Cyan
$hz = aws route53 get-hosted-zone --id $HostedZoneId --output json 2>&1 | ConvertFrom-Json
if (-not $hz.HostedZone) {
    Write-Host "Hosted zone $HostedZoneId not found or no access." -ForegroundColor Red
    exit 1
}
$zoneName = $hz.HostedZone.Name.TrimEnd(".")
Write-Host "Zone: $zoneName"
Write-Host "NS (must match registrar for this domain):"
$hz.DelegationSet.NameServers | ForEach-Object { Write-Host "  $_" }

Write-Host "`n=== ALB from stack $AlbStackName ===" -ForegroundColor Cyan
$albDns = aws cloudformation describe-stacks --stack-name $AlbStackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDnsName'].OutputValue" --output text
if (-not $albDns) {
    Write-Host "Could not read LoadBalancerDnsName output." -ForegroundColor Red
    exit 1
}
Write-Host "ALB DNS: $albDns"

Write-Host "`n=== Route 53 record for $DomainName ===" -ForegroundColor Cyan
$all = aws route53 list-resource-record-sets --hosted-zone-id $HostedZoneId --output json 2>&1 | ConvertFrom-Json
$want = $DomainName.TrimEnd(".")
$match = @($all.ResourceRecordSets | Where-Object { $_.Name.TrimEnd(".") -eq $want })
if ($match.Count -gt 0) {
    $match | ConvertTo-Json -Depth 8
} else {
    Write-Host "No matching record for '$want' in this zone. Stack may not have created DnsRecord or wrong zone." -ForegroundColor Yellow
}

Write-Host "`n=== Public DNS resolution (your PC) ===" -ForegroundColor Cyan
try {
    $r = Resolve-DnsName -Name $DomainName -Type A -ErrorAction Stop
    $r | Where-Object { $_.Type -eq "A" -or $_.IPAddress } | Format-Table -AutoSize
} catch {
    Write-Host "Resolve-DnsName failed: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host "Compare: ALB should be the target (alias) in Route 53; dig/nslookup should follow to ELB hostname."

Write-Host "`n=== Checks ===" -ForegroundColor Cyan
if ($DomainName -notlike "*.$zoneName" -and $DomainName -ne $zoneName) {
    Write-Host "[WARN] DomainName '$DomainName' may not live in hosted zone '$zoneName' — use the zone that owns this hostname." -ForegroundColor Yellow
}
