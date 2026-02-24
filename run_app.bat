@echo off
echo ===================================================
echo   Starting Four Walls Trading System
echo ===================================================

echo.
echo [1/2] Starting Proxy Server (Port 3000)...
start "Proxy Server" cmd /k "npm run proxy"

echo.
echo [2/2] Starting Frontend Application...
start "LiveTrading Frontend" cmd /k "npm run dev"

echo.
echo ===================================================
echo   App is running!
echo   Frontend: http://localhost:5173
echo   Proxy:    http://localhost:3000
echo ===================================================
echo.
echo You can minimize this window, but don't close it 
echo until you want to stop the application.
echo.
pause
