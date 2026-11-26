# ==============================================================================
# Smart PDF Pro Desktop - Automated Build Script
# Compiles Launcher, Installer, and Uninstaller using .NET Framework csc.exe
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Building Smart PDF Pro (Desktop Edition)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$scriptDir = $PSScriptRoot
$csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    throw "csc.exe not found at $csc"
}

$iconArg = if (Test-Path "$scriptDir\app.ico") { "/win32icon:`"$scriptDir\app.ico`"" } else { "" }

# 1. Compile Main Launcher (SmartPdf-Pro.exe)
Write-Host "[1/3] Compiling SmartPdf-Pro.exe..." -ForegroundColor Yellow
$launcherOut = "$scriptDir\SmartPdf-Pro.exe"
$launcherArgs = @(
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/out:$launcherOut",
    $iconArg,
    "/r:System.dll,System.Windows.Forms.dll,System.Drawing.dll,Microsoft.CSharp.dll",
    "$scriptDir\SmartPdfLauncher.cs"
) | Where-Object { $_ -ne "" }

& $csc $launcherArgs
if ($LASTEXITCODE -ne 0) { throw "SmartPdf-Pro.exe compilation failed" }

# 2. Compile Uninstaller (Uninstall.exe)
Write-Host "[2/3] Compiling Uninstall.exe..." -ForegroundColor Yellow
$uninstallOut = "$scriptDir\Uninstall.exe"
$uninstallArgs = @(
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/out:$uninstallOut",
    $iconArg,
    "/r:System.dll,System.Windows.Forms.dll,System.Drawing.dll",
    "$scriptDir\SmartPdfUninstall.cs"
) | Where-Object { $_ -ne "" }

& $csc $uninstallArgs
if ($LASTEXITCODE -ne 0) { throw "Uninstall.exe compilation failed" }

# 3. Compile Installer / Setup Wizard (SmartPdf-Pro-Setup.exe)
Write-Host "[3/3] Compiling SmartPdf-Pro-Setup.exe..." -ForegroundColor Yellow
$setupOut = "$scriptDir\SmartPdf-Pro-Setup.exe"
$setupArgs = @(
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/out:$setupOut",
    $iconArg,
    "/r:System.dll,System.Windows.Forms.dll,System.Drawing.dll,Microsoft.CSharp.dll",
    "$scriptDir\SmartPdfSetup.cs"
) | Where-Object { $_ -ne "" }

& $csc $setupArgs
if ($LASTEXITCODE -ne 0) { throw "SmartPdf-Pro-Setup.exe compilation failed" }

Write-Host "==========================================" -ForegroundColor Green
Write-Host " SUCCESS! Desktop Executables Generated:" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Get-Item "$scriptDir\SmartPdf-Pro.exe", "$scriptDir\SmartPdf-Pro-Setup.exe", "$scriptDir\Uninstall.exe" | Select-Object Name, Length, LastWriteTime
