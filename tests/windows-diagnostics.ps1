param([int]$AppProcessId)
$ErrorActionPreference = 'Continue'
Get-Process -Id $AppProcessId | Select-Object ProcessName,Id,SessionId,MainWindowTitle,Responding
Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,SessionId,Responding
Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddMinutes(-5)} -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'Reedline.exe' } | Select-Object -First 3 -ExpandProperty Message
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
try {
    $screen = [Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object Drawing.Bitmap $screen.Width,$screen.Height
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Location,[Drawing.Point]::Empty,$screen.Size)
    $bitmap.Save((Join-Path (Get-Location) 'artifacts/windows-startup.png'),[Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $bitmap.Dispose()
} catch { Write-Output $_.Exception.Message }
