@echo off
title Budowanie ofiarowanie.exe
echo.
echo ========================================
echo   Budowanie wersji offline .exe
echo ========================================
echo.

:: 1. Sprawdz czy pkg jest zainstalowane
where pkg >nul 2>nul
if %errorlevel% neq 0 (
    echo [1/4] Instaluje pkg globalnie...
    npm install -g pkg
) else (
    echo [1/4] pkg juz zainstalowane
)

:: 2. Zainstaluj zaleznosci
echo [2/5] Instaluje zaleznosci (npm install)...
cd /d "%~dp0.."
call npm install
if %errorlevel% neq 0 (
    echo BLAD: npm install nie powiodlo sie!
    pause
    exit /b 1
)

:: 3. Zbuduj aplikacje React
echo [3/5] Buduje aplikacje...
call npx vite build
if %errorlevel% neq 0 (
    echo BLAD: npm run build nie powiodlo sie!
    pause
    exit /b 1
)

:: 4. Przygotuj folder tymczasowy
echo [4/5] Przygotowuje pliki...
if exist build-tmp rmdir /s /q build-tmp
mkdir build-tmp

:: Kopiuj serve.cjs jako glowny plik
copy public\serve.cjs build-tmp\serve.cjs >nul

:: Utworz package.json dla pkg
echo {"name":"ofiarowanie","version":"1.0.0","bin":"serve.cjs","pkg":{"assets":["dist/**/*"],"targets":["node12-win-x64"]}} > build-tmp\package.json

:: Kopiuj zbudowana aplikacje
xcopy dist build-tmp\dist\ /s /e /q >nul

:: Kopiuj modul ws (wymagany przez serve.cjs)
if exist node_modules\ws (
    xcopy node_modules\ws build-tmp\node_modules\ws\ /s /e /q >nul
)

:: 5. Buduj exe
echo [5/5] Pakuje do ofiarowanie.exe...
cd build-tmp
pkg . --target node12-win-x64 --output ..\ofiarowanie.exe
cd ..

:: Sprzatanie
rmdir /s /q build-tmp

if exist ofiarowanie.exe (
    echo.
    echo ========================================
    echo   SUKCES! Utworzono: ofiarowanie.exe
    echo ========================================
    echo.
    echo Aby uruchomic:
    echo   1. Skopiuj ofiarowanie.exe na docelowy komputer
    echo   2. Uruchom ofiarowanie.exe
    echo   3. Otworz http://localhost:8080
    echo.
    echo Opcjonalnie: ofiarowanie.exe --db "C:\sciezka\do\songs.sqlite"
) else (
    echo.
    echo BLAD: Nie udalo sie utworzyc ofiarowanie.exe
)

echo.
pause
