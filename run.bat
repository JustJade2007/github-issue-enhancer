@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo         GitHub Issue Enhancer (Gemini Flash Lite)
echo ========================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js (version 20 or higher).
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Installing required dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
)

if not exist ".env" (
    if "%GEMINI_API_KEY%"=="" (
        echo [NOTICE] No GEMINI_API_KEY found in environment or .env file.
        echo To run locally, set GEMINI_API_KEY in a .env file or environment variable.
        echo.
    )
)

echo Starting Issue Enhancer...
echo.

if "%~1"=="" (
    node src\index.js
) else (
    node src\index.js %*
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo Execution exited with error code %ERRORLEVEL%.
)

echo.
pause
