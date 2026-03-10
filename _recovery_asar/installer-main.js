const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn, execFile } = require('child_process');
const os = require('os');
const https = require('https');
const { promisify } = require('util');

const execAsync = promisify(exec);

let installerWindow;

// Configuración del instalador
const INSTALLER_CONFIG = {
    appName: 'Neza GX Pro',
    version: '2.1.0',
    publisher: 'Hi Code Studio Tech & GEISA',
    installPath: path.join(os.homedir(), 'AppData', 'Local', 'Neza GX Pro'),
    shortcutDesktop: true,
    shortcutStartMenu: true,
    registerProtocol: true,
    // Ruta a los archivos del navegador empaquetados
    appSourcePath: process.resourcesPath ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..'),
    electronVersion: '28.0.0'
};

function createInstallerWindow() {
    installerWindow = new BrowserWindow({
        width: 800,
        height: 700,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        center: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'installer-preload.js')
        },
        icon: path.join(__dirname, '..', 'resourse', 'Neza_GX_Pro_Icono_PNG.png')
    });

    installerWindow.loadFile(path.join(__dirname, 'installer.html'));

    installerWindow.once('ready-to-show', () => {
        installerWindow.show();
        installerWindow.setOpacity(0);
        
        let opacity = 0;
        const fadeIn = setInterval(() => {
            opacity += 0.05;
            if (opacity >= 1) {
                opacity = 1;
                clearInterval(fadeIn);
            }
            installerWindow.setOpacity(opacity);
        }, 10);
    });

    installerWindow.on('closed', () => {
        installerWindow = null;
    });

    if (process.env.NODE_ENV === 'development') {
        installerWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

// IPC Handlers
ipcMain.handle('installer:start', async (event, options) => {
    try {
        const installSteps = [
            { name: 'checkRequirements', progress: 5, message: 'Verificando requisitos del sistema...' },
            { name: 'createDirectories', progress: 15, message: 'Creando directorios de instalación...' },
            { name: 'copyElectron', progress: 30, message: 'Instalando motor Electron...' },
            { name: 'copyApplication', progress: 55, message: 'Copiando archivos de la aplicación...' },
            { name: 'configureApp', progress: 70, message: 'Configurando Neza GX Pro...' },
            { name: 'createShortcuts', progress: 85, message: 'Creando accesos directos...' },
            { name: 'registerProtocol', progress: 95, message: 'Registrando protocolo neza://...' },
            { name: 'finalize', progress: 100, message: 'Finalizando instalación...' }
        ];

        for (const step of installSteps) {
            await performInstallStep(step.name);
            
            event.sender.send('installer:progress', {
                progress: step.progress,
                step: step.name,
                message: step.message
            });

            await sleep(300);
        }

        return { success: true };
    } catch (error) {
        console.error('Installation error:', error);
        return { success: false, error: error.message };
    }
});

async function performInstallStep(stepName) {
    console.log(`Ejecutando paso: ${stepName}`);
    
    switch (stepName) {
        case 'checkRequirements':
            await checkSystemRequirements();
            break;
            
        case 'createDirectories':
            await createInstallDirectory();
            break;
            
        case 'copyElectron':
            await installElectron();
            break;
            
        case 'copyApplication':
            await copyApplicationFiles();
            break;
            
        case 'configureApp':
            await configureApplication();
            break;
            
        case 'createShortcuts':
            await createShortcuts();
            break;
            
        case 'registerProtocol':
            await registerProtocolHandler();
            break;
            
        case 'finalize':
            await finalizeInstallation();
            break;
    }
}

async function checkSystemRequirements() {
    const platform = process.platform;
    const arch = process.arch;
    const totalMemory = os.totalmem();

    console.log('Sistema:', {
        platform,
        arch,
        totalMemory: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`
    });

    if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
        throw new Error('Sistema operativo no soportado');
    }

    if (totalMemory < 2 * 1024 * 1024 * 1024) {
        throw new Error('Se requiere al menos 2GB de RAM');
    }

    return true;
}

async function createInstallDirectory() {
    const installDir = INSTALLER_CONFIG.installPath;
    
    if (!fs.existsSync(installDir)) {
        fs.mkdirSync(installDir, { recursive: true });
        console.log('Directorio creado:', installDir);
    }

    const subdirs = ['resources', 'user-data', 'cache', 'logs'];
    for (const subdir of subdirs) {
        const subdirPath = path.join(installDir, subdir);
        if (!fs.existsSync(subdirPath)) {
            fs.mkdirSync(subdirPath, { recursive: true });
        }
    }

    return true;
}

async function installElectron() {
    const installDir = INSTALLER_CONFIG.installPath;
    
    // Copiar ejecutable de Electron desde el instalador
    const installerDir = path.dirname(process.execPath);
    const electronFiles = [
        'electron.exe',
        'chrome_100_percent.pak',
        'chrome_200_percent.pak',
        'icudtl.dat',
        'libEGL.dll',
        'libGLESv2.dll',
        'd3dcompiler_47.dll',
        'ffmpeg.dll',
        'resources.pak',
        'snapshot_blob.bin',
        'v8_context_snapshot.bin',
        'vk_swiftshader.dll',
        'vk_swiftshader_icd.json',
        'vulkan-1.dll'
    ];

    console.log('Copiando Electron desde:', installerDir);

    for (const file of electronFiles) {
        const srcFile = path.join(installerDir, file);
        const destFile = path.join(installDir, file);
        
        if (fs.existsSync(srcFile)) {
            await copyFile(srcFile, destFile);
        }
    }

    // Copiar carpetas de Electron
    const electronFolders = ['locales', 'resources'];
    for (const folder of electronFolders) {
        const srcFolder = path.join(installerDir, folder);
        const destFolder = path.join(installDir, folder);
        
        if (fs.existsSync(srcFolder)) {
            await copyRecursive(srcFolder, destFolder);
        }
    }

    // Renombrar electron.exe a Neza-GX-Pro.exe
    const electronExe = path.join(installDir, 'electron.exe');
    const nezaExe = path.join(installDir, 'Neza-GX-Pro.exe');
    
    if (fs.existsSync(electronExe)) {
        fs.renameSync(electronExe, nezaExe);
        console.log('Electron instalado como Neza-GX-Pro.exe');
    }

    return true;
}

async function copyApplicationFiles() {
    const installDir = INSTALLER_CONFIG.installPath;
    const appSource = INSTALLER_CONFIG.appSourcePath;
    
    console.log('Copiando aplicación desde:', appSource);
    
    // Copiar archivos principales
    const mainFiles = [
        'main.js',
        'preload.js',
        'neza-app.html',
        'package.json'
    ];

    for (const file of mainFiles) {
        const srcFile = path.join(appSource, file);
        const destFile = path.join(installDir, file);
        
        if (fs.existsSync(srcFile)) {
            await copyFile(srcFile, destFile);
        }
    }

    // Copiar carpetas completas
    const folders = ['pages', 'resourse'];
    for (const folder of folders) {
        const srcFolder = path.join(appSource, folder);
        const destFolder = path.join(installDir, folder);
        
        if (fs.existsSync(srcFolder)) {
            await copyRecursive(srcFolder, destFolder);
        }
    }

    // Crear archivo de configuración de instalación
    const config = {
        version: INSTALLER_CONFIG.version,
        installDate: new Date().toISOString(),
        installPath: installDir,
        autoUpdate: true,
        firstRun: true,
        installedBy: 'NezaInstaller'
    };

    fs.writeFileSync(
        path.join(installDir, 'install-config.json'),
        JSON.stringify(config, null, 2)
    );

    console.log('Archivos de aplicación copiados');
    return true;
}

async function configureApplication() {
    const installDir = INSTALLER_CONFIG.installPath;
    
    // Configuración de usuario por defecto
    const userConfig = {
        theme: 'dark',
        searchEngine: 'google',
        downloadPath: path.join(os.homedir(), 'Downloads'),
        enableGamingMode: true,
        enableAutoUpdate: true,
        language: 'es-ES',
        privacy: {
            clearDataOnExit: false,
            doNotTrack: true,
            blockThirdPartyCookies: false
        },
        performance: {
            hardwareAcceleration: true,
            ramLimiter: false,
            cpuLimiter: false
        }
    };

    const userDataDir = path.join(installDir, 'user-data');
    fs.writeFileSync(
        path.join(userDataDir, 'preferences.json'),
        JSON.stringify(userConfig, null, 2)
    );

    console.log('Configuración aplicada');
    return true;
}

async function createShortcuts() {
    if (process.platform !== 'win32') {
        console.log('Accesos directos solo disponibles en Windows');
        return true;
    }

    const installDir = INSTALLER_CONFIG.installPath;
    const exePath = path.join(installDir, 'Neza-GX-Pro.exe');
    const iconPath = path.join(installDir, 'resourse', 'Neza_GX_Pro_Icono_PNG.png');

    // Crear script VBS para crear acceso directo
    const createShortcutVBS = (target, shortcutPath, description, icon) => {
        return `
Set oWS = WScript.CreateObject("WScript.Shell")
Set oLink = oWS.CreateShortcut("${shortcutPath}")
oLink.TargetPath = "${target}"
oLink.Description = "${description}"
oLink.IconLocation = "${icon}"
oLink.WorkingDirectory = "${path.dirname(target)}"
oLink.Save
        `.trim();
    };

    const tempDir = os.tmpdir();

    // Acceso directo en Escritorio
    if (INSTALLER_CONFIG.shortcutDesktop) {
        const desktopPath = path.join(os.homedir(), 'Desktop', 'Neza GX Pro.lnk');
        const vbsScript = path.join(tempDir, 'create_desktop_shortcut.vbs');
        
        fs.writeFileSync(vbsScript, createShortcutVBS(
            exePath,
            desktopPath,
            'Neza GX Pro - Gaming Browser',
            exePath + ',0'
        ));

        await execAsync(`cscript //nologo "${vbsScript}"`);
        fs.unlinkSync(vbsScript);
        console.log('Acceso directo de escritorio creado');
    }

    // Acceso directo en Menú Inicio
    if (INSTALLER_CONFIG.shortcutStartMenu) {
        const startMenuPath = path.join(
            os.homedir(),
            'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs',
            'Neza GX Pro.lnk'
        );
        
        const vbsScript = path.join(tempDir, 'create_startmenu_shortcut.vbs');
        
        fs.writeFileSync(vbsScript, createShortcutVBS(
            exePath,
            startMenuPath,
            'Neza GX Pro - Gaming Browser',
            exePath + ',0'
        ));

        await execAsync(`cscript //nologo "${vbsScript}"`);
        fs.unlinkSync(vbsScript);
        console.log('Acceso directo en menú inicio creado');
    }

    return true;
}

async function registerProtocolHandler() {
    if (process.platform !== 'win32') {
        console.log('Registro de protocolo solo disponible en Windows');
        return true;
    }

    if (!INSTALLER_CONFIG.registerProtocol) {
        return true;
    }

    const installDir = INSTALLER_CONFIG.installPath;
    const exePath = path.join(installDir, 'Neza-GX-Pro.exe');

    // Crear archivo .reg para registrar el protocolo
    const regContent = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\Classes\\neza]
@="URL:Neza Protocol"
"URL Protocol"=""

[HKEY_CURRENT_USER\\Software\\Classes\\neza\\DefaultIcon]
@="${exePath.replace(/\\/g, '\\\\')},0"

[HKEY_CURRENT_USER\\Software\\Classes\\neza\\shell]

[HKEY_CURRENT_USER\\Software\\Classes\\neza\\shell\\open]

[HKEY_CURRENT_USER\\Software\\Classes\\neza\\shell\\open\\command]
@="\\"${exePath.replace(/\\/g, '\\\\')}\\" \\"%1\\""
`;

    const tempDir = os.tmpdir();
    const regFile = path.join(tempDir, 'neza-protocol.reg');
    
    fs.writeFileSync(regFile, regContent);

    try {
        await execAsync(`reg import "${regFile}"`);
        fs.unlinkSync(regFile);
        console.log('Protocolo neza:// registrado');
    } catch (error) {
        console.error('Error al registrar protocolo:', error);
    }

    return true;
}

async function finalizeInstallation() {
    const installDir = INSTALLER_CONFIG.installPath;

    // Crear uninstaller
    const uninstallerContent = `@echo off
echo Desinstalando Neza GX Pro...
taskkill /F /IM Neza-GX-Pro.exe 2>nul
timeout /t 2 /nobreak >nul
rmdir /S /Q "${installDir}"
reg delete "HKEY_CURRENT_USER\\Software\\Classes\\neza" /f 2>nul
del "%USERPROFILE%\\Desktop\\Neza GX Pro.lnk" 2>nul
del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Neza GX Pro.lnk" 2>nul
echo Desinstalacion completada.
pause
del "%~f0"
`;

    fs.writeFileSync(
        path.join(installDir, 'uninstall.bat'),
        uninstallerContent
    );

    // Registrar en Programas y características de Windows
    if (process.platform === 'win32') {
        const regUninstall = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NezaGXPro]
"DisplayName"="Neza GX Pro"
"DisplayVersion"="${INSTALLER_CONFIG.version}"
"Publisher"="${INSTALLER_CONFIG.publisher}"
"InstallLocation"="${installDir.replace(/\\/g, '\\\\')}"
"DisplayIcon"="${path.join(installDir, 'Neza-GX-Pro.exe').replace(/\\/g, '\\\\')},0"
"UninstallString"="${path.join(installDir, 'uninstall.bat').replace(/\\/g, '\\\\')}"
"NoModify"=dword:00000001
"NoRepair"=dword:00000001
`;

        const tempDir = os.tmpdir();
        const regFile = path.join(tempDir, 'neza-uninstall.reg');
        
        fs.writeFileSync(regFile, regUninstall);

        try {
            await execAsync(`reg import "${regFile}"`);
            fs.unlinkSync(regFile);
            console.log('Registrado en Programas y características');
        } catch (error) {
            console.error('Error al registrar desinstalador:', error);
        }
    }

    console.log('Instalación finalizada exitosamente');
    return true;
}

// Funciones auxiliares
async function copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        
        const files = fs.readdirSync(src);
        for (const file of files) {
            const srcPath = path.join(src, file);
            const destPath = path.join(dest, file);
            await copyRecursive(srcPath, destPath);
        }
    } else {
        await copyFile(src, dest);
    }
}

async function copyFile(src, dest) {
    return new Promise((resolve, reject) => {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        const readStream = fs.createReadStream(src);
        const writeStream = fs.createWriteStream(dest);
        
        readStream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        
        readStream.pipe(writeStream);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// IPC Handlers adicionales
ipcMain.on('installer:close', () => {
    app.quit();
});

ipcMain.on('installer:launch', () => {
    const installDir = INSTALLER_CONFIG.installPath;
    const exePath = path.join(installDir, 'Neza-GX-Pro.exe');
    
    if (fs.existsSync(exePath)) {
        spawn(exePath, [], {
            detached: true,
            stdio: 'ignore'
        }).unref();
        
        setTimeout(() => {
            app.quit();
        }, 1000);
    }
});

// Inicialización de la app
app.whenReady().then(createInstallerWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createInstallerWindow();
    }
});

console.log('Neza GX Pro Installer v' + INSTALLER_CONFIG.version);
console.log('Directorio de instalación:', INSTALLER_CONFIG.installPath);
