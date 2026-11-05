@echo off
setlocal
set PYTHONIOENCODING=utf-8
title FlowNotes Live Clipboard Sync (Win to iPad)
cd /d "C:\Users\qchen\OneDrive - Professional Compounding Centers of America, Inc\Documents\Flownotes"

echo ==========================================================
echo   FlowNotes v3.7.0 - Live Clipboard Sync (Win to iPad)
echo ==========================================================
echo.

python "FlowNotes_PC剪贴板实时同步.py"
pause
