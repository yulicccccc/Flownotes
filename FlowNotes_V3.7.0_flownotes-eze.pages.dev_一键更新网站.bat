@echo off
chcp 65001 >nul
echo ===================================================
echo   FlowNotes V3.7.0 - Auto Deploy to Cloudflare
echo   Target Domain: https://flownotes-eze.pages.dev
echo ===================================================
echo.

cd /d "%~dp0"

:: Check if portable node exists
if not exist "node\node.exe" (
    echo [ERROR] Portable Node.js not found.
    pause
    exit /b 1
)

echo [1/2] Connecting to Cloudflare...
:: Setup local path to use portable node
set PATH=%~dp0node;%PATH%
set CLOUDFLARE_ACCOUNT_ID=c7507f82f5078e81f58c2fcc1e7bfbdb

:: Run wrangler deploy
call .\node\npx.cmd --yes wrangler pages deploy public --project-name flownotes --branch main

echo.
echo ===================================================
echo   Deployment finished!
echo   Live URL: https://flownotes-eze.pages.dev
echo ===================================================
pause
