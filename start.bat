@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "PYTHON_EXE=C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe"

if not exist "%PYTHON_EXE%" (
    where python >nul 2>&1
    if errorlevel 1 (
        echo Python not found. Install Python 3.8+ first.
        exit /b 1
    )
    set "PYTHON_EXE=python"
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$root = (Resolve-Path '%ROOT%').Path.TrimEnd('\');" ^
  "$python = '%PYTHON_EXE%';" ^
  "$pythonPath = if (Test-Path $python) { (Resolve-Path $python).Path } else { (Get-Command python -ErrorAction Stop).Source };" ^
  "$pattern = [Regex]::Escape($root);" ^
  "$targets = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and (($_.CommandLine -match 'app\.py' -and $_.CommandLine -match $pattern) -or ($_.CommandLine -match 'server_runtime\.py' -and $_.CommandLine -match $pattern) -or ($_.CommandLine -match 'run_forever\.ps1' -and $_.CommandLine -match $pattern)) } | Select-Object -ExpandProperty ProcessId -Unique;" ^
  "foreach($pid in $targets){ if($pid -and $pid -ne $PID){ try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {} } };" ^
  "Start-Sleep -Milliseconds 800;" ^
  "$app = Join-Path $root 'app.py';" ^
  "if(-not (Test-Path $app)){ throw 'app.py not found' }" ^
  "Set-Location $root;" ^
  "& $python -c 'import flask' | Out-Null;" ^
  "if($LASTEXITCODE -ne 0){ Write-Host 'Flask not found, installing...'; & $python -m pip install flask --quiet }" ^
  "Write-Host 'Starting Smart Scheduling System...';" ^
  "& $python $app"

endlocal
