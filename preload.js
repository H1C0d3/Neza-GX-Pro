const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Forzar zoom neutro en renderer principal para evitar escalados inesperados
try {
    webFrame.setZoomFactor(1);
    webFrame.setZoomLevel(0);
    webFrame.setVisualZoomLevelLimits(1, 1);
} catch (err) {
    console.warn('Zoom clamp failed in preload', err);
}

// ====================================================================
// PRELOAD SCRIPT SEGURO - Neza GX Pro v2.1.0
// Este script usa contextBridge para exponer APIs de forma segura
// sin comprometer la seguridad del navegador
// ====================================================================

// API segura para el renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Sistema de actualizaciones
    downloadUpdate: (url, fileName) => ipcRenderer.invoke('download-update-file', url, fileName),
    installUpdate: (installerPath) => ipcRenderer.invoke('install-update-file', installerPath),
    restartApp: () => ipcRenderer.invoke('restart-app'),
    captureWindow: () => ipcRenderer.invoke('capture-window'),

    // Tabs / ventanas
    tearOutTab: (payload) => ipcRenderer.invoke('tabs:tear-out', payload),
    moveTabToMain: (payload) => ipcRenderer.invoke('tabs:move-to-main', payload),
    
    // Eventos de actualización
    onUpdateChecking: (callback) => ipcRenderer.on('update-checking', callback),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
    onUpdateAvailableNotification: (callback) => ipcRenderer.on('update-available-notification', callback),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', callback),
    onUpdateError: (callback) => ipcRenderer.on('update-error', callback),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
    onUpdateDownloading: (callback) => ipcRenderer.on('update-downloading', callback),
    
    // Listener genérico para eventos IPC (incluye popup-attempt)
    on: (channel, callback) => {
        const allowedChannels = [
            'save-session-before-close',
            'update-checking',
            'update-available',
            'update-not-available',
            'update-error',
            'update-progress',
            'update-downloaded',
            'update-downloading',
            'update-available-notification',
            'open-url-in-new-tab',
            'history:state-changed',
            'download-started',
            'download-progress',
            'download-completed',
            'download-cancelled',
            'download-failed',
            'popup-attempt',
            'music-pip-command',
            'music-pip:update',
            'gx:metrics',
            'gx:limit-hit',
            'gx:tab-limit-hit',
            'blocker:update'
        ];
        if (allowedChannels.includes(channel)) {
            ipcRenderer.on(channel, callback);
        } else {
            console.warn('⚠️ Canal IPC no permitido:', channel);
        }
    },

    // Casting del sistema
    cast: {
        openSystem: () => ipcRenderer.invoke('cast:open-system'),
        discover: () => ipcRenderer.invoke('cast:discover'),
        sendYoutube: (payload) => ipcRenderer.invoke('cast:send-youtube', payload)
    },
    musicPip: {
        show: (payload) => ipcRenderer.invoke('music-pip:show', payload),
        hide: () => ipcRenderer.invoke('music-pip:hide'),
        sendCommand: (cmd) => ipcRenderer.send('music-pip:command', cmd)
    },
    
    // Abrir URLs en pestañas (para enlaces externos)
    onOpenUrlInNewTab: (callback) => ipcRenderer.on('open-url-in-new-tab', callback),
    
    // Navegación (con validación)
    openExternal: (url) => {
        // Validar que sea una URL válida antes de enviar
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
                return ipcRenderer.invoke('open-external', url);
            }
            console.warn('URL no permitida:', url);
            return Promise.reject('URL no permitida');
        } catch (e) {
            console.error('URL inválida:', url);
            return Promise.reject('URL inválida');
        }
    },
    openCompatWindow: (url) => {
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
                return ipcRenderer.invoke('open-compat-window', url);
            }
            return Promise.reject('URL no permitida');
        } catch (_) {
            return Promise.reject('URL inválida');
        }
    },
    tlsDiagnose: (url) => {
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
                return ipcRenderer.invoke('tls:diagnose', url);
            }
            return Promise.reject('URL no permitida');
        } catch (_) {
            return Promise.reject('URL inválida');
        }
    },
    
    // Sistema de Historial Avanzado
    history: {
        // Registrar entrada de historial
        addEntry: (tabId, entry) => ipcRenderer.invoke('history:add-entry', tabId, entry),
        
        // Obtener stack de historial
        getStack: (tabId, direction) => ipcRenderer.invoke('history:get-stack', tabId, direction),
        
        // Navegar a índice específico
        navigateToIndex: (tabId, direction, index) => ipcRenderer.invoke('history:navigate-to-index', tabId, direction, index),
        
        // Obtener estado de navegación
        getState: (tabId) => ipcRenderer.invoke('history:get-state', tabId),
        
        // Limpiar historial de una pestaña
        clearTab: (tabId) => ipcRenderer.invoke('history:clear-tab', tabId),
        
        // Event listeners
        onStateChanged: (callback) => ipcRenderer.on('history:state-changed', (event, state) => callback(state)),
        removeAllListeners: () => ipcRenderer.removeAllListeners('history:state-changed')
    },
    
    // Ventanas
    createNewWindow: (options) => ipcRenderer.send('create-new-window', options || {}),
    createStealthWindow: (options) => ipcRenderer.send('create-stealth-window', options),
    
    // Controles de ventana
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
    closeWindow: () => ipcRenderer.invoke('window-close'),
    
    // Configuración
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),

    // Bloqueador integrado
    blocker: {
        getState: (host) => ipcRenderer.invoke('blocker:get-state', host || ''),
        setGlobal: (enabled) => ipcRenderer.invoke('blocker:set-global', !!enabled),
        setSite: (host, enabled) => ipcRenderer.invoke('blocker:set-site', { host, enabled }),
        resetStats: (host) => ipcRenderer.invoke('blocker:reset-stats', host || null),
        onUpdate: (callback) => ipcRenderer.on('blocker:update', (event, data) => callback(data))
    },
    
    // Utilidades
    showNotification: (title, body) => {
        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: './resourse/Nexa_Icono_PNG.png' });
        }
    },
    
    // Diálogos de archivos
    openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
    saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
    
    // ===== SISTEMA DE DESCARGAS COMPLETO (ESTILO OPERA) =====
    downloads: {
        // Obtener descargas activas
        getActive: () => ipcRenderer.invoke('downloads:get-active'),
        
        // Obtener historial
        getHistory: () => ipcRenderer.invoke('downloads:get-history'),
        
        // Control de descargas
        pause: (downloadId) => ipcRenderer.invoke('downloads:pause', downloadId),
        resume: (downloadId) => ipcRenderer.invoke('downloads:resume', downloadId),
        cancel: (downloadId) => ipcRenderer.invoke('downloads:cancel', downloadId),
        
        // Gestión de archivos
        openFile: (downloadId) => ipcRenderer.invoke('downloads:open-file', downloadId),
        showInFolder: (downloadId) => ipcRenderer.invoke('downloads:show-in-folder', downloadId),
        
        // Gestión de historial
        clearHistory: () => ipcRenderer.invoke('downloads:clear-history'),
        removeFromHistory: (downloadId) => ipcRenderer.invoke('downloads:remove-from-history', downloadId),
        
        // Carpetas
        openFolder: () => ipcRenderer.invoke('downloads:open-folder'),
        selectFolder: () => ipcRenderer.invoke('downloads:select-folder'),
        getPath: () => ipcRenderer.invoke('downloads:get-path'),

        // Guardar una URL con diálogo "Guardar como..."
        saveUrlAs: (url, options) => ipcRenderer.invoke('downloads:save-url-as', { url, ...options }),
        
        // Eventos en tiempo real
        onStarted: (callback) => {
            ipcRenderer.on('download-started', (event, data) => callback(data));
        },
        onProgress: (callback) => {
            ipcRenderer.on('download-progress', (event, data) => callback(data));
        },
        onCompleted: (callback) => {
            ipcRenderer.on('download-completed', (event, data) => callback(data));
        },
        onCancelled: (callback) => {
            ipcRenderer.on('download-cancelled', (event, data) => callback(data));
        },
        onError: (callback) => {
            ipcRenderer.on('download-error', (event, data) => callback(data));
        },
        
        // Remover listeners
        removeAllListeners: () => {
            ipcRenderer.removeAllListeners('download-started');
            ipcRenderer.removeAllListeners('download-progress');
            ipcRenderer.removeAllListeners('download-completed');
            ipcRenderer.removeAllListeners('download-cancelled');
            ipcRenderer.removeAllListeners('download-error');
        }
    },

    clipboard: {
        writeText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
        readText: () => ipcRenderer.invoke('clipboard:read-text'),
        writeImageDataUrl: (dataUrl) => ipcRenderer.invoke('clipboard:write-image-data-url', dataUrl)
    }
});

// GX Control IPC seguro
contextBridge.exposeInMainWorld('gxControl', {
    setThresholds: (payload) => ipcRenderer.invoke('gx:set-thresholds', payload),
    setTabLimits: (payload) => ipcRenderer.invoke('gx:set-tab-limits', payload),
    registerTab: (payload) => ipcRenderer.invoke('gx:register-tab', payload),
    unregisterTab: (payload) => ipcRenderer.invoke('gx:unregister-tab', payload),
    onMetrics: (callback) => ipcRenderer.on('gx:metrics', (_event, data) => callback(data)),
    onLimitHit: (callback) => ipcRenderer.on('gx:limit-hit', (_event, data) => callback(data)),
    onTabLimitHit: (callback) => ipcRenderer.on('gx:tab-limit-hit', (_event, data) => callback(data)),
    removeAll: () => {
        ipcRenderer.removeAllListeners('gx:metrics');
        ipcRenderer.removeAllListeners('gx:limit-hit');
        ipcRenderer.removeAllListeners('gx:tab-limit-hit');
    }
});
// API para configuraciones
contextBridge.exposeInMainWorld('nexaConfig', {
    get: (key) => localStorage.getItem(`nexa_${key}`),
    set: (key, value) => localStorage.setItem(`nexa_${key}`, value),
    remove: (key) => localStorage.removeItem(`nexa_${key}`),
    clear: () => {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('nexa_')) {
                localStorage.removeItem(key);
            }
        });
    }
});

console.log('🔌 Nexa Preload API cargada correctamente');