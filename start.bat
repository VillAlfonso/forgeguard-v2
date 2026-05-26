@echo off
REM ============================================================
REM  Revelator launcher
REM  Starts the FastAPI backend and the Vite frontend in two
REM  separate terminal windows. Close those windows to stop.
REM ============================================================

setlocal
set "ROOT=%~dp0"

REM Prefer the project virtualenv python if it exists, else system python.
set "PY=%ROOT%venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

echo Starting Revelator backend  (http://localhost:8000) ...
start "Revelator Backend" cmd /k "cd /d "%ROOT%backend" && "%PY%" run.py"

echo Starting Revelator frontend (http://localhost:5173) ...
start "Revelator Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo.
echo Both servers are launching in separate windows.
echo   Backend : http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
echo Close those two windows to stop the servers.
endlocal
