[Setup]
AppId={{1119B4B1-A433-4314-B6FA-1E63ADE789B1}
AppName=Reedline
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\Reedline
DefaultGroupName=Reedline
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\Reedline.exe
SetupIconFile=..\native\Reedline\reedline.ico
OutputDir=..\artifacts\release
OutputBaseFilename=Reedline-{#AppVersion}-windows-x64-setup
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
[Files]
Source: "..\artifacts\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\artifacts\MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy
[Icons]
Name: "{group}\Reedline"; Filename: "{app}\Reedline.exe"
[Run]
Filename: "{app}\Reedline.exe"; Description: "Open Reedline"; Flags: nowait postinstall skipifsilent
[Code]
function HasRuntime(Root: Integer): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(Root, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version)
    and (Version <> '') and (Version <> '0.0.0.0');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  if HasRuntime(HKLM32) or HasRuntime(HKCU) then Exit;
  ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
  if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
    or not (HasRuntime(HKLM32) or HasRuntime(HKCU)) then
    Result := 'Microsoft Edge WebView2 Runtime could not be installed. Connect to the internet or install the Evergreen Runtime and try again.';
end;
