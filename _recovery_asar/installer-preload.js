const { contextBridge, ipcRenderer } = require('electron');

// API segura para el instalador
contextBridge.exposeInMainWorld('installerAPI', {
    // Iniciar instalación
    startInstall: (options) => ipcRenderer.invoke('installer:start', options),
    
    // Cerrar instalador
    closeInstaller: () => ipcRenderer.invoke('installer:close'),
    
    // Iniciar navegador
    launchBrowser: () => ipcRenderer.invoke('installer:launch-browser'),
    
    // Obtener información del instalador
    getInstallerInfo: () => ipcRenderer.invoke('installer:get-info'),
    
    // Escuchar progreso de instalación
    onProgress: (callback) => {
        ipcRenderer.on('installer:progress', (event, data) => callback(data));
    },
    
    // Escuchar errores
    onError: (callback) => {
        ipcRenderer.on('installer:error', (event, error) => callback(error));
    }
});

console.log('🔌 Installer Preload API cargada');
