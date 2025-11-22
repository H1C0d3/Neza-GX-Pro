// ============================================================================
// NEZA BROWSER - ADVANCED FEATURES
// Sistema de Zoom, Favoritos y Navegación
// ============================================================================

// ============================================================================
// 1. SISTEMA DE ZOOM (Replicando Opera GX)
// ============================================================================

class ZoomController {
    constructor() {
        // Niveles de zoom predefinidos (25% - 500%)
        this.levels = [0.25, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0];
        this.currentLevel = 1.0;
        this.perSiteZoom = new Map(); // Zoom persistente por sitio
        
        this.init();
    }
    
    init() {
        this.loadZoomPreferences();
        this.setupKeyboardShortcuts();
        this.setupMouseWheelZoom();
        console.log('✅ ZoomController initialized');
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                if (e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    this.zoomIn();
                } else if (e.key === '-' || e.key === '_') {
                    e.preventDefault();
                    this.zoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    this.resetZoom();
                }
            }
        });
    }
    
    setupMouseWheelZoom() {
        const webviewContainer = document.getElementById('webviewContainer');
        if (webviewContainer) {
            webviewContainer.addEventListener('wheel', (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                        this.zoomIn();
                    } else {
                        this.zoomOut();
                    }
                }
            }, { passive: false });
        }
    }
    
    zoomIn() {
        const currentIndex = this.levels.indexOf(this.currentLevel);
        if (currentIndex < this.levels.length - 1) {
            this.applyZoom(this.levels[currentIndex + 1]);
            this.showZoomNotification();
        }
    }
    
    zoomOut() {
        const currentIndex = this.levels.indexOf(this.currentLevel);
        if (currentIndex > 0) {
            this.applyZoom(this.levels[currentIndex - 1]);
            this.showZoomNotification();
        }
    }
    
    resetZoom() {
        this.applyZoom(1.0);
        this.showZoomNotification('Zoom restablecido');
    }
    
    applyZoom(level) {
        this.currentLevel = level;
        
        // Aplicar zoom al webview activo
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
            try {
                activeWebview.setZoomLevel(this.convertToZoomLevel(level));
            } catch (error) {
                console.error('Error applying zoom to webview:', error);
            }
        }
        
        // Guardar preferencia por sitio
        const currentUrl = this.getCurrentSiteUrl();
        if (currentUrl) {
            this.perSiteZoom.set(currentUrl, level);
            this.saveZoomPreferences();
        }
        
        console.log(`Zoom applied: ${(level * 100).toFixed(0)}%`);
    }
    
    convertToZoomLevel(scale) {
        // Convertir escala a nivel de zoom de Chromium
        // zoomLevel = log(scale) / log(1.2)
        return Math.log(scale) / Math.log(1.2);
    }
    
    getCurrentSiteUrl() {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
            try {
                const url = new URL(activeWebview.src);
                return url.hostname;
            } catch (e) {
                return null;
            }
        }
        return null;
    }
    
    loadZoomPreferences() {
        try {
            const saved = localStorage.getItem('neza_zoom_preferences');
            if (saved) {
                const data = JSON.parse(saved);
                this.perSiteZoom = new Map(Object.entries(data));
            }
        } catch (error) {
            console.error('Error loading zoom preferences:', error);
        }
    }
    
    saveZoomPreferences() {
        try {
            const data = Object.fromEntries(this.perSiteZoom);
            localStorage.setItem('neza_zoom_preferences', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving zoom preferences:', error);
        }
    }
    
    restoreSiteZoom(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            
            if (this.perSiteZoom.has(hostname)) {
                const savedZoom = this.perSiteZoom.get(hostname);
                this.applyZoom(savedZoom);
            } else {
                this.resetZoom();
            }
        } catch (error) {
            console.error('Error restoring site zoom:', error);
        }
    }
    
    showZoomNotification(customMessage = null) {
        const percentage = (this.currentLevel * 100).toFixed(0);
        const message = customMessage || `Zoom: ${percentage}%`;
        
        // Crear notificación temporal
        let notification = document.getElementById('zoom-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'zoom-notification';
            notification.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                z-index: 10000;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(0, 212, 170, 0.3);
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        notification.style.opacity = '1';
        
        clearTimeout(this.notificationTimeout);
        this.notificationTimeout = setTimeout(() => {
            notification.style.opacity = '0';
        }, 1500);
    }
}

// ============================================================================
// 2. SISTEMA DE FAVORITOS (Bookmarks Bar con Drag & Drop)
// ============================================================================

class BookmarksManager {
    constructor() {
        this.bookmarks = [];
        this.folders = new Map();
        this.isVisible = true;
        this.draggedItem = null;
        this.dropIndicator = null;
        
        this.init();
    }
    
    init() {
        this.loadBookmarks();
        this.createBookmarksBar();
        this.setupKeyboardShortcuts();
        this.setupDragAndDrop();
        console.log('✅ BookmarksManager initialized');
    }
    
    createBookmarksBar() {
        // Crear barra de favoritos si no existe
        let bookmarksBar = document.getElementById('bookmarks-bar');
        if (!bookmarksBar) {
            bookmarksBar = document.createElement('div');
            bookmarksBar.id = 'bookmarks-bar';
            bookmarksBar.className = 'bookmarks-bar';
            bookmarksBar.style.cssText = `
                display: flex;
                height: 36px;
                background: rgba(30, 30, 30, 0.95);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                padding: 0 12px;
                align-items: center;
                gap: 6px;
                overflow-x: auto;
                overflow-y: hidden;
                backdrop-filter: blur(10px);
                transition: all 0.3s ease;
            `;
            
            // Insertar después de navigation-bar
            const navigationBar = document.querySelector('.navigation-bar');
            if (navigationBar) {
                navigationBar.after(bookmarksBar);
            }
        }
        
        this.renderBookmarks();
    }
    
    renderBookmarks() {
        const bookmarksBar = document.getElementById('bookmarks-bar');
        if (!bookmarksBar) return;
        
        bookmarksBar.innerHTML = '';
        
        // Agregar botón "Agregar favorito"
        const addButton = this.createAddButton();
        bookmarksBar.appendChild(addButton);
        
        // Renderizar bookmarks
        this.bookmarks.forEach((bookmark, index) => {
            const element = this.createBookmarkElement(bookmark, index);
            bookmarksBar.appendChild(element);
        });
    }
    
    createAddButton() {
        const button = document.createElement('button');
        button.className = 'bookmark-add-btn';
        button.innerHTML = '➕';
        button.title = 'Agregar página actual a favoritos';
        button.style.cssText = `
            min-width: 32px;
            height: 28px;
            padding: 0 8px;
            border-radius: 6px;
            background: rgba(0, 212, 170, 0.15);
            border: 1px solid rgba(0, 212, 170, 0.3);
            color: #00D4AA;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
        `;
        
        button.addEventListener('click', () => this.addCurrentPage());
        button.addEventListener('mouseenter', () => {
            button.style.background = 'rgba(0, 212, 170, 0.25)';
            button.style.transform = 'scale(1.05)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.background = 'rgba(0, 212, 170, 0.15)';
            button.style.transform = 'scale(1)';
        });
        
        return button;
    }
    
    createBookmarkElement(bookmark, index) {
        const element = document.createElement('div');
        element.className = 'bookmark-item';
        element.setAttribute('data-bookmark-id', bookmark.id);
        element.setAttribute('data-index', index);
        element.setAttribute('draggable', 'true');
        
        element.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            max-width: 180px;
            height: 28px;
            padding: 0 10px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.05);
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
            overflow: hidden;
            user-select: none;
        `;
        
        // Favicon
        const favicon = document.createElement('img');
        favicon.src = bookmark.favicon || `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=16`;
        favicon.style.cssText = 'width: 16px; height: 16px; flex-shrink: 0;';
        favicon.onerror = () => favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%2300D4AA" width="16" height="16" rx="2"/></svg>';
        
        // Título
        const title = document.createElement('span');
        title.textContent = bookmark.title;
        title.style.cssText = 'color: white; font-size: 13px; overflow: hidden; text-overflow: ellipsis;';
        
        element.appendChild(favicon);
        element.appendChild(title);
        
        // Eventos
        element.addEventListener('click', () => this.openBookmark(bookmark));
        element.addEventListener('contextmenu', (e) => this.showContextMenu(e, bookmark));
        
        element.addEventListener('mouseenter', () => {
            element.style.background = 'rgba(0, 212, 170, 0.15)';
            element.style.transform = 'translateY(-1px)';
        });
        element.addEventListener('mouseleave', () => {
            element.style.background = 'rgba(255, 255, 255, 0.05)';
            element.style.transform = 'translateY(0)';
        });
        
        return element;
    }
    
    setupDragAndDrop() {
        const bookmarksBar = document.getElementById('bookmarks-bar');
        if (!bookmarksBar) return;
        
        bookmarksBar.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('bookmark-item')) {
                this.onDragStart(e);
            }
        });
        
        bookmarksBar.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.onDragOver(e);
        });
        
        bookmarksBar.addEventListener('drop', (e) => {
            e.preventDefault();
            this.onDrop(e);
        });
        
        bookmarksBar.addEventListener('dragend', () => {
            this.onDragEnd();
        });
    }
    
    onDragStart(e) {
        this.draggedItem = e.target;
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', e.target.getAttribute('data-index'));
    }
    
    onDragOver(e) {
        const target = e.target.closest('.bookmark-item');
        if (target && target !== this.draggedItem) {
            const rect = target.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            
            if (e.clientX < midpoint) {
                target.style.borderLeft = '2px solid #00D4AA';
                target.style.borderRight = 'none';
            } else {
                target.style.borderRight = '2px solid #00D4AA';
                target.style.borderLeft = 'none';
            }
        }
    }
    
    onDrop(e) {
        const target = e.target.closest('.bookmark-item');
        if (!target || target === this.draggedItem) return;
        
        const draggedIndex = parseInt(this.draggedItem.getAttribute('data-index'));
        const targetIndex = parseInt(target.getAttribute('data-index'));
        
        // Reorganizar array
        const [removed] = this.bookmarks.splice(draggedIndex, 1);
        this.bookmarks.splice(targetIndex, 0, removed);
        
        this.saveBookmarks();
        this.renderBookmarks();
        this.setupDragAndDrop(); // Re-setup después de re-render
    }
    
    onDragEnd() {
        if (this.draggedItem) {
            this.draggedItem.style.opacity = '1';
            this.draggedItem = null;
        }
        
        document.querySelectorAll('.bookmark-item').forEach(item => {
            item.style.borderLeft = 'none';
            item.style.borderRight = 'none';
        });
    }
    
    addCurrentPage() {
        const activeWebview = document.querySelector('webview.active');
        if (!activeWebview) return;
        
        const url = activeWebview.src;
        const title = activeWebview.getTitle() || 'Nueva página';
        
        const bookmark = {
            id: `bm_${Date.now()}`,
            title: title,
            url: url,
            favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`,
            dateAdded: Date.now()
        };
        
        this.bookmarks.push(bookmark);
        this.saveBookmarks();
        this.renderBookmarks();
        this.setupDragAndDrop();
        
        this.showNotification('✅ Favorito agregado');
    }
    
    openBookmark(bookmark) {
        if (typeof navigate === 'function') {
            navigate(bookmark.url);
        }
    }
    
    showContextMenu(e, bookmark) {
        e.preventDefault();
        // TODO: Implementar menú contextual para editar/eliminar
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                this.toggleVisibility();
            }
        });
    }
    
    toggleVisibility() {
        const bookmarksBar = document.getElementById('bookmarks-bar');
        if (!bookmarksBar) return;
        
        this.isVisible = !this.isVisible;
        bookmarksBar.style.display = this.isVisible ? 'flex' : 'none';
        
        localStorage.setItem('neza_bookmarks_visible', this.isVisible.toString());
        this.showNotification(this.isVisible ? '✅ Barra de favoritos visible' : '❌ Barra de favoritos oculta');
    }
    
    loadBookmarks() {
        try {
            const saved = localStorage.getItem('neza_bookmarks');
            if (saved) {
                this.bookmarks = JSON.parse(saved);
            }
            
            const visible = localStorage.getItem('neza_bookmarks_visible');
            this.isVisible = visible !== 'false';
        } catch (error) {
            console.error('Error loading bookmarks:', error);
        }
    }
    
    saveBookmarks() {
        try {
            localStorage.setItem('neza_bookmarks', JSON.stringify(this.bookmarks));
        } catch (error) {
            console.error('Error saving bookmarks:', error);
        }
    }
    
    showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 212, 170, 0.3);
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }
}

// ============================================================================
// 3. SISTEMA DE NAVEGACIÓN (Back/Forward con restauración de estado)
// ============================================================================

class NavigationHistoryManager {
    constructor() {
        this.historyStack = [];
        this.currentPosition = -1;
        this.maxStackSize = 50;
        this.ignoreNextPush = false;
        
        this.init();
    }
    
    init() {
        this.setupKeyboardShortcuts();
        this.updateNavigationButtons();
        console.log('✅ NavigationHistoryManager initialized');
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt + Flecha Izquierda = Atrás
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                this.goBack();
            }
            
            // Alt + Flecha Derecha = Adelante
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                this.goForward();
            }
        });
    }
    
    pushHistory(url, title = '') {
        if (this.ignoreNextPush) {
            this.ignoreNextPush = false;
            return;
        }
        
        // Limpiar entradas futuras si estamos en medio del historial
        if (this.currentPosition < this.historyStack.length - 1) {
            this.historyStack = this.historyStack.slice(0, this.currentPosition + 1);
        }
        
        // Crear nueva entrada
        const entry = {
            id: `hist_${Date.now()}`,
            url: url,
            title: title,
            timestamp: Date.now(),
            scrollPosition: { x: 0, y: 0 }
        };
        
        // No agregar si es la misma URL
        if (this.historyStack.length > 0 && 
            this.historyStack[this.currentPosition]?.url === url) {
            return;
        }
        
        this.historyStack.push(entry);
        this.currentPosition++;
        
        // Aplicar límite de tamaño
        if (this.historyStack.length > this.maxStackSize) {
            this.historyStack.shift();
            this.currentPosition--;
        }
        
        this.updateNavigationButtons();
        console.log(`History pushed: ${url} (position: ${this.currentPosition}/${this.historyStack.length - 1})`);
    }
    
    goBack() {
        // Si no hay historial propio, usar el historial nativo del webview
        if (!this.canGoBack()) {
            console.log('Using native webview goBack()');
            if (typeof tabs !== 'undefined' && typeof activeTabId !== 'undefined') {
                const activeTab = tabs.find(tab => tab.id === activeTabId);
                if (activeTab && activeTab.webview) {
                    activeTab.webview.goBack();
                    return true;
                }
            }
            return false;
        }
        
        const targetPosition = this.currentPosition - 1;
        const targetEntry = this.historyStack[targetPosition];
        
        if (!targetEntry) return false;
        
        this.currentPosition = targetPosition;
        this.ignoreNextPush = true;
        
        // Navegar a la URL
        if (typeof navigate === 'function') {
            navigate(targetEntry.url);
        }
        
        this.updateNavigationButtons();
        console.log(`Navigated back to: ${targetEntry.url}`);
        return true;
    }
    
    goForward() {
        // Si no hay historial propio, usar el historial nativo del webview
        if (!this.canGoForward()) {
            console.log('Using native webview goForward()');
            if (typeof tabs !== 'undefined' && typeof activeTabId !== 'undefined') {
                const activeTab = tabs.find(tab => tab.id === activeTabId);
                if (activeTab && activeTab.webview) {
                    activeTab.webview.goForward();
                    return true;
                }
            }
            return false;
        }
        
        const targetPosition = this.currentPosition + 1;
        const targetEntry = this.historyStack[targetPosition];
        
        if (!targetEntry) return false;
        
        this.currentPosition = targetPosition;
        this.ignoreNextPush = true;
        
        // Navegar a la URL
        if (typeof navigate === 'function') {
            navigate(targetEntry.url);
        }
        
        this.updateNavigationButtons();
        console.log(`Navigated forward to: ${targetEntry.url}`);
        return true;
    }
    
    canGoBack() {
        return this.currentPosition > 0 && this.historyStack.length > 1;
    }
    
    canGoForward() {
        return this.currentPosition < this.historyStack.length - 1;
    }
    
    updateNavigationButtons() {
        const backBtn = document.getElementById('backBtn');
        const forwardBtn = document.getElementById('forwardBtn');
        
        // Determinar si podemos navegar (historial propio o nativo)
        let canBack = this.canGoBack();
        let canForward = this.canGoForward();
        
        // Si no hay historial propio, verificar historial nativo del webview
        if (!canBack || !canForward) {
            if (typeof tabs !== 'undefined' && typeof activeTabId !== 'undefined') {
                const activeTab = tabs.find(tab => tab.id === activeTabId);
                if (activeTab && activeTab.webview) {
                    if (!canBack) canBack = activeTab.webview.canGoBack();
                    if (!canForward) canForward = activeTab.webview.canGoForward();
                }
            }
        }
        
        if (backBtn) {
            backBtn.disabled = !canBack;
            backBtn.style.opacity = canBack ? '1' : '0.3';
            backBtn.style.cursor = canBack ? 'pointer' : 'not-allowed';
        }
        
        if (forwardBtn) {
            forwardBtn.disabled = !canForward;
            forwardBtn.style.opacity = canForward ? '1' : '0.3';
            forwardBtn.style.cursor = canForward ? 'pointer' : 'not-allowed';
        }
    }
    
    getCurrentEntry() {
        return this.historyStack[this.currentPosition] || null;
    }
    
    getHistoryCount() {
        return {
            total: this.historyStack.length,
            current: this.currentPosition + 1,
            canGoBack: this.canGoBack(),
            canGoForward: this.canGoForward()
        };
    }
}

// ============================================================================
// INICIALIZACIÓN GLOBAL
// ============================================================================

let zoomController = null;
let bookmarksManager = null;
let navigationHistory = null;

function initializeBrowserFeatures() {
    console.log('🚀 Initializing Neza Browser Advanced Features...');
    
    try {
        zoomController = new ZoomController();
        bookmarksManager = new BookmarksManager();
        navigationHistory = new NavigationHistoryManager();
        
        console.log('✅ All browser features initialized successfully');
        
        // Exponer globalmente para debugging
        window.nezaFeatures = {
            zoom: zoomController,
            bookmarks: bookmarksManager,
            navigation: navigationHistory
        };
        
    } catch (error) {
        console.error('❌ Error initializing browser features:', error);
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBrowserFeatures);
} else {
    initializeBrowserFeatures();
}
