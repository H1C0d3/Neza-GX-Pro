/* ============================================
    NEZA GX PRO - SISTEMA DE PERSONALIZACIÓN
   Inspirado en Opera/Opera GX
   Temas, RGB, Sonidos, Fondos Animados
============================================ */

// 🎨 GESTOR PRINCIPAL DE PERSONALIZACIÓN
class NezaPersonalization {
    constructor() {
        this.currentTheme = 'neza_dark';
        this.userSettings = {
            theme: 'neza_dark',
            accentColor: '#00D4AA',
            background: 'default',
            sounds: true,
            keyboardSounds: false,
            animations: true,
            rgbEffects: false,
            cornerStyle: 'rounded',
            layout: 'compact'
        };
        
        this.themes = new Map();
        this.themeManager = new ThemeManager();
        this.soundManager = new SoundManager();
        this.backgroundManager = new BackgroundManager();
        this.rgbManager = new RGBEffectManager();
        
        this.init();
    }

    async init() {
        await this.loadThemes();
        await this.loadUserSettings();
        this.applyCurrentTheme();
        this.setupEventListeners();
        this.soundManager.loadKeyboardSoundsPreference();
    }

    async loadThemes() {
        // Tema Neza Dark (por defecto)
        this.themes.set('neza_dark', {
            name: 'Neza Dark',
            colors: {
                primary: '#1a1a1a',
                secondary: '#2d2d2d',
                accent: '#00D4AA',
                text: '#ffffff',
                textSecondary: '#b3b3b3',
                border: '#404040'
            },
            sounds: 'default',
            animations: 'smooth'
        });

        // Tema Neza Light
        this.themes.set('neza_light', {
            name: 'Neza Light',
            colors: {
                primary: '#ffffff',
                secondary: '#f5f5f5',
                accent: '#00D4AA',
                text: '#333333',
                textSecondary: '#666666',
                border: '#e0e0e0'
            },
            sounds: 'light',
            animations: 'subtle'
        });

        // Tema Neza GX Cyan
        this.themes.set('neza_gx_cyan', {
            name: 'Neza GX Cyan',
            colors: {
                primary: '#000000',
                secondary: '#1a1a1a',
                accent: '#00D4AA',
                text: '#ffffff',
                textSecondary: '#cccccc',
                border: '#00D4AA'
            },
            sounds: 'gaming',
            animations: 'dynamic',
            rgbEnabled: true
        });

        // Tema Neza GX Purple
        this.themes.set('neza_gx_purple', {
            name: 'Neza GX Purple',
            colors: {
                primary: '#0a0a0a',
                secondary: '#1a0a1a',
                accent: '#aa00ff',
                text: '#ffffff',
                textSecondary: '#cccccc',
                border: '#aa00ff'
            },
            sounds: 'gaming',
            animations: 'dynamic',
            rgbEnabled: true
        });

        // Tema Neza GX Red
        this.themes.set('neza_gx_red', {
            name: 'Neza GX Red',
            colors: {
                primary: '#000000',
                secondary: '#1a1a1a',
                accent: '#ff2a2a',
                text: '#ffffff',
                textSecondary: '#cccccc',
                border: '#ff2a2a'
            },
            sounds: 'gaming',
            animations: 'dynamic',
            rgbEnabled: true
        });
    }

    async loadUserSettings() {
        const saved = localStorage.getItem('neza-personalization');
        if (saved) {
            this.userSettings = { ...this.userSettings, ...JSON.parse(saved) };
        }
    }

    applyCurrentTheme() {
        const theme = this.themes.get(this.userSettings.theme);
        if (theme) {
            this.themeManager.applyTheme(theme);
        }
    }

    setupEventListeners() {
        // Atajo de teclado para abrir panel (Ctrl+Shift+P)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                window.personalizationPanel?.open();
            }
        });
    }

    applyTheme(themeId) {
        const theme = this.themes.get(themeId);
        if (!theme) return;

        this.themeManager.applyTheme(theme);
        this.userSettings.theme = themeId;
        
        if (theme.rgbEnabled) {
            this.rgbManager.enable();
        }
        
        this.saveSettings();
    }

    setAccentColor(color) {
        document.documentElement.style.setProperty('--neza-primary', color);
        this.userSettings.accentColor = color;
        this.saveSettings();
    }

    saveSettings() {
        localStorage.setItem('neza-personalization', JSON.stringify(this.userSettings));
    }
}

// 🎨 GESTOR DE TEMAS Y COLORES
class ThemeManager {
    constructor() {
        this.cssVariables = new Map();
    }

    applyTheme(themeData) {
        const root = document.documentElement;
        
        // Aplicar colores
        if (themeData.colors) {
            root.style.setProperty('--primary-bg', themeData.colors.primary);
            root.style.setProperty('--secondary-bg', themeData.colors.secondary);
            root.style.setProperty('--neza-primary', themeData.colors.accent);
            root.style.setProperty('--text-primary', themeData.colors.text);
            root.style.setProperty('--text-secondary', themeData.colors.textSecondary);
            root.style.setProperty('--border-color', themeData.colors.border);
        }

        // Aplicar animaciones
        this.applyAnimations(themeData.animations);
        
        // Guardar tema
        document.body.setAttribute('data-theme', themeData.name);
    }

    applyAnimations(animationType) {
        const root = document.documentElement;
        
        switch (animationType) {
            case 'smooth':
                root.style.setProperty('--animation-timing', 'cubic-bezier(0.4, 0, 0.2, 1)');
                root.style.setProperty('--animation-duration', '0.3s');
                break;
            case 'dynamic':
                root.style.setProperty('--animation-timing', 'cubic-bezier(0.34, 1.56, 0.64, 1)');
                root.style.setProperty('--animation-duration', '0.4s');
                break;
            case 'subtle':
                root.style.setProperty('--animation-timing', 'ease-out');
                root.style.setProperty('--animation-duration', '0.2s');
                break;
        }
    }
}

// 🔊 GESTOR DE SONIDOS MEJORADO
class SoundManager {
    constructor() {
        this.sounds = new Map();
        this.isMuted = false;
        this.volume = 0.5;
        this.enabled = true;
        this.keyboardSoundsEnabled = false;
        this.currentSoundPack = 'modern'; // modern, classic, gaming, minimal
        this.audioContext = null;
        this.loadSoundPacks();
    }

    loadSoundPacks() {
        // Pack Moderno (por defecto)
        this.soundPacks = {
            modern: {
                click: { freq: 800, duration: 0.05, type: 'sine' },
                hover: { freq: 600, duration: 0.03, type: 'sine' },
                success: { freq: 1000, duration: 0.1, type: 'sine' },
                error: { freq: 200, duration: 0.15, type: 'sawtooth' }
            },
            classic: {
                click: { freq: 440, duration: 0.08, type: 'square' },
                hover: { freq: 330, duration: 0.04, type: 'square' },
                success: { freq: 880, duration: 0.12, type: 'square' },
                error: { freq: 110, duration: 0.2, type: 'square' }
            },
            gaming: {
                click: { freq: 1200, duration: 0.06, type: 'sawtooth' },
                hover: { freq: 900, duration: 0.03, type: 'triangle' },
                success: { freq: 1600, duration: 0.15, type: 'triangle' },
                error: { freq: 150, duration: 0.2, type: 'sawtooth' }
            },
            minimal: {
                click: { freq: 500, duration: 0.03, type: 'sine' },
                hover: { freq: 400, duration: 0.02, type: 'sine' },
                success: { freq: 700, duration: 0.08, type: 'sine' },
                error: { freq: 250, duration: 0.1, type: 'sine' }
            }
        };
    }

    getAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioContext;
    }

    playSound(soundName, options = {}) {
        if (this.isMuted || !this.enabled) return;
        
        const soundPack = this.soundPacks[this.currentSoundPack];
        const soundConfig = soundPack[soundName];
        
        if (!soundConfig) return;

        try {
            const audioContext = this.getAudioContext();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = soundConfig.type;
            oscillator.frequency.value = soundConfig.freq;
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            gainNode.gain.value = this.volume * 0.3 * (options.volume || 1);
            
            const now = audioContext.currentTime;
            oscillator.start(now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + soundConfig.duration);
            oscillator.stop(now + soundConfig.duration);
        } catch (e) {
            console.log('Sound play failed:', e);
        }
    }

    // 🎹 Sonidos de teclas tipo máquina de escribir
    playTypewriterSound() {
        if (!this.keyboardSoundsEnabled || this.isMuted) return;

        try {
            const audioContext = this.getAudioContext();
            
            // Sonido principal de la tecla
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'sine';
            // Variación aleatoria para sonar más realista
            oscillator.frequency.value = 800 + Math.random() * 200;
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            const now = audioContext.currentTime;
            gainNode.gain.value = this.volume * 0.2;
            
            oscillator.start(now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
            oscillator.stop(now + 0.04);
            
            // Sonido de "clack" adicional para simular retorno mecánico
            setTimeout(() => {
                const clackOsc = audioContext.createOscillator();
                const clackGain = audioContext.createGain();
                
                clackOsc.type = 'square';
                clackOsc.frequency.value = 100 + Math.random() * 50;
                
                clackOsc.connect(clackGain);
                clackGain.connect(audioContext.destination);
                
                const clackNow = audioContext.currentTime;
                clackGain.gain.value = this.volume * 0.1;
                
                clackOsc.start(clackNow);
                clackGain.gain.exponentialRampToValueAtTime(0.01, clackNow + 0.02);
                clackOsc.stop(clackNow + 0.02);
            }, 5);
            
        } catch (e) {
            console.log('Typewriter sound failed:', e);
        }
    }

    setupKeyboardSounds() {
        // Remover listener anterior si existe
        if (this.keyboardListener) {
            document.removeEventListener('keydown', this.keyboardListener);
        }

        this.keyboardListener = (e) => {
            if (!this.keyboardSoundsEnabled) return;
            
            // Ignorar combinaciones con modificadores
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            
            // Ignorar teclas especiales
            const specialKeys = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'];
            if (specialKeys.includes(e.key)) return;
            
            this.playTypewriterSound();
        };

        document.addEventListener('keydown', this.keyboardListener);
    }

    setSoundPack(packName) {
        if (this.soundPacks[packName]) {
            this.currentSoundPack = packName;
            this.playSound('click'); // Preview del nuevo pack
        }
    }

    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }

    toggleEnabled(enabled) {
        this.enabled = enabled;
    }

    toggleKeyboardSounds(enabled) {
        this.keyboardSoundsEnabled = enabled;
        if (enabled) {
            this.setupKeyboardSounds();
        }
        
        // Guardar preferencia
        localStorage.setItem('neza-keyboard-sounds', enabled);
    }

    loadKeyboardSoundsPreference() {
        const saved = localStorage.getItem('neza-keyboard-sounds');
        if (saved !== null) {
            this.keyboardSoundsEnabled = saved === 'true';
            if (this.keyboardSoundsEnabled) {
                this.setupKeyboardSounds();
            }
        }
    }
}

// 🖼️ GESTOR DE FONDOS
class BackgroundManager {
    constructor() {
        this.backgrounds = new Map();
        this.currentBackground = null;
        this.loadDefaultBackgrounds();
    }

    loadDefaultBackgrounds() {
        this.backgrounds.set('default', {
            type: 'color',
            value: '#1a1a1a',
            name: 'Dark Solid'
        });

        this.backgrounds.set('gradient_cyan', {
            type: 'gradient',
            value: 'linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #00D4AA 100%)',
            name: 'Neza Gradient'
        });

        this.backgrounds.set('particles', {
            type: 'animated',
            value: 'particles',
            name: 'Floating Particles'
        });
    }

    setBackground(backgroundId) {
        const background = this.backgrounds.get(backgroundId);
        if (!background) return;

        this.currentBackground = background;
        this.applyBackground(background);
    }

    applyBackground(background) {
        const body = document.body;
        
        // Remover fondo anterior
        const oldBg = body.querySelector('.dynamic-background');
        if (oldBg) oldBg.remove();

        switch (background.type) {
            case 'color':
                body.style.background = background.value;
                break;
            case 'gradient':
                body.style.background = background.value;
                break;
            case 'animated':
                if (background.value === 'particles') {
                    this.createParticleBackground();
                }
                break;
        }
    }

    createParticleBackground() {
        const canvas = document.createElement('canvas');
        canvas.className = 'dynamic-background';
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            opacity: 0.3;
        `;
        
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const particles = [];
        const particleCount = 50;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        
        resize();
        window.addEventListener('resize', resize);

        // Crear partículas
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speedX: Math.random() * 0.5 - 0.25,
                speedY: Math.random() * 0.5 - 0.25
            });
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            particles.forEach(particle => {
                particle.x += particle.speedX;
                particle.y += particle.speedY;
                
                if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
                if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;
                
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fillStyle = '#00D4AA';
                ctx.fill();
            });
            
            requestAnimationFrame(animate);
        }
        
        animate();
    }
}

// 💡 GESTOR DE EFECTOS RGB
class RGBEffectManager {
    constructor() {
        this.isEnabled = false;
        this.currentEffect = 'pulse';
        this.animationFrame = null;
    }

    enable() {
        this.isEnabled = true;
        document.body.classList.add('rgb-effects-enabled');
        this.applyCurrentEffect();
    }

    disable() {
        this.isEnabled = false;
        document.body.classList.remove('rgb-effects-enabled');
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }

    applyCurrentEffect() {
        if (!this.isEnabled) return;

        switch (this.currentEffect) {
            case 'pulse':
                this.applyPulseEffect();
                break;
            case 'breathing':
                this.applyBreathingEffect();
                break;
            case 'static':
                this.applyStaticEffect();
                break;
        }
    }

    applyPulseEffect() {
        let phase = 0;

        const animate = () => {
            if (!this.isEnabled) return;
            
            const intensity = (Math.sin(phase) + 1) / 2;
            const hue = (Date.now() / 50) % 360;
            const color = `hsl(${hue}, 100%, ${50 + intensity * 25}%)`;
            
            document.documentElement.style.setProperty('--rgb-glow', color);
            
            phase += 0.05;
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        animate();
    }

    applyBreathingEffect() {
        let breathPhase = 0;

        const animate = () => {
            if (!this.isEnabled) return;
            
            const breath = (Math.sin(breathPhase) + 1) / 2;
            const alpha = 0.3 + (breath * 0.7);
            
            document.documentElement.style.setProperty('--rgb-glow', `rgba(0, 212, 170, ${alpha})`);
            
            breathPhase += 0.02;
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        animate();
    }

    applyStaticEffect() {
        document.documentElement.style.setProperty('--rgb-glow', 'var(--neza-primary)');
    }
}

// Inicializar sistema
window.nezaPersonalization = new NezaPersonalization();
console.log('🎨 Sistema de personalización Neza inicializado');
