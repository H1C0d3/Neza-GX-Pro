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
    
    if exist "%~dp0dist\Neza-GX-Pro-Setup-2.2.0.exe" (
        echo [OK] Neza-GX-Pro-Setup-2.2.0.exe
        start explorer "%~dp0dist"
    ) else (
        echo [ADVERTENCIA] No se encontro el Setup.exe
    )
) else (
    echo ========================================
    echo   ERROR EN EL BUILD
    echo ========================================
)

echo.
pause
