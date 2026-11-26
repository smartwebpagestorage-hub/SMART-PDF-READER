Add-Type -AssemblyName System.Drawing

$srcPath = "Vibrant PDF Reader & Editor App Icon.png"
if (-not (Test-Path $srcPath)) {
    $srcPath = "..\Vibrant PDF Reader & Editor App Icon.png"
}
$fullSrc = (Resolve-Path $srcPath).Path
$srcImg = [System.Drawing.Image]::FromFile($fullSrc)

# Create playstore-assets folder
$assetsDir = "$PSScriptRoot\playstore-assets"
if (-not (Test-Path $assetsDir)) { 
    New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null 
}

function Save-Resized($img, $w, $h, $dest) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Saved: $dest ($w x $h)"
}

# 1. 512x512 Play Store Icon
Save-Resized $srcImg 512 512 "$assetsDir\icon_512x512.png"

# 2. 1024x500 Feature Graphic (Letterboxed with stylish modern gradient background)
$fgBmp = New-Object System.Drawing.Bitmap(1024, 500)
$fgG = [System.Drawing.Graphics]::FromImage($fgBmp)
$fgG.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$fgG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

$rect = New-Object System.Drawing.Rectangle(0, 0, 1024, 500)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(15, 23, 42), [System.Drawing.Color]::FromArgb(30, 58, 138), 45.0)
$fgG.FillRectangle($brush, $rect)
$brush.Dispose()

$iconSize = 340
$iconX = 70
$iconY = [int]((500 - $iconSize) / 2)
$fgG.DrawImage($srcImg, $iconX, $iconY, $iconSize, $iconSize)

$titleFont = New-Object System.Drawing.Font("Segoe UI", 38, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Regular)
$badgeFont = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$cyanBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(56, 189, 248))
$yellowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 204, 21))

$fgG.DrawString("Smart PDF Pro", $titleFont, $whiteBrush, 450, 130)
$fgG.DrawString("Reader, Editor & Pro Tools", $subFont, $cyanBrush, 454, 210)
$fgG.DrawString("100% Free - No Ads - 100% Offline & Private", $badgeFont, $yellowBrush, 454, 280)

$titleFont.Dispose(); $subFont.Dispose(); $badgeFont.Dispose()
$whiteBrush.Dispose(); $cyanBrush.Dispose(); $yellowBrush.Dispose()
$fgG.Dispose()
$fgBmp.Save("$assetsDir\feature_graphic_1024x500.png", [System.Drawing.Imaging.ImageFormat]::Png)
$fgBmp.Dispose()
Write-Host "Saved: $assetsDir\feature_graphic_1024x500.png"

# 3. Android Mipmaps
$mipmaps = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}
foreach ($dir in $mipmaps.Keys) {
    $size = $mipmaps[$dir]
    $destDir = "$PSScriptRoot\res\$dir"
    if (Test-Path $destDir) {
        Save-Resized $srcImg $size $size "$destDir\ic_launcher.png"
        Save-Resized $srcImg $size $size "$destDir\ic_launcher_round.png"
    }
}

# 4. App icons for desktop & mobile web assets
Save-Resized $srcImg 512 512 "$PSScriptRoot\..\smartpdf-pro-desktop\icons\icon.png"
Save-Resized $srcImg 512 512 "$PSScriptRoot\..\smartpdf-pro-desktop\icons\icon_round.png"
Save-Resized $srcImg 512 512 "$PSScriptRoot\..\smartpdf-pro-desktop\app-icon.png"
Save-Resized $srcImg 512 512 "$PSScriptRoot\assets\icons\icon.png"
Save-Resized $srcImg 512 512 "$PSScriptRoot\assets\icons\icon_round.png"

$srcImg.Dispose()
Write-Host "All icons generated successfully!" -ForegroundColor Green
