#Requires -Version 5.1
<#
  New Cloudflare quick tunnel on EC2, update app .env (FRONTEND_URI, UPSTOX_REDIRECT_URI), PM2 restart.

  Usage (from repo root):
    .\deploy\Activate-Tunnel.ps1
    .\deploy\Activate-Tunnel.ps1 -Redeploy   # also npm ci/build on server

  Edit -PublicIp / -KeyPath below if your server or key path differs.
#>
param(
    [string] $PublicIp = "13.205.66.8",
    [string] $KeyPath = "D:\Ragu_ackpat\livetrading-mumbai.pem",
    [switch] $Redeploy
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $RepoRoot

$params = @{ PublicIp = $PublicIp; KeyPath = $KeyPath }
if ($Redeploy) { $params.Redeploy = $true }

& "$RepoRoot\doc\Refresh-QuickTunnel.ps1" @params
