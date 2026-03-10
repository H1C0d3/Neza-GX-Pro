/* ============================================
    NEZA GX PRO - PANEL DE PERSONALIZACIÓN
   Interfaz visual estilo Opera GX
============================================ */

class PersonalizationPanel {
    constructor() {
        this.panel = null;
        this.isOpen = false;
        this.init();
    }

    init() {
        this.createPanel();
        this.setupEventListeners();
    }

    createPanel() {
        this.panel = document.createElement('div');
        this.panel.className = 'personalization-panel';
        this.panel.id = 'personalization-panel';
        this.panel.innerHTML = this.getPanelHTML();
        document.body.appendChild(this.panel);
    }

    getPanelHTML() {
        return `
            <div class="personalization-overlay" onclick="window.personalizationPanel.close()"></div>
            <div class="personalization-content">
                <div class="panel-header">
                    <h2>🎨 Personalizar Neza GX Pro</h2>
                    <button class="close-panel" onclick="window.personalizationPanel.close()">×</button>
                </div>
                
                <div class="panel-sections">
                    <!-- Temas -->
                    <section class="panel-section">
                        <h3>🎯 Temas</h3>
                        <div class="theme-grid">
                            <div class="theme-option" data-theme="neza_dark" onclick="window.personalizationPanel.selectTheme('neza_dark')">
                                <div class="theme-preview" style="background: linear-gradient(135deg, #1a1a1a, #2d2d2d); border: 2px solid #00D4AA;"></div>
                                <span>Neza Dark</span>
                            </div>
                            <div class="theme-option" data-theme="neza_light" onclick="window.personalizationPanel.selectTheme('neza_light')">
                                <div class="theme-preview" style="background: linear-gradient(135deg, #ffffff, #f5f5f5); border: 2px solid #00D4AA;"></div>
                                <span>Neza Light</span>
                            </div>
                            <div class="theme-option" data-theme="neza_gx_cyan" onclick="window.personalizationPanel.selectTheme('neza_gx_cyan')">
                                <div class="theme-preview" style="background: linear-gradient(135deg, #000000, #00D4AA); border: 2px solid #00D4AA; box-shadow: 0 0 10px #00D4AA;"></div>
                                <span>GX Cyan</span>
                            </div>
                            <div class="theme-option" data-theme="neza_gx_purple" onclick="window.personalizationPanel.selectTheme('neza_gx_purple')">
                                <div class="theme-preview" style="background: linear-gradient(135deg, #0a0a0a, #aa00ff); border: 2px solid #aa00ff; box-shadow: 0 0 10px #aa00ff;"></div>
                                <span>GX Purple</span>
                            </div>
                            <div class="theme-option" data-theme="neza_gx_red" onclick="window.personalizationPanel.selectTheme('neza_gx_red')">
                                <div class="theme-preview" style="background: linear-gradient(135deg, #000000, #ff2a2a); border: 2px solid #ff2a2a; box-shadow: 0 0 10px #ff2a2a;"></div>
                                <span>GX Red</span>
                            </div>
                        </div>
                    </section>
                    
                    <!-- Color de Acento -->
                    <section class="panel-section">
                        <h3>🌈 Color de Acento</h3>
                        <div class="color-picker-container">
                            <input type="color" id="accent-color-picker" value="#00D4AA" 
                                   onchange="window.personalizationPanel.changeAccentColor(this.value)">
                            <div class="color-presets">
                                <div class="color-preset" style="background: #00D4AA" onclick="window.personalizationPanel.changeAccentColor('#00D4AA')" title="Neza Cyan"></div>
                                <div class="color-preset" style="background: #aa00ff" onclick="window.personalizationPanel.changeAccentColor('#aa00ff')" title="Purple"></div>
                                <div class="color-preset" style="background: #ff2a2a" onclick="window.personalizationPanel.changeAccentColor('#ff2a2a')" title="Red"></div>
                                <div class="color-preset" style="background: #00aaff" onclick="window.personalizationPanel.changeAccentColor('#00aaff')" title="Blue"></div>
                                <div class="color-preset" style="background: #00ffaa" onclick="window.personalizationPanel.changeAccentColor('#00ffaa')" title="Green"></div>
                                <div class="color-preset" style="background: #ffaa00" onclick="window.personalizationPanel.changeAccentColor('#ffaa00')" title="Orange"></div>
                            </div>
                        </div>
                    </section>
                    
                    <!-- Fondos -->
                    <section class="panel-section">
                        <h3>🖼️ Fondo</h3>
                        <div class="background-grid">
                            <div class="bg-option" data-bg="default" onclick="window.personalizationPanel.selectBackground('default')">
                                <div class="bg-preview" style="background: #1a1a1a;"></div>
                                <span>Dark</span>
                            </div>
                            <div class="bg-option" data-bg="gradient_cyan" onclick="window.personalizationPanel.selectBackground('gradient_cyan')">
                                <div class="bg-preview" style="background: linear-gradient(135deg, #000000, #00D4AA);"></div>
                                <span>Neza Gradient</span>
                            </div>
                            <div class="bg-option" data-bg="particles" onclick="window.personalizationPanel.selectBackground('particles')">
                                <div class="bg-preview" style="background: #1a1a1a; position: relative;">
                                    <div style="position: absolute; width: 4px; height: 4px; background: #00D4AA; border-radius: 50%; top: 20%; left: 30%;"></div>
                                    <div style="position: absolute; width: 3px; height: 3px; background: #00D4AA; border-radius: 50%; top: 60%; left: 70%;"></div>
                                    <div style="position: absolute; width: 2px; height: 2px; background: #00D4AA; border-radius: 50%; top: 40%; left: 50%;"></div>
                                </div>
                                <span>Particles</span>
                            </div>
                        </div>
                    </section>
                    
                    <!-- Efectos RGB -->
                    <section class="panel-section">
                        <h3>💡 Efectos RGB</h3>
                        <div class="toggle-option">
                            <label>Habilitar efectos RGB</label>
                            <label class="switch">
                                <input type="checkbox" id="rgb-toggle" onchange="window.personalizationPanel.toggleRGB(this.checked)">
                                <span class="slider"></span>
                            </label>
                        </div>
                        
                        <div class="rgb-effects-grid" id="rgb-effects">
                            <div class="effect-option" data-effect="pulse" onclick="window.personalizationPanel.selectEffect('pulse')">
                                <div class="effect-preview" style="background: #00D4AA; animation: pulse-preview 2s infinite;"></div>
                                <span>Pulse</span>
                            </div>
                            <div class="effect-option" data-effect="breathing" onclick="window.personalizationPanel.selectEffect('breathing')">
                                <div class="effect-preview" style="background: #00D4AA; animation: breathing-preview 3s infinite;"></div>
                                <span>Breathing</span>
                            </div>
                            <div class="effect-option" data-effect="static" onclick="window.personalizationPanel.selectEffect('static')">
                                <div class="effect-preview" style="background: #00D4AA;"></div>
                                <span>Static</span>
                            </div>
                        </div>
                    </section>
                    
                    <!-- Sonidos -->
                    <section class="panel-section">
                        <h3>🔊 Sonidos</h3>
                        <div class="sound-options">
                            <div class="toggle-option">
                                <label>Efectos de sonido</label>
                                <label class="switch">
                                    <input type="checkbox" id="sounds-toggle" checked 
                                           onchange="window.personalizationPanel.toggleSounds(this.checked)">
                                    <span class="slider"></span>
                                </label>
                            </div>
                            
                            <div class="sound-pack-selector">
                                <label>🎵 Pack de sonidos</label>
                                <div class="sound-pack-grid">
                                    <div class="sound-pack-option active" data-pack="modern" onclick="window.personalizationPanel.selectSoundPack('modern')">
                                        <div class="pack-preview">🎵</div>
                                        <span>Moderno</span>
                                    </div>
                                    <div class="sound-pack-option" data-pack="classic" onclick="window.personalizationPanel.selectSoundPack('classic')">
                                        <div class="pack-preview">🔔</div>
                                        <span>Clásico</span>
                                    </div>
                                    <div class="sound-pack-option" data-pack="gaming" onclick="window.personalizationPanel.selectSoundPack('gaming')">
                                        <div class="pack-preview">🎮</div>
                                        <span>Gaming</span>
                                    </div>
                                    <div class="sound-pack-option" data-pack="minimal" onclick="window.personalizationPanel.selectSoundPack('minimal')">
                                        <div class="pack-preview">🔇</div>
                                        <span>Minimal</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="volume-control">
                                <label>🔊 Volumen</label>
                                <input type="range" id="volume-slider" min="0" max="100" value="50" 
                                       oninput="window.personalizationPanel.changeVolume(this.value)">
                                <span class="volume-value">50%</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;
    }

    open() {
        this.panel.classList.add('open');
        this.isOpen = true;
        document.body.style.overflow = 'hidden';
        window.nezaPersonalization?.soundManager.playSound('success');
    }

    close() {
        this.panel.classList.remove('open');
        this.isOpen = false;
        document.body.style.overflow = '';
    }

    selectTheme(themeId) {
        window.nezaPersonalization?.applyTheme(themeId);
        this.updateActiveTheme(themeId);
        window.nezaPersonalization?.soundManager.playSound('click');
    }

    changeAccentColor(color) {
        window.nezaPersonalization?.setAccentColor(color);
        document.getElementById('accent-color-picker').value = color;
        window.nezaPersonalization?.soundManager.playSound('click');
    }

    selectBackground(bgId) {
        window.nezaPersonalization?.backgroundManager.setBackground(bgId);
        window.nezaPersonalization?.soundManager.playSound('click');
    }

    toggleRGB(enabled) {
        if (enabled) {
            window.nezaPersonalization?.rgbManager.enable();
        } else {
            window.nezaPersonalization?.rgbManager.disable();
        }
        
        const effectsGrid = document.getElementById('rgb-effects');
        effectsGrid.style.opacity = enabled ? '1' : '0.5';
        effectsGrid.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    selectEffect(effectId) {
        if (window.nezaPersonalization?.rgbManager) {
            window.nezaPersonalization.rgbManager.currentEffect = effectId;
            window.nezaPersonalization.rgbManager.applyCurrentEffect();
        }
        
        this.updateActiveEffect(effectId);
        window.nezaPersonalization?.soundManager.playSound('click');
    }

    toggleSounds(enabled) {
        if (window.nezaPersonalization?.soundManager) {
            window.nezaPersonalization.soundManager.toggleEnabled(enabled);
        }
    }

    selectSoundPack(packName) {
        window.nezaPersonalization?.soundManager.setSoundPack(packName);
        
        // Actualizar visual
        document.querySelectorAll('.sound-pack-option').forEach(option => {
            option.classList.remove('active');
        });
        document.querySelector(`[data-pack="${packName}"]`)?.classList.add('active');
    }

    changeVolume(level) {
        window.nezaPersonalization?.soundManager.setVolume(level / 100);
        document.querySelector('.volume-value').textContent = level + '%';
    }

    updateActiveTheme(themeId) {
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('active');
        });
        document.querySelector(`[data-theme="${themeId}"]`)?.classList.add('active');
    }

    updateActiveEffect(effectId) {
        document.querySelectorAll('.effect-option').forEach(option => {
            option.classList.remove('active');
        });
        document.querySelector(`[data-effect="${effectId}"]`)?.classList.add('active');
    }

    setupEventListeners() {
        // Ya no es necesario, los eventos están en el HTML
    }
}

// Inicializar panel cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.personalizationPanel = new PersonalizationPanel();
    });
} else {
    window.personalizationPanel = new PersonalizationPanel();
}
