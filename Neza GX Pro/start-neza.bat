@echo off
echo 🚀 Iniciando Neza Browser...
cd /d "%~dp0"
echo Verificando Electron...

REM Agregar Node.js al PATH temporalmente
set PATH=C:\Program Files\nodejs;%PATH%

REM Crear directorio de datos de usuario si no existe
if not exist "user-data" mkdir user-data

REM Verificar si Electron existe
if exist "node_modules\.bin\electron.cmd" (
    echo ✅ Electron encontrado, iniciando aplicacion...
    REM Usar flags correctos para navegación web
    "node_modules\.bin\electron.cmd" main.js --no-sandbox --disable-web-security --enable-webview-tag --webview-tag-support
) else (
    echo ❌ Electron no encontrado, instalando...
    npm install electron@latest --save-dev
    echo ✅ Instalacion completada, iniciando...
    "node_modules\.bin\electron.cmd" main.js --no-sandbox --disable-web-security --enable-webview-tag --webview-tag-support
)
pause
