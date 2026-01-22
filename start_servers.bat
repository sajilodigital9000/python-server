@echo off
echo ============================================
echo   SajiloCloud with Collaborative Tools
echo ============================================
echo.
echo Starting servers...
echo.

REM Start WebSocket server in a new window
start "WebSocket Server" cmd /k "python websocket_server.py"

REM Wait a moment for WebSocket server to start
timeout /t 2 /nobreak > nul

REM Start main HTTP server
echo Starting HTTP server...
python server.py
