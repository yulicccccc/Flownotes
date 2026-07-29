@echo off
echo ===================================================
echo   flownotes - Auto Deploy to Cloudflare
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

:: Run wrangler deploy
call .\node\npx.cmd --yes wrangler pages deploy public --project-name flownotes

echo.
echo ===================================================
echo   Deployment finished! 
echo   (If this is the first time, your browser will open to login)
echo ===================================================
pause
