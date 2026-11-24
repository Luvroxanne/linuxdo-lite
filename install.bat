@echo off
chcp 65001 >nul
setlocal
title LinuxDo 看帖 Lite 一键安装器
set "DIR=%USERPROFILE%\linuxdo-lite"
set "ZIP=%DIR%\linuxdo-lite.zip"
set "URL=https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip"
echo ==============================================
echo  LinuxDo 看帖 Lite 一键安装器
echo ==============================================
echo.
echo 正在下载最新版到 %DIR% ...
if not exist "%DIR%" mkdir "%DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%URL%' -OutFile '%ZIP%' -UseBasicParsing; exit 0 } catch { exit 1 }"
if errorlevel 1 goto :dlfail
if not exist "%ZIP%" goto :dlfail
echo 下载完成，正在解压...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force -Path '%ZIP%' -DestinationPath '%DIR%'"
del "%ZIP%" >nul 2>&1
if not exist "%DIR%\manifest.json" goto :unpackfail
echo.
echo 已解压到 %DIR%
echo.
echo 接下来请在打开的扩展页里手动完成最后一步：
echo   1. 开启右上角 开发者模式
echo   2. 点 加载已解压的扩展程序
echo   3. 选择文件夹 %DIR%
echo.
echo 以后更新：再双击一次这个 install.bat 就行，本地设置不会丢。
echo 正在打开 chrome://extensions/ ...
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "chrome://extensions/" & goto :done
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "chrome://extensions/" & goto :done
start "" "chrome://extensions/"
:done
echo.
pause
exit /b 0
:dlfail
echo.
echo 下载失败：没能从 GitHub 下载到 linuxdo-lite.zip
echo 请检查网络 / 梯子，再双击一次重试；也可以手动去 Releases 页下载。
echo.
pause
exit /b 1
:unpackfail
echo.
echo 解压失败：%DIR% 里没有找到 manifest.json
echo 请删除 %DIR% 后再双击一次重试。
echo.
pause
exit /b 1
