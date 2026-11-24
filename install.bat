@echo off
setlocal
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
echo Opening chrome://extensions/ ...
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "chrome://extensions/" & goto done
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "chrome://extensions/" & goto done
start "" "chrome://extensions/"
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
