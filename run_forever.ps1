$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe'
if (-not (Test-Path $python)) {
    $python = (Get-Command python -ErrorAction Stop).Source
}
$pythonPath = if (Test-Path $python) { (Resolve-Path $python).Path } else { (Get-Command python -ErrorAction Stop).Source }

function Stop-ProjectProcesses {
    param(
        [string]$RootPath
    )

    $pattern = [regex]::Escape($RootPath)
    $targets = Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and
            (($_.CommandLine -match 'app\.py' -and $_.CommandLine -match $pattern) -or
             ($_.CommandLine -match 'server_runtime\.py' -and $_.CommandLine -match $pattern) -or
             ($_.CommandLine -match 'run_forever\.ps1' -and $_.CommandLine -match $pattern))
        } |
        Select-Object -ExpandProperty ProcessId -Unique

    foreach ($pid in $targets) {
        if (-not $pid -or $pid -eq $PID) {
            continue
        }

        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        } catch {
        }
    }
}

Stop-ProjectProcesses -RootPath $root
Start-Sleep -Milliseconds 800

while ($true) {
    try {
        Stop-ProjectProcesses -RootPath $root
        Push-Location $root
        & $python -c "import flask" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            & $python -m pip install flask --quiet
        }
        & $python (Join-Path $root 'app.py')
    }
    catch {
        Write-Host $_.Exception.Message
    }
    finally {
        Pop-Location
    }

    Start-Sleep -Seconds 3
}
