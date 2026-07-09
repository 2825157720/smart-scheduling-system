$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = 'C:\Users\admin\AppData\Local\Programs\Python\Python314\python.exe'
if (-not (Test-Path $python)) {
    $python = 'C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe'
}
if (-not (Test-Path $python)) {
    $python = (Get-Command python -ErrorAction Stop).Source
}
$pythonPath = if (Test-Path $python) { (Resolve-Path $python).Path } else { (Get-Command python -ErrorAction Stop).Source }

function Test-ProjectCommandLine {
    param(
        [string]$CommandLine
    )

    if (-not $CommandLine) {
        return $false
    }

    return (
        $CommandLine -match '(?i)(?:^|[\\/\\s])app\.py(?:$|[\s"])' -or
        $CommandLine -match '(?i)(?:^|[\\/\\s])server_runtime\.py(?:$|[\s"])' -or
        $CommandLine -match '(?i)(?:^|[\\/\\s])run_forever\.ps1(?:$|[\s"])'
    )
}

function Stop-ProjectProcesses {
    param(
        [string]$RootPath
    )

    $targets = Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and (Test-ProjectCommandLine $_.CommandLine)
        } |
        Select-Object -ExpandProperty ProcessId -Unique

    foreach ($targetPid in $targets) {
        if (-not $targetPid -or $targetPid -eq $PID) {
            continue
        }

        try {
            Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
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
