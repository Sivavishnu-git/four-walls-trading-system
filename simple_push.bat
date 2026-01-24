@echo off
echo ==========================================
echo   Push LiveTrading to GitHub
echo ==========================================

echo.
echo [1/1] Pushing to origin main...
echo.
echo NOTE: A browser window or login prompt might appear.
echo Please complete the authentication there.
echo.

git push -u origin main

echo.
if %errorlevel% neq 0 (
    echo [ERROR] Push failed!
    echo.
    echo Common issues:
    echo 1. You might not have permission
    echo 2. The repository might not exist
    echo 3. You made a typo in the URL
) else (
    echo [SUCCESS] Code pushed successfully!
)

echo.
pause
