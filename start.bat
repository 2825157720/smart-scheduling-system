@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
if not exist "%ROOT%run_forever.ps1" (
    echo run_forever.ps1 not found.
    exit /b 1
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process -WindowStyle Hidden -FilePath powershell -ArgumentList '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File','%ROOT%run_forever.ps1' | Out-Null"

endlocal
