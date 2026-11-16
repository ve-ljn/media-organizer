# Rebuilds the Vite bundle, repackages the Electron app, and launches it, so a
# source change goes straight to a running app in one step.
#
# `npm run dev` runs from source and hot-reloads; the packaged .exe does not.
# It carries its own copy of dist/ baked in at packaging time, so any change
# under src/ or electron/ needs this before the shortcut shows it.

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

$appExe = Join-Path $projectRoot 'dist-app\MediaOrganizer-win32-x64\MediaOrganizer.exe'

Write-Host ''
Write-Host '  Rebuilding Media Organizer' -ForegroundColor Cyan
Write-Host "  $projectRoot" -ForegroundColor DarkGray
Write-Host ''

# The packager cannot overwrite files the running app has open. Since this
# script relaunches at the end, the app being open is the normal case rather
# than a mistake - so offer to close it instead of just refusing.
#
# Not forced without asking: a crop, split or rotate shells out to ffmpeg, and
# killing the app mid-write would leave a truncated file behind.
$running = Get-Process -Name 'MediaOrganizer' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host '  Media Organizer is already running.' -ForegroundColor Yellow
    Write-Host '  It has to close before the app can be repackaged.' -ForegroundColor DarkGray
    Write-Host '  Let any crop, split or rotate finish first.' -ForegroundColor DarkGray
    Write-Host ''
    $answer = Read-Host '  Close it and continue? (y/N)'
    if ($answer -notmatch '^[yY]') {
        Write-Host '  Cancelled.' -ForegroundColor DarkGray
        exit 1
    }

    $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }
    Start-Sleep -Milliseconds 800
    $running = Get-Process -Name 'MediaOrganizer' -ErrorAction SilentlyContinue
    if ($running) { $running | Stop-Process -Force }

    # File handles are released a moment after the process goes.
    Start-Sleep -Milliseconds 700
    Write-Host '  Closed.' -ForegroundColor DarkGray
    Write-Host ''
}

$started = Get-Date
npm run dist
$exitCode = $LASTEXITCODE
$elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)

Write-Host ''
if ($exitCode -ne 0) {
    Write-Host "  Build failed (exit $exitCode). Output above." -ForegroundColor Red
    Write-Host '  The app was not launched.' -ForegroundColor DarkGray
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit $exitCode
}

Write-Host "  Built in ${elapsed}s" -ForegroundColor Green

# A zero exit code is not proof the packager wrote the binary where expected.
if (-not (Test-Path -LiteralPath $appExe)) {
    Write-Host "  Build reported success but the app is missing:" -ForegroundColor Red
    Write-Host "  $appExe" -ForegroundColor DarkGray
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 1
}

Write-Host '  Launching...' -ForegroundColor Green
Start-Process -FilePath $appExe
Write-Host ''
Start-Sleep -Seconds 2
exit 0
