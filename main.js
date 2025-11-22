const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');

// Configuraciones SEGURAS para navegación web
// Solo flags necesarios y seguros para webview
app.commandLine.appendSwitch('--enable-features', 'OverlayScrollbar');
app.commandLine.appendSwitch('--webview-tag-support');
app.commandLine.appendSwitch('--enable-webview-tag');
// Hardware acceleration optimizations
app.commandLine.appendSwitch('--enable-gpu-rasterization');
app.commandLine.appendSwitch('--enable-zero-copy');

// Configurar logging
log.transports.file.level = 'info';
log.info('Iniciando Nexa Browser...');

// Variables globales
let mainWindow;
let welcomeWindow = null;
let updateAvailable = false;
const CURRENT_VERSION = '2.2.2';
const isDev = !app.isPackaged;

function createWindow() {
    // Verificar si es la primera vez o nueva versión
    const shouldShowWelcome = checkIfShouldShowWelcome();
    
    if (shouldShowWelcome) {
        createWelcomeWindow();
        return;
    }
    
    // Crear ventana principal usando función unificada
    createMainWindow();
}

function checkIfShouldShowWelcome() {
    try {
        const configPath = path.join(app.getPath('userData'), 'nexa-config.json');
        
        if (!fs.existsSync(configPath)) {
            // Primera instalación
            return true;
        }
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const lastSeenVersion = config.lastSeenVersion || '0.0.0';
        
        // Mostrar bienvenida si es nueva versión
        return lastSeenVersion !== CURRENT_VERSION;
    } catch (error) {
        log.error('Error checking welcome status:', error);
        return true; // Mostrar por defecto si hay error
    }
}

function createWelcomeWindow() {
    welcomeWindow = new BrowserWindow({
        width: 1100,
        height: 700,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        backgroundColor: '#0f0f3d',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'resourse', 'Nexa_Icono_PNG.png'),
        show: false
    });

    welcomeWindow.loadFile(path.join('pages', 'welcome.html'));

    welcomeWindow.once('ready-to-show', () => {
        welcomeWindow.show();
        welcomeWindow.center();
    });

    welcomeWindow.on('closed', () => {
        welcomeWindow = null;
        // Crear ventana principal después de cerrar bienvenida
        createMainWindow();
    });
}

function createMainWindow() {
    // Guardar que ya vio la bienvenida de esta versión
    saveVersionSeen();
    
    // Cargar estado guardado de la ventana
    const windowState = loadWindowState();
    
    mainWindow = new BrowserWindow({
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#1a1a1a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            sandbox: true,
            webviewTag: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'resourse', 'Nexa_Icono_PNG.png'),
        show: false
    });
    
    // Maximizar si estaba maximizado
    if (windowState.isMaximized) {
        mainWindow.maximize();
    }
    
    // Guardar estado cuando cambie el tamaño o posición
    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);
    mainWindow.on('maximize', saveWindowState);
    mainWindow.on('unmaximize', saveWindowState);

    // Cargar navegador con página de inicio personalizada
    // Usar URL en lugar de path para evitar problemas con espacios en Windows
    const { pathToFileURL } = require('url');
    const htmlPath = path.join(__dirname, 'neza-app.html');
    const htmlURL = pathToFileURL(htmlPath).href;
    
    log.info('📂 Cargando neza-app.html desde:', htmlPath);
    log.info('🔗 URL:', htmlURL);
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        log.error('❌ Error al cargar:', errorCode, errorDescription);
        log.error('📍 URL que falló:', validatedURL);
    });
    
    mainWindow.webContents.on('did-finish-load', () => {
        log.info('✅ neza-app.html cargado completamente');
    });
    
    // Usar loadURL en lugar de loadFile para mejor manejo de rutas con espacios
    mainWindow.loadURL(htmlURL).catch(err => {
        log.error('❌ Error en loadURL:', err);
    });

    mainWindow.once('ready-to-show', () => {
        log.info('👁️ Ventana lista para mostrar');
        mainWindow.show();
        mainWindow.focus();
        log.info('✅ Ventana mostrada y enfocada');
        
        // Buscar actualizaciones después de mostrar
        setTimeout(() => {
            checkForUpdates();
        }, 2000);
    });
    
    // Forzar mostrar después de 3 segundos si no se dispara ready-to-show
    setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            log.warn('⚠️ Ventana no visible, forzando mostrar...');
            mainWindow.show();
            mainWindow.focus();
        }
    }, 3000);

    mainWindow.on('closed', () => {
        saveWindowState();
        mainWindow = null;
    });
    
    // Log de errores del renderer
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        if (level === 3) { // Error
            log.error(`[Renderer Error] ${message} (${sourceId}:${line})`);
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // En lugar de abrir ventanas nuevas, enviar la URL al webview para abrir en pestaña
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('open-url-in-new-tab', url);
        }
        return { action: 'deny' };
    });

    // Registrar atajo de teclado para DevTools (Ctrl+Shift+F12)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    // Solo abrir DevTools automáticamente en modo desarrollo
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

function loadWindowState() {
    try {
        const statePath = path.join(app.getPath('userData'), 'window-state.json');
        if (fs.existsSync(statePath)) {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            log.info('📋 Estado de ventana cargado:', state);
            return state;
        }
    } catch (error) {
        log.error('❌ Error cargando estado de ventana:', error);
    }
    
    // Estado por defecto
    return {
        width: 1200,
        height: 800,
        x: undefined,
        y: undefined,
        isMaximized: false
    };
}

function saveWindowState() {
    try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        
        const bounds = mainWindow.getBounds();
        const state = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            isMaximized: mainWindow.isMaximized()
        };
        
        const statePath = path.join(app.getPath('userData'), 'window-state.json');
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        log.info('💾 Estado de ventana guardado');
    } catch (error) {
        // Ignorar errores de objeto destruido
        if (!error.message.includes('destroyed')) {
            log.error('❌ Error guardando estado de ventana:', error);
        }
    }
}

function saveVersionSeen() {
    try {
        const configPath = path.join(app.getPath('userData'), 'nexa-config.json');
        const config = {
            lastSeenVersion: CURRENT_VERSION,
            autoUpdate: true,
            theme: 'dark',
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        log.info(`✅ Version ${CURRENT_VERSION} marked as seen`);
    } catch (error) {
        log.error('Error saving version:', error);
    }
}

function checkAndUpdateVersion() {
    try {
        const configPath = path.join(app.getPath('userData'), 'nexa-config.json');
        
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const savedVersion = config.lastSeenVersion || '0.0.0';
            
            if (savedVersion !== CURRENT_VERSION) {
                log.info(`🔄 Versión actualizada detectada: ${savedVersion} → ${CURRENT_VERSION}`);
                saveVersionSeen();
            } else {
                log.info(`✅ Ya tienes la última versión: ${CURRENT_VERSION}`);
            }
        } else {
            log.info(`📝 Primera ejecución, guardando versión ${CURRENT_VERSION}`);
            saveVersionSeen();
        }
    } catch (error) {
        log.error('❌ Error verificando versión:', error);
        // Si hay error, guardar la versión actual de todos modos
        saveVersionSeen();
    }
}

// Configuración del Auto-Updater
function setupAutoUpdater() {
    // Log detallado de configuración
    log.info('⚙️ Configurando Auto-Updater...');
    log.info('📦 Versión actual:', CURRENT_VERSION);
    log.info('🏭 Entorno:', process.env.NODE_ENV || 'production');
    log.info('🔒 isDev:', isDev);
    
    // Configurar servidor de actualizaciones con opciones explícitas
    try {
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'H1C0d3',
            repo: 'Neza-GX-Pro',
            private: false,
            releaseType: 'release' // Solo releases públicas, no pre-releases
        });
        log.info('✅ Feed URL configurado correctamente');
        log.info('🔗 Repositorio: https://github.com/H1C0d3/Neza-GX-Pro');
    } catch (error) {
        log.error('❌ Error al configurar Feed URL:', error);
    }

    // Configurar logger del auto-updater
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false; // Descargar solo cuando el usuario lo pida
    autoUpdater.autoInstallOnAppQuit = true;

    // Eventos del auto-updater
    autoUpdater.on('checking-for-update', () => {
        log.info('🔍 Buscando actualizaciones en GitHub...');
        log.info('🔗 Verificando: https://api.github.com/repos/H1C0d3/Neza-GX-Pro/releases/latest');
        sendToRenderer('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('✅ Actualización disponible:', info.version);
        updateAvailable = true;
        sendToRenderer('update-available', {
            version: info.version,
            releaseNotes: info.releaseNotes
        });
        
        // Mostrar notificación al usuario
        showUpdateNotification(info);
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('ℹ️ No hay actualizaciones disponibles');
        log.info('📊 Info:', JSON.stringify(info));
        log.info('✅ Estás usando la última versión:', CURRENT_VERSION);
        sendToRenderer('update-not-available');
    });

    autoUpdater.on('error', (err) => {
        log.error('❌ Error en auto-updater:', err);
        log.error('📋 Detalles del error:', err.message);
        log.error('🔍 Stack:', err.stack);
        
        // Enviar error detallado al renderer
        sendToRenderer('update-error', {
            message: err.message,
            code: err.code || 'UNKNOWN',
            details: err.toString()
        });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        log.info(`📥 Progreso: ${Math.round(progressObj.percent)}%`);
        sendToRenderer('update-progress', {
            percent: Math.round(progressObj.percent),
            transferred: progressObj.transferred,
            total: progressObj.total
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('✅ Actualización descargada, lista para instalar');
        sendToRenderer('update-downloaded', info);
        
        // Mostrar diálogo para instalar
        showInstallDialog(info);
    });
}

function checkForUpdates() {
    log.info('🔄 Iniciando verificación de actualizaciones...');
    log.info('📦 Versión instalada:', app.getVersion());
    log.info('🌐 Verificando GitHub Releases...');
    
    // SIEMPRE verificar actualizaciones en producción empaquetada
    if (app.isPackaged) {
        log.info('📦 Aplicación empaquetada detectada - Verificando actualizaciones');
        try {
            autoUpdater.checkForUpdates()
                .then((result) => {
                    log.info('✅ Verificación completada:', JSON.stringify(result));
                })
                .catch((error) => {
                    log.error('❌ Error al verificar actualizaciones:', error);
                });
        } catch (error) {
            log.error('❌ Excepción al verificar actualizaciones:', error);
        }
    } else {
        log.info('🚧 Modo desarrollo: Auto-updater deshabilitado');
        log.info('💡 Para probar actualizaciones, compila el instalador con BUILD-SIMPLE.bat');
        setTimeout(() => {
            sendToRenderer('update-not-available');
        }, 1000);
    }
}

function showUpdateNotification(info) {
    // Mostrar notificación en pantalla primero (no bloqueante)
    sendToRenderer('update-available-notification', {
        version: info.version,
        releaseNotes: info.releaseNotes
    });
    
    // Esperar 3 segundos para que el usuario vea la notificación
    setTimeout(() => {
        const response = dialog.showMessageBoxSync(mainWindow, {
            type: 'info',
            title: '🎉 Actualización Disponible - Neza GX Pro',
            message: `Nueva versión ${info.version} disponible`,
            detail: `Versión actual: ${CURRENT_VERSION}\nNueva versión: ${info.version}\n\n¿Deseas descargar e instalar la actualización ahora?\n\nLa descarga se realizará en segundo plano.`,
            buttons: ['✅ Descargar Ahora', '⏰ Recordarme Luego', '📄 Ver Cambios'],
            defaultId: 0,
            cancelId: 1,
            noLink: true
        });

        if (response === 0) {
            // Descargar ahora
            autoUpdater.downloadUpdate();
            sendToRenderer('update-downloading');
        } else if (response === 2) {
            // Ver cambios (abrir GitHub releases)
            shell.openExternal('https://github.com/H1C0d3/Neza-GX-Pro/releases');
        }
    }, 3000);
}

function showInstallDialog(info) {
    const response = dialog.showMessageBoxSync(mainWindow, {
        type: 'info',
        title: 'Actualización Lista',
        message: `Nexa Browser ${info.version} se ha descargado`,
        detail: 'La actualización se instalará cuando reinicies la aplicación.',
        buttons: ['Reiniciar Ahora', 'Reiniciar Después'],
        defaultId: 0,
        cancelId: 1
    });

    if (response === 0) {
        // isSilent=false, isForceRunAfter=true (ejecuta después de instalar)
        setImmediate(() => autoUpdater.quitAndInstall(false, true));
    }
}

function sendToRenderer(channel, data = null) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(channel, data);
    }
}

// IPC Handlers
ipcMain.handle('check-for-updates', async () => {
    log.info('🔍 Verificación manual de actualizaciones solicitada');
    checkForUpdates();
    return { checking: true };
});

ipcMain.handle('download-update', async () => {
    if (updateAvailable) {
        autoUpdater.downloadUpdate();
        return { downloading: true };
    }
    return { error: 'No hay actualizaciones disponibles' };
});

ipcMain.handle('install-update', async () => {
    // isSilent=false, isForceRunAfter=true (ejecuta después de instalar)
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { installing: true };
});

ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
});

ipcMain.handle('open-external', async (event, url) => {
    shell.openExternal(url);
});

// ============ IPC PARA ACTUALIZACIONES MANUALES GITHUB ============
const https = require('https');
const { exec } = require('child_process');

ipcMain.handle('download-update-file', async (event, downloadUrl, fileName) => {
    return new Promise((resolve, reject) => {
        const downloadsPath = path.join(app.getPath('downloads'), fileName);
        const file = fs.createWriteStream(downloadsPath);
        
        log.info('📥 Descargando actualización:', downloadUrl);
        
        https.get(downloadUrl, (response) => {
            // Seguir redirecciones
            if (response.statusCode === 302 || response.statusCode === 301) {
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    
                    file.on('finish', () => {
                        file.close();
                        log.info('✅ Descarga completada:', downloadsPath);
                        resolve(downloadsPath);
                    });
                }).on('error', (err) => {
                    fs.unlink(downloadsPath, () => {});
                    reject(err);
                });
            } else {
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    log.info('✅ Descarga completada:', downloadsPath);
                    resolve(downloadsPath);
                });
            }
        }).on('error', (err) => {
            fs.unlink(downloadsPath, () => {});
            log.error('❌ Error en descarga:', err);
            reject(err);
        });
    });
});

ipcMain.handle('install-update-file', async (event, installerPath) => {
    return new Promise((resolve, reject) => {
        log.info('⚙️ Ejecutando instalador:', installerPath);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(installerPath)) {
            reject(new Error('Archivo de instalación no encontrado'));
            return;
        }
        
        // Ejecutar el instalador en Windows
        if (process.platform === 'win32') {
            // Ejecutar instalador silencioso
            exec(`"${installerPath}" /S`, (error) => {
                if (error) {
                    log.error('❌ Error al ejecutar instalador:', error);
                    reject(error);
                } else {
                    log.info('✅ Instalador ejecutado correctamente');
                    resolve({ success: true });
                }
            });
        } else {
            // Para otras plataformas, abrir el instalador
            shell.openPath(installerPath)
                .then(() => {
                    log.info('✅ Instalador abierto');
                    resolve({ success: true });
                })
                .catch(reject);
        }
    });
});

ipcMain.handle('restart-app', async () => {
    log.info('🔄 Reiniciando aplicación...');
    app.relaunch();
    app.exit(0);
});

// IPC para configuración
ipcMain.handle('get-config', async () => {
    try {
        const configPath = path.join(app.getPath('userData'), 'nexa-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config;
        }
        return {
            autoUpdate: true,
            theme: 'dark',
            lastSeenVersion: '0.0.0'
        };
    } catch (error) {
        log.error('Error loading config:', error);
        return { autoUpdate: true, theme: 'dark' };
    }
});

ipcMain.handle('save-config', async (event, config) => {
    try {
        const configPath = path.join(app.getPath('userData'), 'nexa-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (error) {
        log.error('Error saving config:', error);
        return { success: false, error: error.message };
    }
});

// IPC para cerrar ventana de bienvenida
ipcMain.handle('close-welcome', async () => {
    if (welcomeWindow) {
        welcomeWindow.close();
    }
});

// IPC para crear nuevas ventanas
ipcMain.on('create-new-window', () => {
    createMainWindow();
});

ipcMain.on('create-stealth-window', (event, options) => {
    createStealthWindow(options);
});

function createStealthWindow(options = {}) {
    const stealthWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0a0a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            sandbox: true,
            webviewTag: true,
            partition: `stealth-session-${Date.now()}`,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'resourse', 'Nexa_Icono_PNG.png'),
        show: false
    });

    // Cargar con parámetros stealth
    const stealthURL = `file://${path.join(__dirname, 'neza-app.html')}?stealth=${options.layer || 3}&session=new`;
    stealthWindow.loadURL(stealthURL);

    stealthWindow.once('ready-to-show', () => {
        stealthWindow.show();
    });

    // Limpiar datos al cerrar
    stealthWindow.on('closed', () => {
        if (stealthWindow.webContents.session) {
            stealthWindow.webContents.session.clearCache();
            stealthWindow.webContents.session.clearStorageData();
        }
    });
}

// Eventos de la aplicación
app.whenReady().then(() => {
    // Configurar directorio de datos del usuario
    const userDataPath = path.join(app.getPath('appData'), 'Nexa Browser');
    app.setPath('userData', userDataPath);
    
    // Verificar y actualizar versión al iniciar
    checkAndUpdateVersion();
    
    setupAutoUpdater();
    createWindow();
    
    // Verificar actualizaciones al iniciar (después de 5 segundos)
    setTimeout(() => {
        log.info('🚀 Verificando actualizaciones automáticamente...');
        checkForUpdates();
    }, 5000);
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// =============== WINDOW CONTROLS HANDLERS ===============
ipcMain.handle('window-minimize', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
});

ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.handle('window-close', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

// Diálogos de archivos
ipcMain.handle('open-file-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: options?.filters || [{ name: 'JSON', extensions: ['json'] }]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        try {
            const content = fs.readFileSync(result.filePaths[0], 'utf8');
            return { success: true, content, filePath: result.filePaths[0] };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

ipcMain.handle('save-file-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: options?.defaultPath || 'export.json',
        filters: options?.filters || [{ name: 'JSON', extensions: ['json'] }]
    });
    
    if (!result.canceled && result.filePath) {
        try {
            fs.writeFileSync(result.filePath, options?.content || '', 'utf8');
            return { success: true, filePath: result.filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

// ============================================
// SISTEMA DE HISTORIAL AVANZADO
// ============================================
class AdvancedHistoryManager {
    constructor() {
        this.historyStacks = new Map(); // tabId -> HistoryEntry[]
        this.currentPositions = new Map(); // tabId -> number
        this.maxHistorySize = 100;
        this.setupIPCHandlers();
    }

    setupIPCHandlers() {
        // Agregar entrada al historial
        ipcMain.handle('history:add-entry', (event, tabId, entry) => {
            return this.addEntry(tabId, entry);
        });

        // Obtener stack de historial
        ipcMain.handle('history:get-stack', (event, tabId, direction) => {
            return this.getStack(tabId, direction);
        });

        // Navegar a índice específico
        ipcMain.handle('history:navigate-to-index', (event, tabId, direction, index) => {
            return this.navigateToIndex(tabId, direction, index);
        });

        // Obtener estado actual
        ipcMain.handle('history:get-state', (event, tabId) => {
            return this.getState(tabId);
        });

        // Limpiar historial de pestaña
        ipcMain.handle('history:clear-tab', (event, tabId) => {
            this.historyStacks.delete(tabId);
            this.currentPositions.delete(tabId);
            return true;
        });
    }

    addEntry(tabId, entry) {
        let stack = this.historyStacks.get(tabId) || [];
        let currentPosition = this.currentPositions.get(tabId) ?? -1;

        // Si estamos en medio del stack, eliminar el historial futuro
        if (currentPosition < stack.length - 1) {
            stack = stack.slice(0, currentPosition + 1);
        }

        // Agregar nueva entrada
        const newEntry = {
            id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: entry.url,
            title: entry.title || 'Nueva página',
            favicon: entry.favicon || '',
            timestamp: Date.now()
        };

        stack.push(newEntry);
        currentPosition = stack.length - 1;

        // Limitar tamaño
        if (stack.length > this.maxHistorySize) {
            stack.shift();
            currentPosition--;
        }

        this.historyStacks.set(tabId, stack);
        this.currentPositions.set(tabId, currentPosition);

        log.info(`📚 Historial Tab ${tabId}: ${stack.length} entradas, posición ${currentPosition}`);
        
        return this.getState(tabId);
    }

    getStack(tabId, direction) {
        const stack = this.historyStacks.get(tabId) || [];
        const currentPosition = this.currentPositions.get(tabId) ?? -1;

        if (direction === 'back') {
            // Entradas anteriores (invertidas para mostrar más reciente primero)
            return stack.slice(0, currentPosition).reverse();
        } else {
            // Entradas siguientes
            return stack.slice(currentPosition + 1);
        }
    }

    navigateToIndex(tabId, direction, targetIndex) {
        const stack = this.historyStacks.get(tabId) || [];
        const currentPosition = this.currentPositions.get(tabId) ?? -1;

        let newPosition;
        if (direction === 'back') {
            newPosition = currentPosition - targetIndex - 1;
        } else {
            newPosition = currentPosition + targetIndex + 1;
        }

        // Validar posición
        if (newPosition < 0 || newPosition >= stack.length) {
            log.error(`❌ Posición inválida: ${newPosition}`);
            return { success: false, entry: null };
        }

        const targetEntry = stack[newPosition];
        this.currentPositions.set(tabId, newPosition);

        log.info(`🔄 Tab ${tabId}: Navegando a posición ${newPosition} (${targetEntry.url})`);

        return {
            success: true,
            entry: targetEntry,
            state: this.getState(tabId)
        };
    }

    getState(tabId) {
        const stack = this.historyStacks.get(tabId) || [];
        const currentPosition = this.currentPositions.get(tabId) ?? -1;

        return {
            canGoBack: currentPosition > 0,
            canGoForward: currentPosition < stack.length - 1,
            currentUrl: stack[currentPosition]?.url || '',
            currentTitle: stack[currentPosition]?.title || '',
            backEntries: this.getStack(tabId, 'back'),
            forwardEntries: this.getStack(tabId, 'forward'),
            currentPosition: currentPosition,
            totalEntries: stack.length
        };
    }
}

// Inicializar gestor de historial
const historyManager = new AdvancedHistoryManager();
log.info('✅ Sistema de historial avanzado inicializado');

// Prevenir múltiples instancias
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Alguien intentó ejecutar una segunda instancia, enfocar nuestra ventana
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

log.info('✅ Nexa Browser iniciado correctamente');