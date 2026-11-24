@echo off
setlocal EnableExtensions
set "DIR=%USERPROFILE%\linuxdo-lite"
set "ZIP=%DIR%\linuxdo-lite.zip"
set "URL=https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip"
echo ==============================================
echo  LinuxDo Lite Installer
echo ==============================================
echo.
echo Downloading latest release to %DIR% ...
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
echo Next steps in the extensions page:
echo  1. Enable Developer mode
echo  2. Click Load unpacked
echo  3. Select %DIR%
echo.

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
if defined PROFILE (
  echo Opening Chrome with your last used profile: %PROFILE%
  echo Note: multiple profiles? Switch profile in Chrome, then Load unpacked again to install there.
  start "" "%CHROME%" --profile-directory="%PROFILE%" "chrome://extensions/"
) else (
  echo Opening Chrome ...
  start "" "%CHROME%" "chrome://extensions/"
)
goto done

:launch_edge
set "PROFILE="
call :last_profile "%LOCALAPPDATA%\Microsoft\Edge\User Data"
if defined PROFILE (
  echo Opening Microsoft Edge with your last used profile: %PROFILE%
  echo Note: multiple profiles? Switch profile in Edge, then Load unpacked again to install there.
  start "" "%EDGE%" --profile-directory="%PROFILE%" "edge://extensions/"
) else (
  echo Opening Microsoft Edge ...
  start "" "%EDGE%" "edge://extensions/"
)
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
