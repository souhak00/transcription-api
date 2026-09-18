@echo off
setlocal
cd /d "%~dp0"
set "PYTHONPATH=%~dp0.runtime\python-packages"
set "PATH=%~dp0.runtime\ffmpeg\ffmpeg-8.1.2-essentials_build\bin;%PATH%"
"C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" src\server.js
