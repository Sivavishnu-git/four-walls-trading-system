@echo off
echo ==========================================
echo   Push LiveTrading to GitHub
echo ==========================================

:: 1. Configure Git Identity
echo.
echo [1/4] Checking Git Configuration...
git config user.name >nul 2>&1
if %errorlevel% neq 0 (
    echo Git user.name is not set.
    set /p GIT_NAME="Enter your Name (e.g. John Doe): "
    git config user.name "%GIT_NAME%"
) else (
    echo Git user.name is set.
)

git config user.email >nul 2>&1
if %errorlevel% neq 0 (
    echo Git user.email is not set.
    set /p GIT_EMAIL="Enter your Email (e.g. john@example.com): "
    git config user.email "%GIT_EMAIL%"
) else (
    echo Git user.email is set.
)

:: 2. Commit Changes
echo.
echo [2/4] Committing changes...
git commit -m "Initial commit: LiveTrading application with OI monitoring and order placement"

:: 3. Setup Remote
echo.
echo [3/4] Linking to GitHub...
echo Please go to https://github.com/new and create a PRIVATE repository named 'four-walls-trading-system'
echo.
set /p REPO_URL="Paste the HTTPS URL here (e.g. https://github.com/username/four-walls-trading-system.git): "

git remote add origin %REPO_URL%
git branch -M main

:: 4. Push
echo.
echo [4/4] Pushing code...
git push -u origin main

echo.
echo ==========================================
echo   Done!
echo ==========================================
pause
