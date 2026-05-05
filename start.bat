@echo off
cd /d %~dp0

start cmd /k "node index.js"

timeout /t 2 >nul

start http://localhost:3000