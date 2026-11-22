$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$rid = 'win-x64'
dotnet publish native/Reedline/Reedline.csproj -c Release -r $rid --self-contained true -o artifacts/app -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE) { throw 'Windows publish failed' }
if (!(Test-Path artifacts/app/wwwroot/index.html)) { throw 'Run npm run build before packaging' }
$legal = 'artifacts/app/licenses'
New-Item -ItemType Directory -Force $legal | Out-Null
foreach ($dep in @('react','react-dom','scheduler','morphicons','pitchy','@fontsource/barlow-condensed','@fontsource/ibm-plex-mono','midi-file')) {
    $path = @(Get-ChildItem -Path "node_modules/$dep/LICENSE*" -File)[0]
    if (!$path) { throw "Missing license for $dep" }
    Copy-Item $path.FullName (Join-Path $legal (($dep -replace '[@/]','_') + '.txt'))
}
$fft = Get-Content -Raw 'node_modules/fft.js/README.md'
$fft.Substring($fft.IndexOf('#### LICENSE')) | Set-Content -Encoding utf8 "$legal/fft.js.txt"
$cache = (dotnet nuget locals global-packages --list) -replace '^.*?:\s*',''
$wvVersion = ([xml](Get-Content -Raw native/Reedline/Reedline.csproj)).Project.ItemGroup.PackageReference.Version
$wv = Join-Path $cache "microsoft.web.webview2/$wvVersion"
Copy-Item "$wv/LICENSE.txt" "$legal/WebView2.txt"
Copy-Item "$wv/NOTICE.txt" "$legal/WebView2-NOTICE.txt"
foreach ($runtime in @('microsoft.netcore.app.runtime.win-x64','microsoft.windowsdesktop.app.runtime.win-x64')) {
    $versionDir = Get-ChildItem (Join-Path $cache $runtime) -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Get-ChildItem $versionDir.FullName -File | Where-Object Name -match 'LICENSE|ThirdPartyNotices' | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $legal ($runtime + '-' + $_.Name))
    }
}
Copy-Item docs/使用说明.txt artifacts/app/使用说明.txt
New-Item -ItemType Directory -Force artifacts/release | Out-Null
$zip = "artifacts/release/Reedline-$version-windows-x64-portable.zip"
Compress-Archive -Path artifacts/app/* -DestinationPath $zip -Force -CompressionLevel Optimal
$bootstrap = 'artifacts/MicrosoftEdgeWebview2Setup.exe'
Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrap
$signature = Get-AuthenticodeSignature $bootstrap
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'Invalid WebView2 bootstrapper signature' }
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if (!$iscc) { $compiler = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Inno Setup 6/ISCC.exe' }
else { $compiler = $iscc.Source }
if (!(Test-Path $compiler)) { throw 'Install Inno Setup 6 for the Windows installer.' }
& $compiler "/DAppVersion=$version" scripts/installer.iss
if ($LASTEXITCODE) { throw 'Installer build failed' }
Get-ChildItem artifacts/release -File | Where-Object Extension -in '.exe','.zip' | Sort-Object Name | ForEach-Object {
    (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower() + '  ' + $_.Name
} | Set-Content -Encoding ascii artifacts/release/SHA256SUMS.txt
