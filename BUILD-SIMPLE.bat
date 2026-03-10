
@echo off
REM =======================================
REM VERIFICAR PRIVILEGIOS DE ADMINISTRADOR
REM =======================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ========================================
    echo   REQUIERE PRIVILEGIOS DE ADMINISTRADOR
    echo ========================================
    echo.
    echo Este script necesita ejecutarse como Administrador
    echo para evitar errores de permisos con enlaces simbolicos.
    echo.
    echo SOLUCION:
    echo 1. Cierra esta ventana
    echo 2. Clic derecho en BUILD-SIMPLE.bat
    echo 3. Selecciona "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

echo ========================================
echo   BUILD INSTALADOR NEZA GX PRO
echo   (Version Simplificada - ADMIN MODE)
echo ========================================
echo.
echo ADVERTENCIA: Este script cerrara VS Code.
echo Presiona Ctrl+C para cancelar o...
pause
echo.

REM Cerrar VS Code y procesos
echo Cerrando procesos...
taskkill /F /IM Code.exe /T 2>nul
taskkill /F /IM electron.exe /T 2>nul
taskkill /F /IM node.exe /T 2>nul
taskkill /F /IM MsMpEng.exe /T 2>nul
timeout /t 3 /nobreak >nul

REM Cambiar al directorio principal
cd /d "%~dp0"

REM Copiar package-build.json sobre package.json
echo Preparando configuracion...
copy /Y package-build.json package.json >nul


REM Detectar version objetivo desde package.json
for /f "usebackq tokens=*" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content -Raw 'package.json' | ConvertFrom-Json).version"`) do set APP_VERSION=%%V
echo ===============================
echo   VERSION DE RELEASE: %APP_VERSION%
echo ===============================
if not "%APP_VERSION%"=="3.0.0" (
    echo ERROR: La version en package.json no es 3.0.0
    echo Cancela el build o actualiza package.json antes de publicar el release 3.0.0
    pause
    exit /b 1
)

REM Instalar electron-builder si no existe
if not exist "node_modules\electron-builder" (
    echo Instalando electron-builder...
    call npm install --save-dev electron@^28.0.0 electron-builder@^24.9.1
)

REM Eliminar carpetas antiguas de forma agresiva
echo Limpiando carpetas antiguas...
if exist "dist" (
    echo Desbloqueando archivos en dist...
    attrib -r -s -h "dist\*.*" /s /d 2>nul
    rd /s /q dist 2>nul
    
    REM Si aun existe, usar PowerShell para forzar eliminacion
    if exist "dist" (
        powershell -Command "Get-ChildItem -Path 'dist' -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue" 2>nul
        rd /s /q dist 2>nul
    )
)
timeout /t 2 /nobreak >nul

REM Limpiar cache
echo Limpiando cache...
rd /s /q "%LOCALAPPDATA%\electron-builder" 2>nul

REM Configurar variables
SET CSC_IDENTITY_AUTO_DISCOVERY=false
SET WIN_CSC_LINK=
SET WIN_CSC_KEY_PASSWORD=
SET DEBUG=electron-builder

echo.
echo ========================================
echo   Iniciando BUILD
echo   Esto tomara 5-8 minutos...
echo ========================================
echo.

REM Ejecutar build
call npx electron-builder --win

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================
    echo   BUILD EXITOSO!
    echo ========================================
    echo.
    echo Instalador creado en:
    echo %~dp0dist\
    echo.
    
        REM Detectar version desde package.json y verificar instalador dinámicamente
        for /f "usebackq tokens=*" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content -Raw 'package.json' | ConvertFrom-Json).version"`) do set APP_VERSION=%%V
        set INSTALLER_NAME=Neza-GX-Pro-Setup-%APP_VERSION%.exe

        if exist "%~dp0dist\%INSTALLER_NAME%" (
            echo [OK] %INSTALLER_NAME%
            start explorer "%~dp0dist"
        ) else (
            echo [ADVERTENCIA] No se encontro el Setup.exe esperado: %INSTALLER_NAME%
            echo Archivos en dist:
            dir /b "%~dp0dist" | findstr /i "Setup"
        )
) else (
    echo ========================================
    echo   ERROR EN EL BUILD
    echo ========================================
)

echo.
pause
