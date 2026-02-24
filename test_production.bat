@echo off
echo ========================================
echo   Nifty OI Monitor - Deployment Setup
echo ========================================
echo.

echo Step 1: Building production bundle...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo ✓ Build completed successfully
echo.

echo Step 2: Testing production server locally...
echo Starting server on http://localhost:3000
echo Press Ctrl+C to stop the server
echo.
node server.js

pause
