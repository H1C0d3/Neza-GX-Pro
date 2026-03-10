const { app, BrowserWindow, ipcMain, dialog, shell, webContents, session, clipboard, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Client, DefaultMediaReceiver } = require('castv2-client');
const PlatformSender = require('castv2-client/lib/senders/platform');
const createMdns = require('multicast-dns');
const pidusage = require('pidusage');

// Utilidad para decidir cuándo bloquear el menú nativo y dejar solo el del sitio
function shouldBlockContextMenu(params = {}, fallbackUrl = '') {
    const pool = [
        params.pageURL,
        params.frameURL,
        params.srcURL,
        params.linkURL,
        params.externalURL,
        fallbackUrl
    ].filter(Boolean).join(' ').toLowerCase();

    const isVideo = params.mediaType === 'video';
    const isYoutube = pool.includes('youtube.com') || pool.includes('youtu.be') || pool.includes('youtube-nocookie.com');
    const isGoogleVideo = pool.includes('googlevideo.com');

    // Bloquea si es YouTube o si es un video (evita doble menú cuando el sitio ya pone el suyo)
    return isYoutube || isGoogleVideo || isVideo;
}

// Configuraciones SEGURAS para navegación web
// Solo flags necesarios y seguros para webview
app.commandLine.appendSwitch('--enable-features', 'OverlayScrollbar');
app.commandLine.appendSwitch('--webview-tag-support');
app.commandLine.appendSwitch('--enable-webview-tag');
app.commandLine.appendSwitch('--disable-blink-features', 'AutomationControlled');

// Configurar logging
log.transports.file.level = 'info';
log.info('Iniciando Nexa Browser...');

// Variables globales
let mainWindow;
let welcomeWindow = null;
let updateAvailable = false;
// Use the packaged app version dynamically instead of hardcoding
const CURRENT_VERSION = app.getVersion();
const isDev = !app.isPackaged;
let musicPipWindow = null;
let castMdns = null;
let castDiscoveryTimer = null;
const castDevices = new Map();
let isShuttingDown = false;
let gxThresholds = {
    ramEnabled: false,
    ramLimitMB: 8192,
    cpuEnabled: false,
    cpuLimit: 50,
    cacheEnabled: false,
    cacheLimitMB: 512,
    mediaProtectionEnabled: false
};
let gxMonitorTimer = null;
const gxTabRegistry = new Map(); // wcId -> { tabId }
const gxTabLimits = new Map(); // tabId -> limits
const gxTabNetState = new Map(); // wcId -> applied network emulation state
let lastMediaInterventionTs = 0;
let blockerStatePath = null;
let blockerState = {
    enabled: true,
    siteRules: {},
    stats: { totalBlocked: 0, bySite: {} }
};
const blockerSessions = new WeakSet();
const blockerFrameHosts = new Map();
const trackerHosts = [
    'doubleclick.net', 'googletagmanager.com', 'google-analytics.com', 'adservice.google.com', 'adsystem.com',
    'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'taboola.com', 'outbrain.com', 'criteo.com',
    'scorecardresearch.com', 'demdex.net', 'quantserve.com', 'facebook.net', 'connect.facebook.net',
    'pixel.wp.com', 'hotjar.com', 'newrelic.com', 'mixpanel.com', 'branch.io', 'smartadserver.com',
    'chartbeat.com', 'tapad.com', 'casalemedia.com', 'mediamath.com'
];
const trackerPathPatterns = [
    /\/ads?\//i,
    /\/analytics\//i,
    /pixel\.php/i,
    /collect\?/i,
    /beacon/i,
    /doubleclick/i,
    /adservice/i
];

function sanitizeHost(rawHost = '') {
    if (!rawHost) return '';
    try {
        if (rawHost.startsWith('http')) {
            return new URL(rawHost).hostname;
        }
        return new URL(`https://${rawHost}`).hostname;
    } catch {
        return rawHost.replace(/[^a-zA-Z0-9.-]/g, '');
    }
}

function loadBlockerState() {
    try {
        if (!blockerStatePath) return;
        if (fs.existsSync(blockerStatePath)) {
            const content = JSON.parse(fs.readFileSync(blockerStatePath, 'utf8'));
            blockerState = {
                enabled: content.enabled !== false,
                siteRules: content.siteRules || {},
                stats: content.stats || { totalBlocked: 0, bySite: {} }
            };
        }
    } catch (err) {
        log.warn('No se pudo cargar estado del bloqueador', err.message || err);
    }
}

function persistBlockerState() {
    try {
        if (!blockerStatePath) return;
        fs.writeFileSync(blockerStatePath, JSON.stringify(blockerState, null, 2));
    } catch (err) {
        log.warn('No se pudo guardar estado del bloqueador', err.message || err);
    }
}

function shouldBlockUrl(url = '', siteHost = '') {
    if (!url || !url.startsWith('http')) return false;
    const host = sanitizeHost(url);
    if (!host) return false;

    // Allowlist para flujos de verificación y seguridad (evita loops en Cloudflare/Turnstile)
    const lowerUrl = String(url).toLowerCase();
    const cfAllow =
        host.includes('cloudflare') ||
        host.endsWith('challenges.cloudflare.com') ||
        lowerUrl.includes('/cdn-cgi/') ||
        host.endsWith('tempmailo.com');
    if (cfAllow) return false;

    const normalizedSiteHost = sanitizeHost(siteHost);
    const isFirstParty = normalizedSiteHost && (host === normalizedSiteHost || host.endsWith(`.${normalizedSiteHost}`));

    if (trackerHosts.some(t => host.includes(t))) return true;

    // Evitar falsos positivos en endpoints propios del sitio
    if (isFirstParty) return false;

    return trackerPathPatterns.some(rx => rx.test(url));
}

function bumpBlockerStats(siteHost) {
    const host = siteHost || 'global';
    blockerState.stats.totalBlocked = (blockerState.stats.totalBlocked || 0) + 1;
    blockerState.stats.bySite = blockerState.stats.bySite || {};
    blockerState.stats.bySite[host] = blockerState.stats.bySite[host] || { blocked: 0 };
    blockerState.stats.bySite[host].blocked += 1;
}

function broadcastBlockerUpdate(siteHost) {
    const payload = {
        siteHost,
        totalBlocked: blockerState.stats.totalBlocked || 0,
        siteBlocked: blockerState.stats.bySite?.[siteHost]?.blocked || 0,
        enabled: blockerState.enabled
    };
    BrowserWindow.getAllWindows().forEach(win => {
        try { win.webContents.send('blocker:update', payload); } catch (_) {}
    });
}

function setupBlocker(electronSession) {
    if (!electronSession || blockerSessions.has(electronSession)) return;
    blockerSessions.add(electronSession);

    electronSession.webRequest.onBeforeRequest((details, cb) => {
        try {
            const { url, resourceType, webContentsId } = details;
            if (!blockerState.enabled) return cb({});
            if (!url || !url.startsWith('http')) return cb({});

            const requestHost = sanitizeHost(url);
            if (resourceType === 'mainFrame') {
                blockerFrameHosts.set(webContentsId, requestHost);
            }
            const siteHost = blockerFrameHosts.get(webContentsId) || requestHost;
            const siteRule = blockerState.siteRules[siteHost];
            const siteEnabled = typeof siteRule === 'boolean' ? siteRule : true;
            if (!siteEnabled) return cb({});

            if (shouldBlockUrl(url, siteHost)) {
                bumpBlockerStats(siteHost);
                persistBlockerState();
                setImmediate(() => broadcastBlockerUpdate(siteHost));
                return cb({ cancel: true });
            }
        } catch (err) {
            log.warn('onBeforeRequest blocker error', err.message || err);
        }
        cb({});
    });

    electronSession.webRequest.onCompleted((details) => {
        if (details && details.resourceType === 'mainFrame') {
            blockerFrameHosts.set(details.webContentsId, sanitizeHost(details.url));
        }
    });

    electronSession.webRequest.onErrorOccurred((details) => {
        if (details && details.resourceType === 'mainFrame') {
            blockerFrameHosts.set(details.webContentsId, sanitizeHost(details.url));
        }
    });
}

app.on('web-contents-created', (_event, contents) => {
    contents.on('destroyed', () => {
        blockerFrameHosts.delete(contents.id);
    });
});

app.on('before-quit', () => {
    try { closeAuxWindowsAndTimers(); } catch (_) {}
});

// Google OAuth (PKCE + loopback)
const GOOGLE_CLIENT_ID = '5819831712-au18hiiakkt3vrje6tv52n5uim4atcna.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback';
const GOOGLE_OAUTH_SCOPES = ['openid', 'email', 'profile'];
let oauthPending = null;
let oauthWindow = null;

function isGoogleAuthUrl(url = '') {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('accounts.google.com') || lower.includes('google.com/accounts') || lower.includes('oauth2');
}

function openBrandedAuthWindow(url) {
    try {
        const popup = new BrowserWindow({
            width: 520,
            height: 720,
            minWidth: 420,
            minHeight: 600,
            frame: false,
            titleBarStyle: 'hidden',
            backgroundColor: '#0d0d0d',
            autoHideMenuBar: true,
            parent: mainWindow || null,
            modal: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                sandbox: true,
                webviewTag: true,
                partition: 'persist:neza-main-session',
                preload: path.join(__dirname, 'preload.js')
            },
            icon: path.join(__dirname, 'resourse', 'Nexa_Icono_PNG.png'),
            show: false
        });

        popup.webContents.setWindowOpenHandler(({ url }) => {
            try { mainWindow?.webContents?.send('open-url-in-new-tab', url); } catch (_) {}
            return { action: 'deny' };
        });

        popup.once('ready-to-show', () => popup.show());
        popup.loadURL(url).catch(err => log.error('❌ Error cargando auth popup:', err));
        return true;
    } catch (err) {
        log.error('❌ No se pudo crear auth popup:', err);
        return false;
    }
}

// Helper para abrir ventanas con la misma UI (para tear-out)
function createDetachedWindow(startUrl = '', isPrivate = false) {
    try {
        const { pathToFileURL } = require('url');
        const htmlPath = path.join(__dirname, 'neza-app.html');
        const baseURL = pathToFileURL(htmlPath).href;

        let htmlURL = `${baseURL}?fresh=1`;
        if (startUrl) htmlURL += `&startUrl=${encodeURIComponent(startUrl)}`;
        if (isPrivate) htmlURL += `&startPrivate=1`;

        const win = new BrowserWindow({
            width: 1100,
            height: 720,
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
                preload: path.join(__dirname, 'preload.js'),
                backgroundThrottling: true,
                offscreen: false,
                enableWebSQL: false,
                v8CacheOptions: 'code',
                disableHtmlFullscreenWindowResize: true
            },
            icon: path.join(__dirname, 'resourse', 'Nexa_Icono_PNG.png'),
            show: false
        });

        win.webContents.setWindowOpenHandler(({ url }) => {
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('open-url-in-new-tab', url);
            }
            return { action: 'deny' };
        });

        win.loadURL(htmlURL).catch(err => log.error('❌ Error al cargar ventana desprendida:', err));
        win.once('ready-to-show', () => {
            win.show();
            win.focus();
        });

        return win;
    } catch (err) {
        log.error('❌ Error creando ventana desprendida:', err);
        return null;
    }
}

class YoutubeSender extends PlatformSender {
    constructor() {
        super(YoutubeSender.APP_ID);
    }
}
YoutubeSender.APP_ID = 'YouTube';

// Bloquear menú de Electron sobre contenidos de YouTube (incluye webviews)
app.on('web-contents-created', (_event, contents) => {
    contents.on('context-menu', (event, params) => {
        try {
            const currentUrl = contents.getURL ? contents.getURL() : '';
            if (shouldBlockContextMenu(params, currentUrl)) {
                event.preventDefault();
            }
        } catch (err) {
            log.warn('Context menu handler (global) error:', err);
        }
    });

    // Forzar que cualquier window.open en webviews abra como pestaña en Neza (no ventana Electron)
    if (contents.getType && contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
            // Permitir OAuth de Google en una ventana de marca para preservar el flujo
            if (isGoogleAuthUrl(url)) {
                if (openBrandedAuthWindow(url)) return { action: 'deny' };
            }
            try { mainWindow?.webContents?.send('open-url-in-new-tab', url); } catch (_) {}
            return { action: 'deny' };
        });
    }
});

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

// ===== GOOGLE OAUTH (PKCE + LOOPBACK) =====
function base64UrlEncode(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier() {
    return base64UrlEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return base64UrlEncode(hash);
}

async function exchangeCodeForTokens(code, verifier) {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        code,
        code_verifier: verifier,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
    });

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => resp.statusText);
        throw new Error(`Token exchange failed: ${resp.status} ${text}`);
    }

    return resp.json();
}

function startGoogleOAuthFlow(scopes = GOOGLE_OAUTH_SCOPES) {
    if (oauthPending && oauthPending.reject) {
        oauthPending.reject(new Error('OAuth flow already in progress'));
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = base64UrlEncode(crypto.randomBytes(16));

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    return new Promise((resolve, reject) => {
        oauthPending = { resolve, reject, codeVerifier, state };
        shell.openExternal(authUrl.toString()).catch((err) => {
            oauthPending = null;
            reject(err);
        });
    });
}

function startGoogleOAuthInApp(scopes = GOOGLE_OAUTH_SCOPES) {
    if (oauthPending && oauthPending.reject) {
        oauthPending.reject(new Error('OAuth flow already in progress'));
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = base64UrlEncode(crypto.randomBytes(16));

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    return new Promise((resolve, reject) => {
        oauthPending = { resolve, reject, codeVerifier, state };

        try {
            if (oauthWindow) {
                try { oauthWindow.close(); } catch (_) {}
            }

            oauthWindow = new BrowserWindow({
                width: 960,
                height: 720,
                show: true,
                title: 'Iniciar sesión con Google',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true,
                    partition: 'persist:neza-main-session',
                    preload: undefined,
                    webviewTag: false,
                    zoomFactor: 1.0,
                }
            });

            const wc = oauthWindow.webContents;
            oauthWindow.setMenuBarVisibility(false);
            oauthWindow.setAutoHideMenuBar(true);
            wc.setWindowOpenHandler(() => ({ action: 'deny' }));
            wc.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0');

            const finish = (fn, payload) => {
                if (oauthWindow) {
                    try { oauthWindow.close(); } catch (_) {}
                    oauthWindow = null;
                }
                if (fn) fn(payload);
            };

            const maybeHandleRedirect = (urlStr) => {
                try {
                    if (urlStr && urlStr.startsWith(GOOGLE_REDIRECT_URI)) {
                        const parsed = new URL(urlStr);
                        const code = parsed.searchParams.get('code');
                        const stateReceived = parsed.searchParams.get('state');
                        if (code) {
                            handleOAuthCode({ code, state: stateReceived });
                        }
                    }
                } catch (e) {
                    log.warn('OAuth redirect parse error', e.message || e);
                }
            };

            wc.on('will-redirect', (_e, urlStr) => {
                maybeHandleRedirect(urlStr);
            });

            wc.on('did-navigate', (_e, urlStr) => {
                maybeHandleRedirect(urlStr);
            });

            wc.on('page-title-updated', (_e, title) => {
                const t = (title || '').toLowerCase();
                if (t.includes('no puedes acceder') || t.includes('couldn’t sign you in') || t.includes('couldn\'t sign you in')) {
                    // Fallback automático al sistema si Google bloquea la ventana embebida
                    log.info('OAuth in-app bloqueado, haciendo fallback a sistema');
                    finish(null);
                    startGoogleOAuthFlow(scopes).then(resolve).catch(reject);
                }
            });

            wc.on('new-window', (e) => e.preventDefault());

            oauthWindow.on('closed', () => {
                oauthWindow = null;
                if (oauthPending) {
                    oauthPending.reject(new Error('Login cancelado'));
                    oauthPending = null;
                }
            });

            wc.loadURL(authUrl.toString()).catch((err) => {
                log.error('OAuth in-app load error:', err);
                finish(null);
                startGoogleOAuthFlow(scopes).then(resolve).catch(reject);
            });
        } catch (err) {
            log.error('OAuth in-app failed to start:', err);
            oauthPending = null;
            startGoogleOAuthFlow(scopes).then(resolve).catch(reject);
        }
    });
}

async function handleOAuthCode({ code, state }) {
    try {
        if (!oauthPending) {
            log.warn('OAuth code received without pending flow');
            return;
        }
        if (oauthPending.state !== state) {
            log.warn('OAuth state mismatch, ignoring');
            return;
        }
        const tokens = await exchangeCodeForTokens(code, oauthPending.codeVerifier);
        oauthPending.resolve(tokens);
        oauthPending = null;
        if (oauthWindow) {
            try { oauthWindow.close(); } catch (_) {}
            oauthWindow = null;
        }
        if (mainWindow && tokens) {
            mainWindow.webContents.send('google-oauth-token', tokens);
        }
    } catch (err) {
        log.error('OAuth code handling failed:', err);
        if (oauthPending && oauthPending.reject) {
            oauthPending.reject(err);
            oauthPending = null;
            if (oauthWindow) {
                try { oauthWindow.close(); } catch (_) {}
                oauthWindow = null;
            }
        }
    }
}

// ===== GX CONTROL MONITOR =====

ipcMain.handle('gx:set-thresholds', (_event, payload = {}) => {
    try {
        gxThresholds = {
            ramEnabled: !!payload.ramEnabled,
            ramLimitMB: Math.max(256, Number(payload.ramLimitMB) || 8192),
            cpuEnabled: !!payload.cpuEnabled,
            cpuLimit: Math.max(1, Number(payload.cpuLimit) || 50),
            cacheEnabled: !!payload.cacheEnabled,
            cacheLimitMB: Math.max(50, Number(payload.cacheLimitMB) || 512),
            mediaProtectionEnabled: !!payload.mediaProtectionEnabled
        };
        log.info('✅ Umbrales GX actualizados:', gxThresholds);
        return true;
    } catch (err) {
        log.error('❌ Error al actualizar umbrales GX:', err);
        return false;
    }
});

ipcMain.handle('gx:register-tab', (_event, payload = {}) => {
    try {
        const tabId = Number(payload.tabId);
        const wcId = Number(payload.wcId);
        if (!tabId || !wcId) return false;
        gxTabRegistry.set(wcId, { tabId });

        const wc = webContents.fromId(wcId);
        if (wc && !wc.isDestroyed()) {
            const cleanup = () => {
                gxTabRegistry.delete(wcId);
                gxTabNetState.delete(wcId);
            };
            wc.once('destroyed', cleanup);
            applyTabNetworkConstraintsForWc(wc, gxTabLimits.get(tabId));
        }
        return true;
    } catch (err) {
        log.warn('gx:register-tab failed', err.message || err);
        return false;
    }
});

ipcMain.handle('gx:unregister-tab', (_event, payload = {}) => {
    try {
        const wcId = Number(payload.wcId);
        if (!wcId) return false;
        gxTabRegistry.delete(wcId);
        const net = gxTabNetState.get(wcId);
        if (net?.attached) {
            const wc = webContents.fromId(wcId);
            try { wc?.debugger?.detach(); } catch (_) {}
        }
        gxTabNetState.delete(wcId);
        return true;
    } catch (err) {
        log.warn('gx:unregister-tab failed', err.message || err);
        return false;
    }
});

ipcMain.handle('gx:set-tab-limits', (_event, payload = {}) => {
    try {
        gxTabLimits.clear();
        Object.entries(payload || {}).forEach(([tabId, limits]) => {
            if (!tabId || !limits) return;
            gxTabLimits.set(Number(tabId), {
                cpuLimit: Number(limits.cpuLimit) || 0,
                ramLimitMB: Number(limits.ramLimitMB) || 0,
                netKbps: Number(limits.netKbps) || 0,
                latencyMs: Number(limits.latencyMs) || 0
            });
        });

        gxTabRegistry.forEach((info, wcId) => {
            const wc = webContents.fromId(wcId);
            if (!wc || wc.isDestroyed()) return;
            const limits = gxTabLimits.get(info.tabId);
            applyTabNetworkConstraintsForWc(wc, limits);
        });
        return true;
    } catch (err) {
        log.warn('gx:set-tab-limits failed', err.message || err);
        return false;
    }
});

function startGxMonitor() {
    if (gxMonitorTimer) {
        clearInterval(gxMonitorTimer);
        gxMonitorTimer = null;
    }

    const SAMPLE_MS = 4000;
    gxMonitorTimer = setInterval(() => {
        sampleGxMetrics().catch(err => log.warn('⚠️ GX monitor error:', err));
    }, SAMPLE_MS);

    // Primer muestreo inmediato
    sampleGxMetrics().catch(err => log.warn('⚠️ GX monitor error inicial:', err));
}

function stopGxMonitor() {
    if (gxMonitorTimer) {
        clearInterval(gxMonitorTimer);
        gxMonitorTimer = null;
    }
}

async function sampleGxMetrics() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const all = webContents.getAllWebContents().filter(wc => {
        if (!wc || wc.isDestroyed()) return false;
        const t = wc.getType();
        return t === 'window' || t === 'webview';
    });

    const pidEntries = [];
    const pidSet = new Set();
    for (const wc of all) {
        try {
            const pid = wc.getOSProcessId();
            if (!pid) continue;
            pidEntries.push({ pid, wc });
            pidSet.add(pid);
        } catch (_) {
            // ignorar
        }
    }

    const pids = Array.from(pidSet);
    if (!pids.length) return;

    let usage = {};
    try {
        usage = await pidusage(pids);
    } catch (err) {
        log.warn('⚠️ pidusage falló:', err.message || err);
        return;
    }

    const processes = [];
    const byTab = {};
    let totalCpu = 0;
    let totalMem = 0;
    for (const { pid, wc } of pidEntries) {
        const stat = usage[pid] || {};
        const cpu = stat.cpu || 0;
        const memMB = (stat.memory || 0) / (1024 * 1024);
        const tabMeta = gxTabRegistry.get(wc.id);
        totalCpu += cpu;
        totalMem += memMB;
        processes.push({
            pid,
            wcId: wc.id,
            type: wc.getType(),
            url: safeGetUrl(wc),
            title: safeGetTitle(wc),
            tabId: tabMeta?.tabId || null,
            cpu,
            memoryMB: memMB
        });

        if (tabMeta?.tabId) {
            const key = tabMeta.tabId;
            const current = byTab[key] || { cpu: 0, memoryMB: 0, tabId: key, processes: 0, title: safeGetTitle(wc), url: safeGetUrl(wc) };
            current.cpu += cpu;
            current.memoryMB += memMB;
            current.processes += 1;
            current.title = current.title || safeGetTitle(wc);
            current.url = current.url || safeGetUrl(wc);
            byTab[key] = current;
        }
    }

    const payload = {
        timestamp: Date.now(),
        total: {
            cpu: totalCpu,
            memoryMB: totalMem
        },
        processes,
        byTab
    };

    mainWindow.webContents.send('gx:metrics', payload);
    enforceGxLimits(payload, pidEntries, usage);
}

function enforceGxLimits(payload, pidEntries, usage) {
    if (!payload || !payload.total) return;

    const overRam = gxThresholds.ramEnabled && payload.total.memoryMB > gxThresholds.ramLimitMB;
    const overCpu = gxThresholds.cpuEnabled && payload.total.cpu > gxThresholds.cpuLimit;

    if (overRam) {
        notifyGxLimit('ram', payload.total.memoryMB, gxThresholds.ramLimitMB);
        tryPauseMediaOnce(pidEntries, 'ram');
    }

    if (overCpu) {
        notifyGxLimit('cpu', payload.total.cpu, gxThresholds.cpuLimit);
        tryPauseMediaOnce(pidEntries, 'cpu');
    }

    if (gxThresholds.cacheEnabled && payload.total.memoryMB > gxThresholds.ramLimitMB * 0.85) {
        try {
            const sess = session.defaultSession;
            if (sess) {
                sess.clearCache().catch(() => {});
                sess.clearStorageData({ storages: ['appcache', 'serviceworkers', 'caches'] }).catch(() => {});
            }
            notifyGxLimit('cache', payload.total.memoryMB, gxThresholds.ramLimitMB);
            tryPauseMediaOnce(pidEntries, 'cache');
        } catch (err) {
            log.warn('⚠️ Limpieza de cache falló:', err.message || err);
        }
    }

    enforceTabLimits(pidEntries, usage || {});
}

function enforceTabLimits(pidEntries, usage) {
    pidEntries.forEach(({ pid, wc }) => {
        const tabMeta = gxTabRegistry.get(wc.id);
        if (!tabMeta) return;
        const limits = gxTabLimits.get(tabMeta.tabId);
        if (!limits) return;

        const stat = usage[pid] || {};
        const cpu = stat.cpu || 0;
        const memMB = (stat.memory || 0) / (1024 * 1024);

        if (limits.cpuLimit && cpu > limits.cpuLimit) {
            notifyTabLimit('cpu', tabMeta.tabId, cpu, limits.cpuLimit);
        }

        if (limits.ramLimitMB && memMB > limits.ramLimitMB) {
            notifyTabLimit('ram', tabMeta.tabId, memMB, limits.ramLimitMB);
        }
    });
}

function notifyTabLimit(type, tabId, value, limit) {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gx:tab-limit-hit', { type, tabId, value, limit, ts: Date.now() });
        }
    } catch (err) {
        log.warn('⚠️ Notificación de límite por pestaña falló:', err.message || err);
    }
}

function applyTabNetworkConstraintsForWc(wc, limits) {
    const wcId = wc?.id;
    if (!wc || wc.isDestroyed() || !wcId) return;

    const needThrottle = limits && (limits.netKbps > 0 || limits.latencyMs > 0);
    if (!needThrottle) {
        const prev = gxTabNetState.get(wcId);
        if (prev?.attached) {
            try { wc.debugger.detach(); } catch (_) {}
        }
        gxTabNetState.delete(wcId);
        return;
    }

    const downloadThroughput = Math.max(8 * 1024, Math.round((limits.netKbps || 0) * 1024 / 8));
    const uploadThroughput = downloadThroughput;
    const latency = Math.max(0, Math.round(limits.latencyMs || 0));

    try {
        if (!wc.debugger.isAttached()) {
            wc.debugger.attach('1.3');
        }
        wc.debugger.sendCommand('Network.enable');
        wc.debugger.sendCommand('Network.emulateNetworkConditions', {
            offline: false,
            latency,
            downloadThroughput,
            uploadThroughput
        });
        gxTabNetState.set(wcId, { attached: true, latency, downloadThroughput, uploadThroughput });
    } catch (err) {
        log.warn('⚠️ No se pudo aplicar throttling de red en pestaña', err.message || err);
    }
}

function tryPauseMediaOnce(pidEntries, reason = 'ram') {
    // Respetar experiencia: no intervenir si el usuario no lo habilitó
    if (!gxThresholds.mediaProtectionEnabled) return;

    const now = Date.now();
    const COOLDOWN_MS = 15000; // evitar silenciar de forma repetitiva
    if (now - lastMediaInterventionTs < COOLDOWN_MS) return;
    lastMediaInterventionTs = now;

    pauseHeavyMedia(pidEntries);
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gx:limit-hit', {
                type: `media-${reason}`,
                value: 1,
                limit: 1,
                ts: now,
                note: 'Intervención multimedia aplicada'
            });
        }
    } catch (_) {
        // silencioso
    }
}

function pauseHeavyMedia(pidEntries) {
    const seen = new Set();
    for (const { wc } of pidEntries) {
        if (!wc || wc.isDestroyed() || seen.has(wc.id)) continue;
        seen.add(wc.id);
        try {
            wc.setAudioMuted(true);
            wc.executeJavaScript(`(() => {
                const media = document.querySelectorAll('video, audio');
                media.forEach(m => { try { m.pause(); m.muted = true; m.playbackRate = 1; } catch(_){} });
            })();`, true).catch(() => {});
        } catch (_) {
            // ignorar
        }
    }
}

function notifyGxLimit(type, value, limit) {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gx:limit-hit', { type, value, limit, ts: Date.now() });
        }
    } catch (err) {
        log.warn('⚠️ Notificación GX falló:', err.message || err);
    }
}

function safeGetUrl(wc) {
    try { return wc.getURL ? wc.getURL() : ''; } catch (_) { return ''; }
}

function safeGetTitle(wc) {
    try { return wc.getTitle ? wc.getTitle() : ''; } catch (_) { return ''; }
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
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        frame: false,
        show: false,
        backgroundColor: '#18181c',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,
            sandbox: false,
            spellcheck: true,
            enableRemoteModule: false,
            additionalArguments: [
                '--disable-site-isolation-trials',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        }
    });

    // Detectar intento de popup en webview
    welcomeWindow.webContents.setWindowOpenHandler((details) => {
        // Enviar al renderer para mostrar aviso
        welcomeWindow.webContents.send('popup-attempt', {
            url: details.url,
            frameName: details.frameName,
            disposition: details.disposition,
            domain: (new URL(details.url)).hostname
        });
        // Bloquear por defecto, solo abrir si el usuario lo aprueba
        return { action: 'deny' };
    });

    // Cargar la misma app en modo "bienvenida"
    try {
        const { pathToFileURL } = require('url');
        const htmlPath = path.join(__dirname, 'neza-app.html');
        const htmlURL = pathToFileURL(htmlPath).href + '?welcome=1';

        welcomeWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            log.error('❌ Error al cargar welcome:', errorCode, errorDescription);
            log.error('📍 URL que falló:', validatedURL);
        });

        welcomeWindow.webContents.on('did-finish-load', () => {
            log.info('✅ Ventana de bienvenida cargada');
        });

        welcomeWindow.loadURL(htmlURL).catch(err => log.error('❌ Error en loadURL(welcome):', err));

        welcomeWindow.once('ready-to-show', () => {
            welcomeWindow.show();
            welcomeWindow.focus();
        });
    } catch (e) {
        log.error('❌ Error cargando ventana de bienvenida:', e);
    }

    welcomeWindow.on('closed', () => {
        welcomeWindow = null;
        // Crear ventana principal después de cerrar bienvenida
        createMainWindow();
    });
}

function createMainWindow(options = {}) {
    // Guardar que ya vio la bienvenida de esta versión
    const isNewUpdate = saveVersionSeen();
    
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
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            sandbox: true,
            webviewTag: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: true,
            offscreen: false,
            enableWebSQL: false,
            v8CacheOptions: 'code',
            disableHtmlFullscreenWindowResize: true
        },
        icon: path.join(__dirname, 'resourse', 'Nexa_Icono_PNG.png'),
        show: false
    });

    // Asegurar zoom neutral (sin escalado) en la ventana principal
    try {
        mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
        mainWindow.webContents.setZoomFactor(1);
        mainWindow.webContents.setZoomLevel(0);
    } catch (err) {
        log.warn('Zoom clamp failed on main window', err);
    }
    
    // Maximizar si estaba maximizado O si es actualización nueva
    if (windowState.isMaximized || isNewUpdate) {
        mainWindow.maximize();
        if (isNewUpdate) {
            log.info('🚀 Ventana maximizada por actualización');
        }
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
    const baseURL = pathToFileURL(htmlPath).href;
    const htmlURL = options.fresh ? `${baseURL}?fresh=1` : baseURL;
    
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

        // Iniciar monitor de recursos GX
        startGxMonitor();
        
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
    
    // Guardar sesión del navegador antes de cerrar
    mainWindow.on('close', (e) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        // Evitar que Electron cierre antes de guardar y limpiar
        e.preventDefault();

        // Enviar señal al renderer para guardar la sesión
        if (mainWindow && mainWindow.webContents) {
            try {
                mainWindow.webContents.send('save-session-before-close');
                log.info('💾 Señal de guardado de sesión enviada');
            } catch (error) {
                log.error('❌ Error enviando señal de guardado:', error);
            }
        }

        // Guardar estado de ventana y limpiar auxiliares
        try { saveWindowState(); } catch (_) {}
        closeAuxWindowsAndTimers();

        // Dar un pequeño margen para que el renderer persista la sesión
        setTimeout(() => {
            try { closeAuxWindowsAndTimers(); } catch (_) {}
            try { mainWindow?.removeAllListeners('close'); } catch (_) {}
            try { mainWindow?.destroy(); } catch (_) {}
            app.quit();
        }, 400);
    });
    
    // Log de errores del renderer
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        if (level === 3) { // Error
            log.error(`[Renderer Error] ${message} (${sourceId}:${line})`);
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // En lugar de abrir ventanas nuevas, enviar la URL al webview para abrir en pestaña
        if (isGoogleAuthUrl(url)) {
            if (openBrandedAuthWindow(url)) {
                return { action: 'deny' };
            }
        }
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('open-url-in-new-tab', url);
        }
        return { action: 'deny' };
    });

    // Evitar menú doble (navegador + menú del sitio) sobre videos
    mainWindow.webContents.on('context-menu', (event, params) => {
        try {
            if (shouldBlockContextMenu(params, mainWindow.webContents.getURL())) {
                event.preventDefault();
            }
        } catch (err) {
            log.warn('Context menu handler error:', err);
        }
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

function closeAuxWindowsAndTimers() {
    try {
        stopGxMonitor();
    } catch (err) {
        log.warn('No se pudo detener monitor GX', err.message || err);
    }

    try {
        if (castDiscoveryTimer) {
            clearInterval(castDiscoveryTimer);
            castDiscoveryTimer = null;
        }
        if (castMdns) {
            try { castMdns.destroy(); } catch (_) {}
            castMdns = null;
        }
        castDevices.clear();
    } catch (err) {
        log.warn('No se pudo limpiar descubrimiento Cast', err.message || err);
    }

    try {
        if (musicPipWindow && !musicPipWindow.isDestroyed()) {
            musicPipWindow.removeAllListeners('close');
            musicPipWindow.close();
        }
    } catch (err) {
        log.warn('No se pudo cerrar ventana PiP', err.message || err);
    }

    try {
        // Cerrar cualquier otra ventana suelta (incluye posibles PiP residuales)
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                try { win.close(); } catch (_) {}
            }
        });
    } catch (err) {
        log.warn('No se pudieron cerrar todas las ventanas', err.message || err);
    }
}

function saveVersionSeen() {
    try {
        const configPath = path.join(app.getPath('userData'), 'nexa-config.json');
        let isNewUpdate = false;
        
        // Verificar si es actualización
        if (fs.existsSync(configPath)) {
            const oldConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const oldVersion = oldConfig.lastSeenVersion || '0.0.0';
            isNewUpdate = oldVersion !== CURRENT_VERSION;
            if (isNewUpdate) {
                log.info(`🆕 Actualización detectada: ${oldVersion} → ${CURRENT_VERSION}`);
            }
        } else {
            isNewUpdate = true; // Primera instalación
        }
        
        const config = {
            lastSeenVersion: CURRENT_VERSION,
            autoUpdate: true,
            theme: 'dark',
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        log.info(`✅ Version ${CURRENT_VERSION} marked as seen`);
        
        return isNewUpdate;
    } catch (error) {
        log.error('Error saving version:', error);
        return false;
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

// ============ Chromecast discovery & control ============
function parseCastTxt(txtRecords = []) {
    const data = {};
    txtRecords.forEach((entry) => {
        try {
            const str = entry.toString();
            const [k, v] = str.split('=');
            if (k) data[k] = v || '';
        } catch (e) {
            log.warn('TXT parse error', e.message);
        }
    });
    return data;
}

function handleCastMdnsResponse(res) {
    const records = [...(res.answers || []), ...(res.additionals || [])];
    const srvByName = new Map();
    const txtByName = new Map();
    const aByName = new Map();
    const aaaaByName = new Map();

    records.forEach((r) => {
        if (r.type === 'SRV') srvByName.set(r.name, r);
        if (r.type === 'TXT') txtByName.set(r.name, r);
        if (r.type === 'A') aByName.set(r.name, r);
        if (r.type === 'AAAA') aaaaByName.set(r.name, r);
    });

    records.forEach((r) => {
        if (r.type !== 'PTR' || r.name !== '_googlecast._tcp.local') return;
        const serviceName = r.data;
        const srv = srvByName.get(serviceName);
        if (!srv || !srv.data) return;

        const target = (srv.data.target || '').replace(/\.$/, '');
        const port = srv.data.port || 8009;
        const txt = parseCastTxt((txtByName.get(serviceName) || {}).data || []);
        const a = aByName.get(target + '.local');
        const aaaa = aaaaByName.get(target + '.local');
        const address = (a && a.data) || (aaaa && aaaa.data) || null;

        const name = txt.fn || target || 'Chromecast';
        const id = serviceName;
        castDevices.set(id, {
            id,
            name,
            host: target,
            port,
            address,
            model: txt.md,
            version: txt.ve,
            lastSeen: Date.now()
        });
    });
}

function startCastDiscovery() {
    if (castMdns) return;
    try {
        castMdns = createMdns();
        castMdns.on('response', handleCastMdnsResponse);
        castMdns.query({ questions: [{ name: '_googlecast._tcp.local', type: 'PTR' }] });
        castDiscoveryTimer = setInterval(() => {
            try {
                castMdns.query({ questions: [{ name: '_googlecast._tcp.local', type: 'PTR' }] });
            } catch (e) {
                log.warn('Cast query failed:', e.message);
            }
        }, 5000);
        log.info('📡 Cast discovery iniciado');
    } catch (error) {
        log.error('❌ No se pudo iniciar discovery Cast:', error);
    }
}

function getCastDevices() {
    const now = Date.now();
    // Purge stale (>60s)
    for (const [key, dev] of castDevices.entries()) {
        if (now - (dev.lastSeen || 0) > 60000) {
            castDevices.delete(key);
        }
    }
    return Array.from(castDevices.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function sendYoutubeToCast(targetHost, targetPort, videoId, startTime = 0) {
    return new Promise((resolve) => {
        const client = new Client();
        let finished = false;
        const port = targetPort || 8009;

        const finish = (success, payload = {}) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try { client.close(); } catch (e) {}
            resolve({ success, ...payload });
        };

        const timer = setTimeout(() => finish(false, { error: 'Timeout al conectar al dispositivo Cast' }), 12000);

        client.on('error', (err) => {
            finish(false, { error: err?.message || 'Error Cast' });
        });

        const launchDefault = () => {
            client.launch(DefaultMediaReceiver, (err, player) => {
                if (err) {
                    finish(false, { error: err?.message || 'No se pudo iniciar el receptor de medios' });
                    return;
                }

                player.on('error', (playerErr) => {
                    finish(false, { error: playerErr?.message || 'Error del reproductor en el dispositivo' });
                });

                const media = {
                    contentId: `https://www.youtube.com/watch?v=${videoId}&autoplay=1`,
                    contentType: 'text/html',
                    streamType: 'BUFFERED',
                    metadata: {
                        type: 0,
                        metadataType: 0,
                        title: 'YouTube',
                        subtitle: videoId
                    }
                };

                player.load(media, { autoplay: true, currentTime: Number(startTime) || 0 }, (loadErr, status) => {
                    if (loadErr) {
                        finish(false, { error: loadErr?.message || 'No se pudo cargar el video en el dispositivo' });
                        return;
                    }
                    finish(true, { message: 'Enviado al dispositivo', status });
                });
            });
        };

        client.connect({ host: targetHost, port }, () => {
            // Intentar primero app oficial de YouTube; si falla, fallback a DefaultMediaReceiver
            try {
                client.launch(YoutubeSender, (ytErr, yt) => {
                    if (ytErr || !yt) {
                        launchDefault();
                        return;
                    }
                    if (typeof yt.load !== 'function') {
                        log.warn('YouTube sender no expone load(); usando receptor por defecto');
                        launchDefault();
                        return;
                    }
                    yt.on('error', (e) => finish(false, { error: e?.message || 'Error YouTube Cast' }));
                    yt.load(videoId, { startTime: Number(startTime) || 0 }, (loadErr, status) => {
                        if (loadErr) {
                            launchDefault();
                            return;
                        }
                        finish(true, { message: 'Enviado al dispositivo (YouTube)', status });
                    });
                });
            } catch (e) {
                launchDefault();
            }
        });
    });
}

// IPC Handlers
ipcMain.handle('check-for-updates', async () => {
    log.info('🔍 Verificación manual de actualizaciones solicitada');
    checkForUpdates();
    return { checking: true };
});

ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
});

ipcMain.handle('google-oauth:start', async (_event, scopes) => {
    const finalScopes = Array.isArray(scopes) && scopes.length ? scopes : GOOGLE_OAUTH_SCOPES;
    return startGoogleOAuthFlow(finalScopes);
});

ipcMain.handle('google-oauth:start-in-app', async (_event, scopes) => {
    const finalScopes = Array.isArray(scopes) && scopes.length ? scopes : GOOGLE_OAUTH_SCOPES;
    return startGoogleOAuthInApp(finalScopes);
});

ipcMain.handle('tabs:tear-out', async (_event, payload = {}) => {
    const url = typeof payload.url === 'string' ? payload.url : '';
    const isPrivate = !!payload.isPrivate;
    createDetachedWindow(url, isPrivate);
    return { ok: true };
});

ipcMain.handle('tabs:move-to-main', async (_event, payload = {}) => {
    const url = typeof payload.url === 'string' ? payload.url : '';
    const isPrivate = !!payload.isPrivate;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('open-url-in-new-tab', url, { isPrivate });
        return { ok: true };
    }
    return { ok: false, error: 'Main window not available' };
});

ipcMain.handle('open-external', async (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('clipboard:write-text', async (_event, text) => {
    try {
        clipboard.writeText(String(text || ''));
        return { success: true };
    } catch (err) {
        return { success: false, error: err?.message || String(err) };
    }
});

ipcMain.handle('clipboard:read-text', async () => {
    try {
        return { success: true, text: clipboard.readText() || '' };
    } catch (err) {
        return { success: false, error: err?.message || String(err), text: '' };
    }
});

ipcMain.handle('clipboard:write-image-data-url', async (_event, dataUrl) => {
    try {
        const value = String(dataUrl || '');
        if (!value.startsWith('data:image/')) {
            return { success: false, error: 'Formato de imagen inválido' };
        }
        const image = nativeImage.createFromDataURL(value);
        if (!image || image.isEmpty()) {
            return { success: false, error: 'No se pudo crear la imagen' };
        }
        clipboard.writeImage(image);
        return { success: true };
    } catch (err) {
        return { success: false, error: err?.message || String(err) };
    }
});

ipcMain.handle('open-compat-window', async (_event, rawUrl) => {
    try {
        const url = String(rawUrl || '').trim();
        if (!url) return { ok: false, error: 'URL vacía' };
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { ok: false, error: 'Protocolo no permitido' };
        }

        const win = new BrowserWindow({
            width: 1100,
            height: 760,
            minWidth: 900,
            minHeight: 620,
            autoHideMenuBar: true,
            backgroundColor: '#111111',
            parent: mainWindow || null,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webviewTag: false
            },
            icon: path.join(__dirname, 'resourse', 'Nexa_Icono_PNG.png')
        });

        win.setMenuBarVisibility(false);
        win.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
            try {
                win.webContents.loadURL(popupUrl);
            } catch (_) {}
            return { action: 'deny' };
        });

        win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await win.loadURL(url);
        return { ok: true };
    } catch (err) {
        log.error('❌ open-compat-window error:', err);
        return { ok: false, error: err?.message || 'No se pudo abrir ventana compat' };
    }
});

ipcMain.handle('tls:diagnose', async (_event, rawUrl) => {
    try {
        const target = new URL(String(rawUrl || ''));
        if (!['https:', 'http:'].includes(target.protocol)) {
            return { ok: false, error: 'Protocol not supported' };
        }

        const dns = require('dns').promises;
        const tls = require('tls');

        const host = target.hostname;
        const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
        const result = {
            ok: true,
            url: target.toString(),
            host,
            port,
            timestamp: new Date().toISOString(),
            systemTimeMs: Date.now(),
            dns: null,
            tls: null
        };

        try {
            const addrs = await dns.lookup(host, { all: true });
            result.dns = addrs;
        } catch (dnsErr) {
            result.dns = { error: dnsErr?.message || String(dnsErr) };
        }

        if (target.protocol === 'https:') {
            result.tls = await new Promise((resolve) => {
                const socket = tls.connect({
                    host,
                    port,
                    servername: host,
                    rejectUnauthorized: true,
                    timeout: 8000
                }, () => {
                    try {
                        const cert = socket.getPeerCertificate();
                        resolve({
                            authorized: socket.authorized,
                            authorizationError: socket.authorizationError || null,
                            protocol: socket.getProtocol ? socket.getProtocol() : null,
                            cipher: socket.getCipher ? socket.getCipher() : null,
                            cert: cert ? {
                                subject: cert.subject,
                                issuer: cert.issuer,
                                valid_from: cert.valid_from,
                                valid_to: cert.valid_to,
                                fingerprint256: cert.fingerprint256
                            } : null
                        });
                    } catch (e) {
                        resolve({ error: e?.message || String(e) });
                    } finally {
                        try { socket.end(); } catch (_) {}
                    }
                });

                socket.on('error', (err) => resolve({ error: err?.message || String(err), code: err?.code || null }));
                socket.on('timeout', () => {
                    try { socket.destroy(); } catch (_) {}
                    resolve({ error: 'TLS timeout' });
                });
            });
        }

        return result;
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
});

ipcMain.handle('cast:open-system', async () => {
    try {
        if (process.platform === 'win32') {
            const targets = [
                'ms-settings:connect', // Windows 11 cast panel (may fall back)
                'ms-settings-connectabledevices:devicediscovery', // device discovery
                'ms-settings-displays-topology:projection' // projection options
            ];

            for (const uri of targets) {
                try {
                    await shell.openExternal(uri);
                    log.info(`📡 Abriendo panel de casting: ${uri}`);
                    return { success: true, message: 'Abriendo panel de transmisión del sistema' };
                } catch (inner) {
                    log.warn(`No se pudo abrir ${uri}:`, inner.message);
                }
            }

            return { success: false, error: 'No se pudo abrir el panel de transmisión en Windows' };
        }

        if (process.platform === 'darwin') {
            try {
                await shell.openExternal('x-apple.systempreferences:com.apple.preference.displays');
                return { success: true, message: 'Abriendo preferencias de Pantallas para AirPlay' };
            } catch (e) {
                log.warn('No se pudo abrir preferencias de Pantallas:', e.message);
                return { success: false, error: 'No se pudo abrir AirPlay en macOS' };
            }
        }

        // Para otras plataformas aún no implementado
        return { success: false, error: 'Casting del sistema no está soportado en esta plataforma' };
    } catch (error) {
        log.error('❌ Error abriendo panel de casting:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('cast:discover', async () => {
    startCastDiscovery();
    const devices = getCastDevices();
    return { devices };
});

ipcMain.handle('cast:send-youtube', async (_event, payload) => {
    try {
        const { host, address, port = 8009, videoId, startTime = 0 } = payload || {};
        const targetHost = address || host;
        if (!targetHost || !videoId) {
            return { success: false, error: 'Faltan datos de dispositivo o video' };
        }
        log.info(`📡 Enviando YouTube ${videoId} a ${targetHost}:${port} (start ${startTime}s)`);
        const result = await sendYoutubeToCast(targetHost, port, videoId, startTime);
        return result;
    } catch (error) {
        log.error('❌ Error en cast:send-youtube:', error);
        return { success: false, error: error.message };
    }
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

// IPC: Music PiP floating controller
ipcMain.handle('music-pip:show', async (event, payload) => {
    try {
        const { title = 'Título de la canción', artist = 'Nombre del artista', artwork = '🎵', showSkip = false } = payload || {};
        if (musicPipWindow && !musicPipWindow.isDestroyed()) {
            musicPipWindow.webContents.send('music-pip:update', { title, artist, artwork, showSkip });
            musicPipWindow.showInactive();
            return { success: true };
        }

        musicPipWindow = new BrowserWindow({
            width: 230,
            height: 160,
            frame: false,
            transparent: true,
            resizable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            hasShadow: false,
            backgroundColor: '#00000000',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                preload: path.join(__dirname, 'preload.js'),
                backgroundThrottling: false,
                devTools: isDev
            }
        });

                const html = `<!DOCTYPE html>
                <html><head><meta charset="UTF-8" />
                <style>
                :root { --primary: #0bd1aa; --bg: #0c0c0c; --border: rgba(11,209,170,0.28);} 
                html, body { margin:0; width:100%; height:100%; overflow:hidden; background:transparent; }
                body { -webkit-user-select:none; }
                .card { position:absolute; inset:0; box-sizing:border-box; padding:10px; background: var(--bg); border:1px solid var(--border); border-radius:10px; box-shadow:0 6px 16px rgba(0,0,0,0.35); color:#f5f5f5; font-family:'Inter', system-ui, sans-serif; -webkit-app-region: drag; overflow:visible; }
                .top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; font-weight:700; font-size:12px; }
                .top-left { display:flex; align-items:center; gap:8px; }
                .pip-brand-icon { width:30px; height:30px; display:inline-block; vertical-align:middle; }
                .switch-icon { -webkit-app-region: no-drag; width:28px; height:28px; border-radius:50%; border:1px solid rgba(11,209,170,0.5); background:linear-gradient(135deg, #0bd1aa, #0aa18b); color:#041412; cursor:pointer; font-size:14px; font-weight:900; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 6px 14px rgba(11,209,170,0.35); transition:transform .12s ease, box-shadow .12s ease, filter .12s ease; }
                .switch-icon:hover { transform: translateY(-1px); box-shadow:0 9px 18px rgba(11,209,170,0.45); filter:brightness(1.03); }
                .switch-icon:active { transform: translateY(0); box-shadow:0 6px 14px rgba(11,209,170,0.32); filter:brightness(0.97); }
                .close { -webkit-app-region: no-drag; border:none; background:transparent; color:#bbb; cursor:pointer; font-size:14px; }
                .body { display:flex; gap:10px; align-items:center; }
                .art { width:36px; height:36px; border-radius:8px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; font-size:17px; color:#9ad6c7; -webkit-app-region: no-drag; }
                .info { flex:1; min-width:0; -webkit-app-region: no-drag; }
                .title { margin:0 0 2px 0; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .artist { margin:0; font-size:10.5px; color:#9aa1ab; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .controls { margin-top:8px; display:flex; gap:6px; align-items:center; -webkit-app-region: no-drag; }
                .btn { -webkit-app-region: no-drag; width:28px; height:28px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.08); color:#f5f5f5; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:background .18s ease, transform .12s ease; font-size:13px; }
                .btn:hover { background:rgba(11,209,170,0.18); transform: translateY(-1px); }
                .btn.skip { width:64px; font-size:12px; }
                .vol-wrap { position:relative; display:inline-flex; align-items:center; }
                .vol-pop { position:absolute; top:-6px; right:-38px; transform: translateY(-115%); background:rgba(12,12,12,0.96); border:1px solid var(--border); border-radius:10px; padding:6px 10px; box-shadow:0 10px 24px rgba(0,0,0,0.32); display:none; flex-direction:column; gap:6px; min-width:130px; }
                .vol-pop.show { display:flex; }
                .vol-row { display:flex; align-items:center; gap:8px; }
                .vol-slider { flex:1; -webkit-appearance:none; appearance:none; height:5px; border-radius:999px; background:linear-gradient(90deg, var(--primary), rgba(0,212,170,0.25)); outline:none; max-width:96px; }
                .vol-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:12px; height:12px; border-radius:50%; background:var(--primary); cursor:pointer; box-shadow:0 0 0 3px rgba(11,209,170,0.15); border:none; }
                .vol-value { font-size:11px; color:#e6e6e6; min-width:32px; text-align:right; }
                </style></head>
                <body>
                    <div class="card" id="card">
                        <div class="top">
                            <div class="top-left">
                                <button class="switch-icon" id="switch" title="Cambiar pestaña">⇆</button>
                                <span aria-label="Controlador PiP" title="Controlador PiP">
                                    <svg class="pip-brand-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                                        <path d="M13 17C13 15.1144 13 14.1716 13.5858 13.5858C14.1716 13 15.1144 13 17 13H18C19.8856 13 20.8284 13 21.4142 13.5858C22 14.1716 22 15.1144 22 17C22 18.8856 22 19.8284 21.4142 20.4142C20.8284 21 19.8856 21 18 21H17C15.1144 21 14.1716 21 13.5858 20.4142C13 19.8284 13 18.8856 13 17Z" fill="#ffffff"/>
                                        <path fill-rule="evenodd" clip-rule="evenodd" d="M10 3H14C17.7712 3 19.6569 3 20.8284 4.17157C21.7775 5.1206 21.9577 6.86626 21.992 9.49974C22.0042 10.4366 22.0102 10.905 21.7166 11.2025C21.4229 11.5 20.9486 11.5 20 11.5H17.5C14.6716 11.5 13.2574 11.5 12.3787 12.3787C11.5 13.2574 11.5 14.6716 11.5 17.5V19.5C11.5 19.9659 11.5 20.1989 11.4239 20.3827C11.3224 20.6277 11.1277 20.8224 10.8827 20.9239C10.6989 21 10.4659 21 10 21C6.22876 21 4.34315 21 3.17157 19.8284C2 18.6569 2 16.7712 2 13V11C2 7.22876 2 5.34315 3.17157 4.17157C4.34315 3 6.22876 3 10 3ZM8.03033 6.96967C7.73744 6.67678 7.26256 6.67678 6.96967 6.96967C6.67678 7.26256 6.67678 7.73744 6.96967 8.03033L9.68934 10.75H8.5C8.08579 10.75 7.75 11.0858 7.75 11.5C7.75 11.9142 8.08579 12.25 8.5 12.25H11.5C11.9142 12.25 12.25 11.9142 12.25 11.5V8.5C12.25 8.08579 11.9142 7.75 11.5 7.75C11.0858 7.75 10.75 8.08579 10.75 8.5V9.68934L8.03033 6.96967Z" fill="#ffffff"/>
                                    </svg>
                                </span>
                            </div>
                            <button class="close" id="close">✕</button>
                        </div>
                        <div class="body">
                            <div class="art" id="art">🎵</div>
                            <div class="info">
                                <p class="title" id="title">Título de la canción</p>
                                <p class="artist" id="artist">Nombre del artista</p>
                            </div>
                        </div>
                        <div class="controls">
                            <button class="btn" id="prev" title="Anterior">⏮</button>
                            <button class="btn" id="play" title="Play/Pause">▶️</button>
                            <button class="btn" id="next" title="Siguiente">⏭</button>
                            <button class="btn skip" id="skip" title="Saltar anuncio" style="display:none;">Saltar</button>
                            <div class="vol-wrap">
                                <button class="btn" id="vol" title="Volumen">🔊</button>
                                <div class="vol-pop" id="volPop">
                                    <div class="vol-row">
                                        <input type="range" min="0" max="100" value="100" class="vol-slider" id="volSlider">
                                        <span class="vol-value" id="volValue">100%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <script>
                        const api = window.electronAPI;
                        const qs = new URLSearchParams(window.location.search);
                        const initTitle = qs.get('t') || 'Título de la canción';
                        const initArtist = qs.get('a') || 'Nombre del artista';
                        const initArtwork = qs.get('art') || '🎵';
                        const titleEl = document.getElementById('title');
                        const artistEl = document.getElementById('artist');
                        const artEl = document.getElementById('art');
                        const volBtn = document.getElementById('vol');
                        const volPop = document.getElementById('volPop');
                        const volSlider = document.getElementById('volSlider');
                        const volValue = document.getElementById('volValue');
                        let volOpen = false;
                        const setData = (d) => {
                            titleEl.textContent = d.title || initTitle;
                            artistEl.textContent = d.artist || initArtist;
                            artEl.textContent = d.artwork || initArtwork;
                            const showSkip = !!d.showSkip;
                            document.getElementById('skip').style.display = showSkip ? 'inline-flex' : 'none';
                        };
                        setData({ title: initTitle, artist: initArtist, artwork: initArtwork });
                        document.getElementById('close').onclick = () => { api.musicPip.sendCommand('close'); window.close(); };
                        document.getElementById('switch').onclick = (e) => {
                            api.musicPip.sendCommand({ type: 'toggleTabPicker', x: e.screenX, y: e.screenY });
                        };
                        // Cerrar el selector si se hace click en cualquier parte del PiP (menos en el botón switch)
                        document.addEventListener('mousedown', (ev) => {
                            if (!ev.target.closest('#switch')) {
                                api.musicPip.sendCommand('closeTabPicker');
                            }
                        });
                        document.getElementById('prev').onclick = () => api.musicPip.sendCommand('prev');
                        document.getElementById('play').onclick = () => api.musicPip.sendCommand('playpause');
                        document.getElementById('next').onclick = () => api.musicPip.sendCommand('next');
                        document.getElementById('skip').onclick = () => api.musicPip.sendCommand('skipad');
                        const syncVolLabel = (v) => { volValue.textContent = Math.round(v) + '%'; };
                        const sendVolume = (v) => api.musicPip.sendCommand({ type: 'setvolume', value: Math.round(v) });
                        volBtn.onclick = (ev) => {
                            ev.stopPropagation();
                            volOpen = !volOpen;
                            if (volOpen) {
                                volPop.classList.add('show');
                                document.addEventListener('mousedown', closeVolOnOutside, true);
                            } else {
                                volPop.classList.remove('show');
                                document.removeEventListener('mousedown', closeVolOnOutside, true);
                            }
                        };
                        const closeVolOnOutside = (e) => {
                            if (!volPop.contains(e.target) && !volBtn.contains(e.target)) {
                                volOpen = false;
                                volPop.classList.remove('show');
                                document.removeEventListener('mousedown', closeVolOnOutside, true);
                            }
                        };
                        volSlider.oninput = (e) => {
                            const v = parseInt(e.target.value || '0', 10);
                            syncVolLabel(v);
                            sendVolume(v);
                        };
                        syncVolLabel(volSlider.value || 100);
                        if (api && api.on) {
                            api.on('music-pip:update', (_e, data) => setData(data || {}));
                        }
                    </script>
                </body></html>`;

        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html + `<!-- ${title} -->`);
        await musicPipWindow.loadURL(dataUrl + `?t=${encodeURIComponent(title)}&a=${encodeURIComponent(artist)}&art=${encodeURIComponent(artwork)}`);
        musicPipWindow.setAlwaysOnTop(true, 'floating');
        musicPipWindow.showInactive();

        musicPipWindow.on('closed', () => {
            musicPipWindow = null;
        });

        return { success: true };
    } catch (error) {
        log.error('❌ Error mostrando PiP Música:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('music-pip:hide', async () => {
    if (musicPipWindow && !musicPipWindow.isDestroyed()) {
        musicPipWindow.close();
        musicPipWindow = null;
    }
    return { success: true };
});

ipcMain.on('music-pip:command', (event, command) => {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('music-pip-command', command);
    }
    if (command === 'close' && musicPipWindow && !musicPipWindow.isDestroyed()) {
        musicPipWindow.close();
        musicPipWindow = null;
    }
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

ipcMain.handle('capture-window', async () => {
    try {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return { success: false, error: 'Ventana no disponible' };
        }
        const image = await mainWindow.capturePage();
        if (!image || typeof image.toDataURL !== 'function') {
            return { success: false, error: 'No se pudo generar imagen' };
        }
        return { success: true, dataUrl: image.toDataURL() };
    } catch (error) {
        log.error('❌ Error capturando ventana:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('blocker:get-state', async (_event, host) => {
    const safeHost = sanitizeHost(host);
    const rule = blockerState.siteRules[safeHost];
    const siteEnabled = typeof rule === 'boolean' ? rule : true;
    const siteStats = blockerState.stats.bySite?.[safeHost] || { blocked: 0 };
    return {
        enabled: blockerState.enabled,
        siteEnabled,
        totalBlocked: blockerState.stats.totalBlocked || 0,
        siteBlocked: siteStats.blocked || 0
    };
});

ipcMain.handle('blocker:set-global', async (_event, enabled) => {
    blockerState.enabled = !!enabled;
    persistBlockerState();
    broadcastBlockerUpdate('global');
    return { enabled: blockerState.enabled };
});

ipcMain.handle('blocker:set-site', async (_event, payload = {}) => {
    const safeHost = sanitizeHost(payload.host);
    if (!safeHost) return { success: false, error: 'Host inválido' };
    blockerState.siteRules[safeHost] = !!payload.enabled;
    persistBlockerState();
    broadcastBlockerUpdate(safeHost);
    return { success: true, host: safeHost, enabled: !!payload.enabled };
});

ipcMain.handle('blocker:reset-stats', async (_event, host) => {
    const safeHost = sanitizeHost(host || '');
    if (safeHost) {
        blockerState.stats.bySite = blockerState.stats.bySite || {};
        blockerState.stats.bySite[safeHost] = { blocked: 0 };
    } else {
        blockerState.stats = { totalBlocked: 0, bySite: {} };
    }
    persistBlockerState();
    broadcastBlockerUpdate(safeHost || 'global');
    return { success: true };
});

// IPC para cerrar ventana de bienvenida
ipcMain.handle('close-welcome', async () => {
    if (welcomeWindow) {
        welcomeWindow.close();
    }
});

// IPC para crear nuevas ventanas
ipcMain.on('create-new-window', (_event, options = {}) => {
    createMainWindow(options);
});

ipcMain.on('create-stealth-window', (event, options) => {
    createStealthWindow(options);
});

function createStealthWindow(options = {}) {
    const layer = Number(options.layer) || 3;
    const stealthWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0a0a',
        autoHideMenuBar: true,
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

    // Endurecer ventana stealth
    const blockCaptures = layer >= 3;
    stealthWindow.setContentProtection(blockCaptures); // en nivel 1/2 se permite captura, en 3 se bloquea

    // Redirigir popups a pestañas nuevas dentro de la propia ventana stealth
    stealthWindow.webContents.setWindowOpenHandler(({ url }) => {
        try { stealthWindow.webContents.send('open-url-in-new-tab', url); } catch (_) {}
        return { action: 'deny' };
    });
    stealthWindow.setMenuBarVisibility(false);

    // Asegurar zoom neutral en ventanas stealth
    try {
        stealthWindow.webContents.setVisualZoomLevelLimits(1, 1);
        stealthWindow.webContents.setZoomFactor(1);
        stealthWindow.webContents.setZoomLevel(0);
    } catch (err) {
        log.warn('Zoom clamp failed on stealth window', err);
    }

    const stealthSession = stealthWindow.webContents.session;
    setupBlocker(stealthSession);

    // Permisos: negar todo por defecto en stealth
    stealthWindow.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
        const denied = ['media', 'geolocation', 'notifications', 'midiSysex', 'pointerLock', 'fullscreen', 'openExternal'];
        if (denied.includes(permission)) {
            return callback(false);
        }
        callback(false);
    });

    // Filtrado básico: bloquear trackers comunes y forzar HTTPS cuando sea posible
    const trackerSubstrings = ['doubleclick.net', 'googletagmanager.com', 'facebook.net', 'google-analytics.com', 'adservice.google.com'];
    stealthSession.webRequest.onBeforeRequest((details, cb) => {
        try {
            const url = details.url || '';
            if (url.startsWith('http://')) {
                const httpsUrl = url.replace('http://', 'https://');
                return cb({ redirectURL: httpsUrl });
            }

            // Permitir scripts necesarios para login (Google/YouTube/WhatsApp)
            const allowListHosts = ['google.com', 'accounts.google.com', 'youtube.com', 'gstatic.com', 'whatsapp.com', 'web.whatsapp.com'];
            const shouldAllow = allowListHosts.some(h => url.includes(h));
            if (!shouldAllow && trackerSubstrings.some(t => url.includes(t))) {
                return cb({ cancel: true });
            }
        } catch (err) {
            log.warn('stealth onBeforeRequest error', err.message || err);
        }
        cb({});
    });

    // Encabezados: mantener referer y usar UA consistente con Chromium 120
    stealthSession.webRequest.onBeforeSendHeaders((details, cb) => {
        const headers = { ...details.requestHeaders };
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
        cb({ requestHeaders: headers });
    });

    // Encabezados de respuesta: añadir CSP mínima si no existe
    stealthSession.webRequest.onHeadersReceived((details, cb) => {
        const responseHeaders = details.responseHeaders || {};
        if (!responseHeaders['Content-Security-Policy'] && !responseHeaders['content-security-policy']) {
            responseHeaders['Content-Security-Policy'] = ["default-src 'self' https: data: blob:; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests"];
        }
        cb({ responseHeaders });
    });

    // Cargar con parámetros stealth
    const { pathToFileURL } = require('url');
    const stealthBase = pathToFileURL(path.join(__dirname, 'neza-app.html')).href;
    const stealthURL = `${stealthBase}?stealth=${layer}&session=new&fresh=1`;
    stealthWindow.loadURL(stealthURL);

    stealthWindow.once('ready-to-show', () => {
        stealthWindow.show();
    });

    // Limpiar datos al cerrar
    stealthWindow.on('closed', () => {
        if (stealthSession) {
            stealthSession.clearCache();
            stealthSession.clearStorageData({ storages: ['appcache','cookies','localstorage','shadercache','serviceworkers','caches','indexdb','filesystem','websql'] });
            stealthSession.clearAuthCache();
            try { stealthSession.clearHostResolverCache(); } catch (_) {}
        }
    });
}

// Eventos de la aplicación
app.whenReady().then(() => {
    // Configurar directorio de datos del usuario
    const userDataPath = path.join(app.getPath('appData'), 'Nexa Browser');
    app.setPath('userData', userDataPath);

    blockerStatePath = path.join(app.getPath('userData'), 'blocker-state.json');
    loadBlockerState();
    
    // Verificar y actualizar versión al iniciar
    checkAndUpdateVersion();
    
    // 🛡️ CONFIGURAR HEADERS HTTP REALISTAS PARA EVITAR CAPTCHAS
    const { session } = require('electron');

    setupBlocker(session.defaultSession);
    
    // Ajuste mínimo de headers para mantener compatibilidad con desafíos anti-bot
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...(details.requestHeaders || {}) };

        // No forzar Sec-Fetch/Accept globalmente: muchos anti-bot validan coherencia por tipo de recurso
        if (!headers['Accept-Language'] && !headers['accept-language']) {
            headers['Accept-Language'] = 'es-ES,es;q=0.9,en;q=0.8';
        }

        // Eliminar header de DevTools que puede delatar instrumentación
        delete headers['X-DevTools-Emulate-Network-Conditions-Client-Id'];

        callback({ requestHeaders: headers });
    });
    
    // Configurar cookies para aceptarlas (necesario para Google)
    session.defaultSession.cookies.flushStore().then(() => {
        log.info('🍪 Sistema de cookies configurado correctamente');
    });
    
    log.info('✅ Headers HTTP realistas configurados para evitar CAPTCHAs');
    
    // Configurar sistema de descargas ANTES de crear ventanas
    setupDownloadsHandler();
    
    setupAutoUpdater();
    createWindow();

        // Iniciar listener OAuth Google (loopback)
        const { startOAuthListener } = require('./google-oauth-listener');
        startOAuthListener({
            onCode: handleOAuthCode,
            onToken: (token) => {
                // Compat implícita: si viniera access_token directo
                if (mainWindow) {
                    mainWindow.webContents.send('google-oauth-token', { access_token: token });
                }
            }
        });
    
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

// ============================================
// SISTEMA DE DESCARGAS ESTILO OPERA - COMPLETO
// ============================================
class DownloadManager {
    constructor() {
        this.downloads = new Map(); // downloadId -> { downloadItem, data }
        this.downloadHistory = [];
        this.downloadsFolder = path.join(app.getPath('downloads'), 'Neza Downloads');
        this.historyFilePath = path.join(app.getPath('userData'), 'download-history.json');
        this.savePathOverrides = new Map(); // url -> absolute savePath (one-shot)
        
        this.setupDownloadFolder();
        this.loadDownloadHistory();
        this.setupDownloadCapture();
        this.setupIPCHandlers();
        
        log.info('🚀 DownloadManager estilo Opera inicializado');
    }

    /**
     * Genera una ruta única para el archivo. Si ya existe, agrega (1), (2), etc.
     * Ejemplo: oso.png -> oso (1).png -> oso (2).png
     */
    getUniqueFilePath(originalPath) {
        if (!fs.existsSync(originalPath)) {
            log.info(`✅ Archivo no existe, usando ruta original: ${originalPath}`);
            return originalPath;
        }

        log.info(`⚠️ Archivo ya existe: ${originalPath}, generando nombre único...`);

        const dir = path.dirname(originalPath);
        const ext = path.extname(originalPath);
        const nameWithoutExt = path.basename(originalPath, ext);

        let counter = 1;
        let newPath;

        do {
            newPath = path.join(dir, `${nameWithoutExt} (${counter})${ext}`);
            counter++;
        } while (fs.existsSync(newPath));

        log.info(`✅ Nuevo nombre único generado: ${newPath}`);
        return newPath;
    }

    setupDownloadFolder() {
        if (!fs.existsSync(this.downloadsFolder)) {
            fs.mkdirSync(this.downloadsFolder, { recursive: true });
            log.info('📁 Carpeta de descargas creada:', this.downloadsFolder);
        }
    }

    loadDownloadHistory() {
        try {
            if (fs.existsSync(this.historyFilePath)) {
                const data = fs.readFileSync(this.historyFilePath, 'utf8');
                this.downloadHistory = JSON.parse(data);
                log.info(`📜 Historial cargado: ${this.downloadHistory.length} descargas`);
            }
        } catch (error) {
            log.error('❌ Error cargando historial:', error);
            this.downloadHistory = [];
        }
    }

    saveDownloadHistory() {
        try {
            fs.writeFileSync(this.historyFilePath, JSON.stringify(this.downloadHistory, null, 2));
            log.info('💾 Historial guardado');
        } catch (error) {
            log.error('❌ Error guardando historial:', error);
        }
    }

    setupDownloadCapture() {
        const { session } = require('electron');

        // Capturar descargas de la sesión por defecto
        session.defaultSession.on('will-download', (event, item, webContents) => {
            this.handleDownload(event, item, webContents);
        });

        // Capturar descargas de la partición usada por los webviews
        try {
            const nezSession = session.fromPartition('persist:neza-main-session');
            if (nezSession) {
                nezSession.on('will-download', (event, item, webContents) => {
                    this.handleDownload(event, item, webContents);
                });
                log.info('✅ Captura de descargas habilitada para partition persist:neza-main-session');
            } else {
                log.warn('⚠️ No se encontró la sesión persist:neza-main-session');
            }
        } catch (e) {
            log.error('❌ Error configurando captura en partition persist:neza-main-session', e);
        }

        log.info('✅ Captura automática de descargas configurada');
    }

    handleDownload(event, item, webContents) {
        const downloadId = this.generateDownloadId();
        const fileName = item.getFilename();
        const totalBytes = item.getTotalBytes();
        const url = item.getURL();
        
        // Comprobar override de "Guardar como..." para este URL
        let savePath;
        if (this.savePathOverrides.has(url)) {
            savePath = this.savePathOverrides.get(url);
            this.savePathOverrides.delete(url); // one-shot
            // IMPORTANTE: Aunque sea "Guardar como...", verificar nombres únicos
            savePath = this.getUniqueFilePath(savePath);
        } else {
            // Obtener carpeta de descargas (personalizada o por defecto)
            const downloadsPath = this.getDownloadsPath();
            savePath = path.join(downloadsPath, fileName);
            // Generar nombre único si el archivo ya existe (como Chrome/Firefox)
            savePath = this.getUniqueFilePath(savePath);
        }

        log.info(`🔹 Ruta final de descarga ANTES de setSavePath: ${savePath}`);
        item.setSavePath(savePath);
        log.info(`🔹 Ruta final de descarga DESPUÉS de setSavePath: ${savePath}`);
        
        // Actualizar el nombre del archivo al nombre único generado
        const actualFileName = path.basename(savePath);
        
        const downloadData = {
            id: downloadId,
            filename: actualFileName,
            filePath: savePath,
            url: url,
            totalBytes: totalBytes,
            receivedBytes: 0,
            startTime: Date.now(),
            endTime: null,
            status: 'downloading', // downloading, paused, completed, cancelled, error
            progress: 0,
            speed: '--',
            eta: '--',
            isPaused: false,
            error: null
        };
        
        // Guardar referencia al item y datos
        this.downloads.set(downloadId, {
            item: item,
            data: downloadData,
            lastUpdate: Date.now(),
            lastBytes: 0
        });
        
        log.info(`📥 [${downloadId}] Descarga iniciada: ${fileName}`);
        log.info(`📁 Guardando en: ${savePath}`);
        
        // Enviar evento de inicio a TODAS las ventanas
        this.broadcastToAll('download-started', downloadData);
        
        // Eventos del item de descarga
        item.on('updated', (event, state) => {
            this.handleDownloadProgress(downloadId, item, state);
        });
        
        item.once('done', (event, state) => {
            this.handleDownloadDone(downloadId, item, state);
        });
    }

    handleDownloadProgress(downloadId, item, state) {
        const download = this.downloads.get(downloadId);
        if (!download) return;
        
        const receivedBytes = item.getReceivedBytes();
        const totalBytes = item.getTotalBytes();
        const progress = totalBytes > 0 ? (receivedBytes / totalBytes) * 100 : 0;
        
        // Calcular velocidad y ETA
        const now = Date.now();
        const timeDiff = (now - download.lastUpdate) / 1000; // segundos
        const bytesDiff = receivedBytes - download.lastBytes;
        
        if (timeDiff >= 0.5) { // Actualizar cada 500ms
            const bytesPerSecond = bytesDiff / timeDiff;
            const speed = this.formatSpeed(bytesPerSecond);
            
            let eta = '--';
            if (bytesPerSecond > 0 && totalBytes > 0) {
                const remainingBytes = totalBytes - receivedBytes;
                const secondsRemaining = remainingBytes / bytesPerSecond;
                eta = this.formatTime(secondsRemaining);
            }
            
            // Actualizar datos
            download.data.receivedBytes = receivedBytes;
            download.data.progress = progress;
            download.data.speed = speed;
            download.data.eta = eta;
            download.data.status = item.isPaused() ? 'paused' : 'downloading';
            download.data.isPaused = item.isPaused();
            download.lastUpdate = now;
            download.lastBytes = receivedBytes;
            
            // Broadcast actualización
            this.broadcastToAll('download-progress', download.data);
        }
    }

    handleDownloadDone(downloadId, item, state) {
        const download = this.downloads.get(downloadId);
        if (!download) return;
        
        download.data.endTime = Date.now();
        download.data.receivedBytes = item.getTotalBytes();
        download.data.progress = 100;
        
        if (state === 'completed') {
            download.data.status = 'completed';
            download.data.speed = '--';
            download.data.eta = '--';
            
            log.info(`✅ [${downloadId}] Descarga completada: ${download.data.filename}`);
            
            // Agregar al historial
            this.addToHistory(download.data);
            
            // Broadcast completado
            this.broadcastToAll('download-completed', download.data);
            
        } else if (state === 'cancelled') {
            download.data.status = 'cancelled';
            log.info(`❌ [${downloadId}] Descarga cancelada: ${download.data.filename}`);
            this.broadcastToAll('download-cancelled', download.data);
            
        } else if (state === 'interrupted') {
            download.data.status = 'error';
            download.data.error = 'Descarga interrumpida';
            log.error(`⚠️ [${downloadId}] Descarga interrumpida: ${download.data.filename}`);
            this.broadcastToAll('download-error', download.data);
        }
        
        // Eliminar de descargas activas después de 3 segundos
        setTimeout(() => {
            this.downloads.delete(downloadId);
        }, 3000);
    }

    addToHistory(downloadData) {
        // Agregar al inicio del historial
        this.downloadHistory.unshift({...downloadData});
        
        // Limitar a 100 elementos
        if (this.downloadHistory.length > 100) {
            this.downloadHistory = this.downloadHistory.slice(0, 100);
        }
        
        this.saveDownloadHistory();
    }

    getDownloadsPath() {
        try {
            const configPath = path.join(app.getPath('userData'), 'nexa-config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.customDownloadsPath && fs.existsSync(config.customDownloadsPath)) {
                    return config.customDownloadsPath;
                }
            }
        } catch (error) {
            log.error('Error leyendo ruta personalizada:', error);
        }
        return this.downloadsFolder;
    }

    broadcastToAll(channel, data) {
        const { webContents } = require('electron');
        webContents.getAllWebContents().forEach(wc => {
            if (!wc.isDestroyed()) {
                wc.send(channel, data);
            }
        });
    }

    setupIPCHandlers() {
        // Obtener lista de descargas activas
        ipcMain.handle('downloads:get-active', async () => {
            const activeDownloads = Array.from(this.downloads.values()).map(d => d.data);
            return { success: true, downloads: activeDownloads };
        });
        
        // Obtener historial
        ipcMain.handle('downloads:get-history', async () => {
            return { success: true, history: this.downloadHistory };
        });
        
        // Pausar descarga
        ipcMain.handle('downloads:pause', async (event, downloadId) => {
            const download = this.downloads.get(downloadId);
            if (download && download.item.canResume()) {
                download.item.pause();
                log.info(`⏸️ Descarga pausada: ${downloadId}`);
                return { success: true };
            }
            return { success: false, error: 'No se puede pausar' };
        });
        
        // Reanudar descarga
        ipcMain.handle('downloads:resume', async (event, downloadId) => {
            const download = this.downloads.get(downloadId);
            if (download && download.item.canResume()) {
                download.item.resume();
                log.info(`▶️ Descarga reanudada: ${downloadId}`);
                return { success: true };
            }
            return { success: false, error: 'No se puede reanudar' };
        });
        
        // Cancelar descarga
        ipcMain.handle('downloads:cancel', async (event, downloadId) => {
            const download = this.downloads.get(downloadId);
            if (download) {
                download.item.cancel();
                log.info(`🛑 Descarga cancelada: ${downloadId}`);
                return { success: true };
            }
            return { success: false, error: 'Descarga no encontrada' };
        });
        
        // Abrir archivo
        ipcMain.handle('downloads:open-file', async (event, downloadId) => {
            const download = this.downloadHistory.find(d => d.id === downloadId);
            if (download && fs.existsSync(download.filePath)) {
                await shell.openPath(download.filePath);
                return { success: true };
            }
            return { success: false, error: 'Archivo no encontrado' };
        });
        
        // Mostrar en carpeta
        ipcMain.handle('downloads:show-in-folder', async (event, downloadId) => {
            const download = this.downloadHistory.find(d => d.id === downloadId);
            if (download && fs.existsSync(download.filePath)) {
                shell.showItemInFolder(download.filePath);
                return { success: true };
            }
            return { success: false, error: 'Archivo no encontrado' };
        });
        
        // Limpiar historial
        ipcMain.handle('downloads:clear-history', async () => {
            this.downloadHistory = [];
            this.saveDownloadHistory();
            log.info('🗑️ Historial de descargas limpiado');
            return { success: true };
        });
        
        // Eliminar del historial
        ipcMain.handle('downloads:remove-from-history', async (event, downloadId) => {
            const index = this.downloadHistory.findIndex(d => d.id === downloadId);
            if (index !== -1) {
                this.downloadHistory.splice(index, 1);
                this.saveDownloadHistory();
                return { success: true };
            }
            return { success: false };
        });
        
        // Abrir carpeta de descargas
        ipcMain.handle('downloads:open-folder', async () => {
            const downloadsPath = this.getDownloadsPath();
            await shell.openPath(downloadsPath);
            return { success: true };
        });
        
        // Seleccionar carpeta personalizada
        ipcMain.handle('downloads:select-folder', async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory'],
                title: 'Seleccionar carpeta de descargas',
                buttonLabel: 'Seleccionar'
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
                const selectedPath = result.filePaths[0];
                
                try {
                    const configPath = path.join(app.getPath('userData'), 'nexa-config.json');
                    let config = {};
                    if (fs.existsSync(configPath)) {
                        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    }
                    config.customDownloadsPath = selectedPath;
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    
                    log.info('📂 Nueva carpeta de descargas:', selectedPath);
                    return { success: true, path: selectedPath };
                } catch (error) {
                    log.error('Error guardando carpeta:', error);
                    return { success: false, error: error.message };
                }
            }
            return { success: false, cancelled: true };
        });
        
        // Obtener ruta actual
        ipcMain.handle('downloads:get-path', async () => {
            const downloadsPath = this.getDownloadsPath();
            return { success: true, path: downloadsPath };
        });

        // Guardar URL como... (mostrar diálogo y forzar ruta de guardado)
        ipcMain.handle('downloads:save-url-as', async (event, payload) => {
            try {
                const url = payload?.url;
                if (!url) return { success: false, error: 'URL requerida' };

                const suggested = payload?.defaultFilename || 'archivo';
                const filters = payload?.filters || [
                    { name: 'Imágenes', extensions: ['png','jpg','jpeg','webp','gif','bmp'] },
                    { name: 'Todos los archivos', extensions: ['*'] }
                ];
                const result = await dialog.showSaveDialog(mainWindow, {
                    defaultPath: suggested,
                    filters
                });
                if (result.canceled || !result.filePath) {
                    return { success: false, canceled: true };
                }

                // Registrar override por URL y disparar la descarga usando el mismo webContents
                this.savePathOverrides.set(url, result.filePath);
                try {
                    // Descargar con el sender para mantener cookies/sesión
                    const wc = event && event.sender;
                    if (wc && !wc.isDestroyed()) {
                        wc.downloadURL(url);
                    } else if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.downloadURL(url);
                    } else {
                        const { session } = require('electron');
                        session.defaultSession.downloadURL(url);
                    }
                } catch (e) {
                    this.savePathOverrides.delete(url);
                    return { success: false, error: e.message };
                }
                return { success: true, filePath: result.filePath };
            } catch (err) {
                return { success: false, error: err.message };
            }
        });
    }

    generateDownloadId() {
        return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    formatSpeed(bytesPerSecond) {
        if (bytesPerSecond >= 1024 * 1024) {
            return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s';
        } else if (bytesPerSecond >= 1024) {
            return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
        } else {
            return bytesPerSecond.toFixed(0) + ' B/s';
        }
    }

    formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.round(seconds % 60);
            return `${minutes}m ${secs}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }
}

// Inicializar DownloadManager globalmente
let downloadManager = null;

function setupDownloadsHandler() {
    downloadManager = new DownloadManager();
    global.downloadManager = downloadManager;
    log.info('✅ Sistema de descargas estilo Opera inicializado completamente');
}

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