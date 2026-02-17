@echo off
echo ===================================================
echo   Four Walls Trading System - One Click Start
echo ===================================================

:: Check for .env file
if not exist .env (
    echo [WARNING] .env file not found!
    echo Please copy .env.example to .env and add your Upstox token.
    echo.
    pause
    exit /b
)

echo.
echo [1/2] Starting Proxy Server...
start "Proxy Server" /min cmd /k "color 0A && echo Proxy Server Running... && npm run proxy"

echo.
echo [2/2] Starting Frontend...
start "Trading App" /min cmd /k "color 0B && echo Frontend Running... && npm run dev"

echo.
echo ===================================================
echo   System is Online! 🚀
echo ===================================================
echo.
echo Opening Google Chrome...
timeout /t 5 >nul
start chrome http://localhost:5173

exit
