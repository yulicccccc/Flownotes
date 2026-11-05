@echo off
chcp 65001 >nul
title FlowNotes 剪贴板实时同步助手 (Win -> iPad)
cd /d "%~dp0"

echo ==========================================================
echo   FlowNotes v3.7.0 — Win-to-iPad 剪贴板实时快投助手
echo   只要在电脑上 Ctrl+C 复制，iPad 上的 FlowNotes 即可实时感知！
echo ==========================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到系统 Python 环境，请确认已安装 Python。
    pause
    exit /b 1
)

python FlowNotes_PC剪贴板实时同步.py
pause
