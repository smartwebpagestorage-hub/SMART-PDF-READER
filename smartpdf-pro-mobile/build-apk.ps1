# ==============================================================================
# Smart PDF Pro Mobile - Automated APK Build Script
# 100% Self-Contained, Fast & Robust
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Building Smart PDF Pro (Android APK)   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$scriptDir = $PSScriptRoot
$sdk = "$env:LOCALAPPDATA\Android\Sdk"

# Pick highest installed build-tools (36.0.0 / 35.0.0 / 34.0.0)
$buildToolsDir = (Get-ChildItem "$sdk\build-tools" | Sort-Object Name -Descending | Select-Object -First 1).FullName
Write-Host "Using Android Build Tools: $buildToolsDir" -ForegroundColor Gray

$aapt2 = "$buildToolsDir\aapt2.exe"
$d8 = "$buildToolsDir\d8.bat"
$zipalign = "$buildToolsDir\zipalign.exe"
$apksigner = "$buildToolsDir\apksigner.bat"

# Find available android.jar (platform 34 / 35 / 36)
$androidJar = "$sdk\platforms\android-34\android.jar"
if (-not (Test-Path $androidJar)) {
    $androidJar = (Get-ChildItem "$sdk\platforms\*\android.jar" | Select-Object -First 1).FullName
}
Write-Host "Using Android Platform: $androidJar" -ForegroundColor Gray

# Java Compiler & Keytool
$javac = "javac"
$keytool = "keytool"
$adoptiumJavac = "C:\Program Files\Eclipse Adoptium\jdk-25.0.1.8-hotspot\bin\javac.exe"
if (Test-Path $adoptiumJavac) {
    $javac = $adoptiumJavac
    $keytool = "C:\Program Files\Eclipse Adoptium\jdk-25.0.1.8-hotspot\bin\keytool.exe"
}

$classesDir = "$scriptDir\classes"
$dexDir = "$scriptDir\dex"
$resDir = "$scriptDir\res"
$srcDir = "$scriptDir\src"
$assetsDir = "$scriptDir\assets"

# 1. Clean previous build artifacts
Write-Host "[1/7] Cleaning previous build artifacts..." -ForegroundColor Yellow
if (Test-Path $classesDir) { Remove-Item -Recurse -Force $classesDir }
if (Test-Path $dexDir) { Remove-Item -Recurse -Force $dexDir }
if (Test-Path "$scriptDir\compiled_res.zip") { Remove-Item -Force "$scriptDir\compiled_res.zip" }
if (Test-Path "$scriptDir\unaligned.apk") { Remove-Item -Force "$scriptDir\unaligned.apk" }
if (Test-Path "$scriptDir\aligned.apk") { Remove-Item -Force "$scriptDir\aligned.apk" }
if (Test-Path "$scriptDir\SmartPdf-Pro.apk") { Remove-Item -Force "$scriptDir\SmartPdf-Pro.apk" }

New-Item -ItemType Directory -Force -Path $classesDir, $dexDir | Out-Null

# 2. Compile resources
Write-Host "[2/7] Compiling Android resources with aapt2..." -ForegroundColor Yellow
& $aapt2 compile --dir $resDir -o "$scriptDir\compiled_res.zip"

# 3. Link package (generates unaligned APK and R.java)
Write-Host "[3/7] Linking package with aapt2 link..." -ForegroundColor Yellow
& $aapt2 link -I $androidJar --manifest "$scriptDir\AndroidManifest.xml" -o "$scriptDir\unaligned.apk" --java $srcDir "$scriptDir\compiled_res.zip" --auto-add-overlay

# 4. Compile Java sources
Write-Host "[4/7] Compiling Java sources with javac..." -ForegroundColor Yellow
$javaFiles = Get-ChildItem -Path $srcDir -Filter "*.java" -Recurse | ForEach-Object { $_.FullName }
& $javac -cp "$androidJar" -d $classesDir $javaFiles
if ($LASTEXITCODE -ne 0) { throw "javac compilation failed" }

# 5. Dex with D8
Write-Host "[5/7] Converting bytecode to Dalvik Executable with D8..." -ForegroundColor Yellow
$classFiles = Get-ChildItem -Path $classesDir -Filter "*.class" -Recurse | ForEach-Object { $_.FullName }
& $d8 --lib $androidJar --output $dexDir $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 execution failed" }

# 6. Add classes.dex and assets into unaligned.apk with POSIX forward slashes
Write-Host "Adding classes.dex and assets into APK..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open("$scriptDir\unaligned.apk", [System.IO.Compression.ZipArchiveMode]::Update)

# Add classes.dex
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$dexDir\classes.dex", "classes.dex") | Out-Null

# Add all assets
$assetFiles = Get-ChildItem -Path $assetsDir -Recurse -File
foreach ($file in $assetFiles) {
    $rel = $file.FullName.Substring($assetsDir.Length).TrimStart('\', '/')
    $posixPath = "assets/" + $rel.Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $posixPath) | Out-Null
    Write-Host "  -> Added: $posixPath" -ForegroundColor DarkGray
}
$zip.Dispose()

# 7. Zipalign APK
Write-Host "[6/7] Aligning APK (zipalign)..." -ForegroundColor Yellow
& $zipalign -f -v 4 "$scriptDir\unaligned.apk" "$scriptDir\aligned.apk" | Out-Null

# 8. Sign APK
Write-Host "[7/7] Signing APK (apksigner)..." -ForegroundColor Yellow
$keystore = "$scriptDir\debug.keystore"
if (-not (Test-Path $keystore)) {
    Write-Host "Generating debug keystore..." -ForegroundColor Cyan
    & $keytool -genkey -v -keystore $keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=SmartPDFPro,O=SmartPDF,C=IN"
}

$outputApk = "$scriptDir\SmartPdf-Pro.apk"
& $apksigner sign --ks $keystore --ks-pass pass:android --out $outputApk "$scriptDir\aligned.apk"

# Cleanup intermediate files
if (Test-Path $classesDir) { Remove-Item -Recurse -Force $classesDir }
if (Test-Path $dexDir) { Remove-Item -Recurse -Force $dexDir }
if (Test-Path "$scriptDir\compiled_res.zip") { Remove-Item -Force "$scriptDir\compiled_res.zip" }
if (Test-Path "$scriptDir\unaligned.apk") { Remove-Item -Force "$scriptDir\unaligned.apk" }
if (Test-Path "$scriptDir\aligned.apk") { Remove-Item -Force "$scriptDir\aligned.apk" }

Write-Host "==========================================" -ForegroundColor Green
Write-Host " SUCCESS! Android APK Generated: SmartPdf-Pro.apk" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Get-Item $outputApk | Select-Object Name, Length, LastWriteTime
