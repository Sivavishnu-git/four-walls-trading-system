$ErrorActionPreference = "Stop"

Set-Location "C:\Users\ADMIN\.cursor\worktrees\LiveTrading\rwo"

& ".\doc\Refresh-QuickTunnel.ps1" `
  -PublicIp "13.205.66.8" `
  -KeyPath "D:\Ragu_ackpat\livetrading-mumbai.pem" `
  -Redeploy

