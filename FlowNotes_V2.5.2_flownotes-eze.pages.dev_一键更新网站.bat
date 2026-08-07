@echo off
echo ===================================================
echo   FlowNotes V2.5.2 - Auto Deploy to Cloudflare
echo ===================================================
echo.

cd /d "%~dp0"

:: 1. Sync code to GitHub
echo [1/3] Syncing code to GitHub...
git add .
git commit -m "auto: update site %date% %time%" >nul 2>&1
git push origin master >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Code successfully pushed to GitHub!
) else (
    echo [INFO] Git status clean or already up to date.
)
echo.

:: 2. Check if portable node exists
echo [2/3] Checking Node environment...
if not exist "node\node.exe" (
    echo [ERROR] Portable Node.js not found in node\ subdirectory.
    pause
    exit /b 1
)

:: Setup local path to use portable node
set PATH=%~dp0node;%PATH%
set CLOUDFLARE_ACCOUNT_ID=c7507f82f5078e81f58c2fcc1e7bfbdb

:: 3. Run wrangler deploy directly to production branch
echo [3/3] Deploying to Cloudflare Pages (Production)...
call .\node\npx.cmd --yes wrangler pages deploy public --project-name flownotes --branch main

echo.
echo ===================================================
echo   Deployment finished! Both GitHub and Cloudflare updated.
echo   Live URL: https://flownotes-eze.pages.dev
echo ===================================================
pause
