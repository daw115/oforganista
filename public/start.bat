@echo off
title Ofiarowanie - Rzutnik LAN
echo.
echo ========================================
echo   Ofiarowanie - Serwer lokalny
echo ========================================
echo.
echo Uruchamiam serwer na http://localhost:8080 ...
echo.
start "" http://localhost:8080
node serve.cjs
pause
