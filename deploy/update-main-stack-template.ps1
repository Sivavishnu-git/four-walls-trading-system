#Requires -Version 5.1
<#
  Apply the latest deploy/cloudformation.yaml to an EXISTING stack without changing
  parameter values (uses UsePreviousValue for all). Use this when deploy-live.ps1
  cannot run because cfn-params.json has placeholders but secrets are already in AWS.

  Requires IAM: cloudformation:UpdateStack (and PassRole if the template uses IAM).

  Usage:
    .\deploy\update-main-stack-template.ps1 -StackName "livetrading-chennai" -Region "ap-south-1"
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $StackName,
    [string] $Region = ""
)

$ErrorActionPreference = "Stop"
if (-not $Region) {
    $Region = $env:AWS_DEFAULT_REGION
    if (-not $Region) { $Region = "ap-south-1" }
}

$Root = Split-Path $PSScriptRoot -Parent
$TemplateFile = Join-Path $Root "deploy\cloudformation.yaml"
if (-not (Test-Path -LiteralPath $TemplateFile)) {
    throw "Template not found: $TemplateFile"
}

$body = "file://$($TemplateFile -replace '\\','/')"

Write-Host "Updating stack '$StackName' in $Region (all parameters preserved from stack)..." -ForegroundColor Cyan

aws cloudformation update-stack `
    --stack-name $StackName `
    --region $Region `
    --template-body $body `
    --capabilities CAPABILITY_NAMED_IAM `
    --parameters `
        ParameterKey=InstanceType,UsePreviousValue=true `
        ParameterKey=KeyPairName,UsePreviousValue=true `
        ParameterKey=GitRepoURL,UsePreviousValue=true `
        ParameterKey=GitBranch,UsePreviousValue=true `
        ParameterKey=UpstoxAPIKey,UsePreviousValue=true `
        ParameterKey=UpstoxAPISecret,UsePreviousValue=true `
        ParameterKey=AllowedSSHCidr,UsePreviousValue=true

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Waiting for stack update..." -ForegroundColor Cyan
aws cloudformation wait stack-update-complete --stack-name $StackName --region $Region

Write-Host "Done. New outputs:" -ForegroundColor Green
aws cloudformation describe-stacks --stack-name $StackName --region $Region `
    --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" --output table
