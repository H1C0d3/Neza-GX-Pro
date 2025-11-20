const { contextBridge, ipcRenderer } = require('electron');

// ====================================================================
// PRELOAD SCRIPT SEGURO - Neza Browser v2.1.0
// Este script usa contextBridge para exponer APIs de forma segura
// sin comprometer la seguridad del navegador
// ====================================================================

// API segura para el renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Ventana de bienvenida
    closeWelcome: () => ipcRenderer.invoke('close-welcome'),
    
    // Sistema de actualizaciones
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: (url, fileName) => ipcRenderer.invoke('download-update-file', url, fileName),
    installUpdate: (installerPath) => ipcRenderer.invoke('install-update-file', installerPath),
    restartApp: () => ipcRenderer.invoke('restart-app'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // Eventos de actualización
    onUpdateChecking: (callback) => ipcRenderer.on('update-checking', callback),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
    onUpdateAvailableNotification: (callback) => ipcRenderer.on('update-available-notification', callback),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', callback),
    onUpdateError: (callback) => ipcRenderer.on('update-error', callback),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
    onUpdateDownloading: (callback) => ipcRenderer.on('update-downloading', callback),
    
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
    
    // Ventanas
    createNewWindow: () => ipcRenderer.send('create-new-window'),
    createStealthWindow: (options) => ipcRenderer.send('create-stealth-window', options),
    
    // Controles de ventana
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
    closeWindow: () => ipcRenderer.invoke('window-close'),
    
    // Configuración
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    
    // Utilidades
    showNotification: (title, body) => {
        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: './resourse/Nexa_Icono_PNG.png' });
        }
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