@echo off
setlocal EnableExtensions
set "DEFAULT_DIR=%USERPROFILE%\linuxdo-lite"
set "DIR=%DEFAULT_DIR%"
set "URL=https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip"
set "EXISTING="
set "UPDATE_MODE="

echo ==============================================
echo  LinuxDo Lite Installer
echo ==============================================
echo.

rem Find the folder Chrome/Edge is already loading this extension from.
rem Updating that exact folder keeps the extension ID, so settings / AI key survive.
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$hits=@(); $roots=@(($env:LOCALAPPDATA+'\Google\Chrome\User Data'),($env:LOCALAPPDATA+'\Microsoft\Edge\User Data'),($env:LOCALAPPDATA+'\Google\Chrome Beta\User Data'),($env:LOCALAPPDATA+'\Microsoft\Edge Beta\User Data')); foreach($r in $roots){ if(Test-Path $r){ Get-ChildItem $r -Directory -ErrorAction SilentlyContinue | ForEach-Object { foreach($f in @('Secure Preferences','Preferences')){ $p=Join-Path $_.FullName $f; if(Test-Path $p){ try{ $j=ConvertFrom-Json ([IO.File]::ReadAllText($p)); if($j.extensions -and $j.extensions.settings){ foreach($prop in $j.extensions.settings.PSObject.Properties){ $e=$prop.Value; if($e.location -eq 4 -and $e.path -and (Test-Path (Join-Path $e.path 'manifest.json'))){ $n=''; if($e.manifest -and $e.manifest.name){$n=$e.manifest.name}; if(($n -like '*LinuxDo*') -or ($e.path -like '*linuxdo-lite*')){ $hits += $e.path } } } } }catch{} } } } } }; $hits | Select-Object -Unique | Select-Object -First 1" 2^>nul`) do if not defined EXISTING set "EXISTING=%%P"

if defined EXISTING set "DIR=%EXISTING%"
if defined EXISTING set "UPDATE_MODE=1"
set "ZIP=%DIR%\linuxdo-lite.zip"

if not defined UPDATE_MODE goto install_fresh
echo Found existing install at "%DIR%"
echo Updating it in place to keep your settings and data.
echo If chrome://extensions shows more than one LinuxDo Lite, remove the old/broken copy.
goto install_msg_done
:install_fresh
echo No existing install found. Installing to "%DIR%"
:install_msg_done
echo.
echo Downloading latest release...
if not exist "%DIR%" mkdir "%DIR%"
curl.exe -L -o "%ZIP%" "%URL%"
if errorlevel 1 goto dl_fail
if not exist "%ZIP%" goto dl_fail
echo Download OK. Extracting...
tar -xf "%ZIP%" -C "%DIR%"
if exist "%DIR%\manifest.json" goto extracted
echo tar failed, trying PowerShell...
powershell -NoProfile -Command "Expand-Archive -Force '%ZIP%' '%DIR%'"
:extracted
del "%ZIP%" >nul 2>&1
if not exist "%DIR%\manifest.json" goto unpack_fail
echo.
echo Installed to %DIR%
echo.
if defined UPDATE_MODE goto update_done

echo Next steps in the extensions page:
echo  1. Enable Developer mode
echo  2. Click Load unpacked
echo  3. Select %DIR%
echo.
echo Opening the extensions page ...
goto open_browser

:update_done
echo Update done. In the extensions page click Reload on "LinuxDo Lite".
echo Do NOT click Load unpacked again - a second copy starts with empty settings.
echo.
echo Opening the extensions page ...
goto open_browser

:open_browser
set "CHROME="
set "EDGE="
call :find_browser
set "CHROME_RUN="
set "EDGE_RUN="
tasklist /fi "imagename eq chrome.exe" 2>nul | find /i "chrome.exe" >nul && set "CHROME_RUN=1"
tasklist /fi "imagename eq msedge.exe" 2>nul | find /i "msedge.exe" >nul && set "EDGE_RUN=1"
if defined CHROME if defined EDGE if not defined CHROME_RUN if defined EDGE_RUN goto launch_edge
if defined CHROME goto launch_chrome
if defined EDGE goto launch_edge
goto launch_manual

:launch_chrome
set "PROFILE="
call :last_profile "%LOCALAPPDATA%\Google\Chrome\User Data"
if not defined PROFILE goto chrome_plain
echo Opening Chrome with your last used profile: %PROFILE%
echo Note: multiple profiles? Switch profile in Chrome, then Reload the extension there.
start "" "%CHROME%" --profile-directory="%PROFILE%" "chrome://extensions/"
goto done

:chrome_plain
echo Opening Chrome ...
start "" "%CHROME%" "chrome://extensions/"
goto done

:launch_edge
set "PROFILE="
call :last_profile "%LOCALAPPDATA%\Microsoft\Edge\User Data"
if not defined PROFILE goto edge_plain
echo Opening Microsoft Edge with your last used profile: %PROFILE%
echo Note: multiple profiles? Switch profile in Edge, then Reload the extension there.
start "" "%EDGE%" --profile-directory="%PROFILE%" "edge://extensions/"
goto done

:edge_plain
echo Opening Microsoft Edge ...
start "" "%EDGE%" "edge://extensions/"
goto done

:launch_manual
echo Chrome / Edge not found. Open chrome://extensions/ or edge://extensions/ manually.
goto done

:find_browser
if not defined CHROME if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles%\Google\Chrome Beta\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome Beta\Application\chrome.exe"
if not defined CHROME for /f "delims=" %%P in ('where chrome 2^>nul') do if not defined CHROME set "CHROME=%%P"
if not defined EDGE if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles(x86)%\Microsoft\Edge Beta\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge Beta\Application\msedge.exe"
exit /b 0

:last_profile
set "PROFILE="
if not exist "%~1\Local State" exit /b 0
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "try{(ConvertFrom-Json ([IO.File]::ReadAllText('%~1\Local State'))).profile.last_used}catch{}" 2^>nul`) do set "PROFILE=%%P"
exit /b 0

:done
echo.
pause
exit /b 0
:dl_fail
echo.
echo Download failed. Check network / VPN and double-click again.
echo Or download manually from Releases.
echo.
pause
exit /b 1
:unpack_fail
echo.
echo Extract failed. manifest.json not found in %DIR%
echo Delete %DIR% and double-click again.
echo.
pause
exit /b 1
