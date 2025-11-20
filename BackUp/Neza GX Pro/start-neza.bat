@echo off
title Neza Browser - Launcher
color 0A
echo.
echo ================================================
echo         🎮 NEZA GX PRO BROWSER v2.2.0
echo ================================================
echo.
echo 🚀 Iniciando navegador...
cd /d "%~dp0"

REM Agregar Node.js al PATH temporalmente
set PATH=C:\Program Files\nodejs;%PATH%

REM Crear directorio de datos de usuario si no existe
if not exist "user-data" mkdir user-data

echo 🔍 Verificando Electron...
echo.

REM Verificar si Electron existe
if exist "node_modules\.bin\electron.cmd" (
    echo ✅ Electron encontrado
    echo 🌐 Abriendo navegador...
    echo.
    echo ℹ️  Si no ves la ventana, presiona Alt+Tab
    echo ℹ️  Los logs se muestran abajo
    echo.
    echo ================================================
    echo.
    
    REM Ejecutar Electron y mantener ventana abierta
    start "Neza GX Pro Browser" /B "node_modules\.bin\electron.cmd" main.js --no-sandbox --disable-web-security --enable-webview-tag --webview-tag-support
    
    echo ✅ Navegador iniciado correctamente
    echo.
    echo 💡 Presiona cualquier tecla para cerrar esta ventana
    echo    (El navegador seguirá ejecutándose)
    echo.
    pause >nul
) else (
    echo ❌ Electron no encontrado
    echo 📥 Instalando dependencias...
    echo.
    npm install electron@latest --save-dev
    echo.
    echo ✅ Instalación completada
    echo 🌐 Iniciando navegador...
    echo.
    start "Neza GX Pro Browser" /B "node_modules\.bin\electron.cmd" main.js --no-sandbox --disable-web-security --enable-webview-tag --webview-tag-support
    echo.
    echo ✅ Navegador iniciado
    echo.
    pause
)
