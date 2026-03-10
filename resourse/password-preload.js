// resourse/password-preload.js
// Preload para inyectar gestor de contraseñas dentro de cada webview
// Se ejecuta en el contexto de la página (sin Node), con acceso al DOM

(function () {
    try {
        class PasswordManager {
            constructor() {
                this.passwords = this.loadPasswords();
                this.credentialListEl = null;
            }

            loadPasswords() {
                try {
                    const saved = localStorage.getItem('neza_passwords');
                    if (saved) return JSON.parse(saved);
                } catch (e) {}
                return {};
            }

            savePasswords() {
                try {
                    localStorage.setItem('neza_passwords', JSON.stringify(this.passwords));
                } catch (e) {}
            }

            addCredential(hostname, { username, email, password }) {
                if (!hostname) return;
                if (!this.passwords[hostname]) this.passwords[hostname] = [];
                const id = (username || email || '').trim();
                if (!id) return;
                const idx = this.passwords[hostname].findIndex(c => (c.username || c.email) === id);
                if (idx >= 0) {
                    const prev = this.passwords[hostname][idx];
                    // Actualizar password si viene uno no vacío
                    if (password && password !== prev.password) {
                        this.passwords[hostname][idx] = { username: prev.username || username || '', email: prev.email || email || '', password };
                        this.savePasswords();
                    }
                } else {
                    this.passwords[hostname].push({ username: username || '', email: email || '', password: password || '' });
                    this.savePasswords();
                }
            }

            getCredentials(hostname) {
                return this.passwords[hostname] || [];
            }

            autofill(hostname, form, anchorEl) {
                const creds = this.getCredentials(hostname);
                if (!creds || creds.length === 0) return;
                if (creds.length === 1) {
                    this.fillForm(form, creds[0]);
                } else {
                    this.showCredentialList(form, creds, anchorEl);
                }
            }

            fillForm(form, cred) {
                if (!form) return;
                const userField = form.querySelector('input[type="text"], input[type="email"], input[name*="user" i], input[name*="email" i], input[autocomplete="username" i]');
                const passField = form.querySelector('input[type="password"], input[autocomplete="current-password" i], input[autocomplete="new-password" i]');
                if (userField) userField.value = cred.username || cred.email || '';
                if (passField) passField.value = cred.password || '';
            }

            showCredentialList(form, creds, anchorEl) {
                this.removeCredentialList();
                const list = document.createElement('div');
                list.style.cssText = 'position:fixed;z-index:2147483647;background:#1f1f1f;color:#fff;padding:8px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);min-width:220px;border:1px solid #00D4AA;';

                creds.forEach(cred => {
                    const btn = document.createElement('button');
                    btn.textContent = cred.username || cred.email || '(sin usuario)';
                    btn.type = 'button';
                    btn.style.cssText = 'display:block;width:100%;margin:4px 0;background:#2a2a2a;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;text-align:left;';
                    btn.onmouseenter = () => btn.style.background = '#333';
                    btn.onmouseleave = () => btn.style.background = '#2a2a2a';
                    btn.onclick = () => {
                        this.fillForm(form, cred);
                        this.removeCredentialList();
                    };
                    list.appendChild(btn);
                });

                document.body.appendChild(list);
                this.credentialListEl = list;

                // Posicionar cerca del ancla (campo de password o usuario)
                const anchor = anchorEl || form.querySelector('input[type="password"], input[type="email"], input[type="text"]') || form;
                const rect = anchor.getBoundingClientRect();
                const top = Math.min(window.innerHeight - list.offsetHeight - 8, Math.max(8, rect.bottom + 6));
                const left = Math.min(window.innerWidth - list.offsetWidth - 8, Math.max(8, rect.left));
                list.style.top = `${top + window.scrollY}px`;
                list.style.left = `${left + window.scrollX}px`;

                // Cerrar al hacer clic fuera
                setTimeout(() => {
                    const onDocClick = (e) => {
                        if (!list.contains(e.target)) {
                            this.removeCredentialList();
                            document.removeEventListener('mousedown', onDocClick, true);
                            window.removeEventListener('blur', onDocClick, true);
                        }
                    };
                    document.addEventListener('mousedown', onDocClick, true);
                    window.addEventListener('blur', onDocClick, true);
                }, 0);
            }

            removeCredentialList() {
                if (this.credentialListEl && this.credentialListEl.parentNode) {
                    this.credentialListEl.parentNode.removeChild(this.credentialListEl);
                }
                this.credentialListEl = null;
            }
        }

        // Evitar múltiples inyecciones
        if (window.__nezaPasswordInjected) return;
        window.__nezaPasswordInjected = true;
        const manager = new PasswordManager();

        // Permite que el shell abra el selector desde el menú contextual
        window.__nezaShowPasswordPicker = () => {
            try {
                const hostname = window.location.hostname;
                const forms = Array.from(document.querySelectorAll('form'));
                const form = forms.find(f => f.querySelector('input[type="password"], input[autocomplete="current-password" i], input[autocomplete="new-password" i]'))
                    || forms.find(f => f.querySelector('input[type="email"], input[type="text"], input[name*="user" i], input[name*="email" i], input[autocomplete="username" i]'));

                if (!form) {
                    // No hay formulario que rellenar
                    const creds = manager.getCredentials(hostname);
                    return Array.isArray(creds) && creds.length > 0;
                }

                const anchor = form.querySelector('input[type="password"], input[autocomplete="current-password" i], input[autocomplete="new-password" i]')
                    || form.querySelector('input[type="email"], input[type="text"], input[name*="user" i], input[name*="email" i], input[autocomplete="username" i]');
                manager.autofill(hostname, form, anchor || form);
                return true;
            } catch (err) {
                console.error('❌ Error mostrando selector de contraseñas:', err);
                return false;
            }
        };

        function enhanceForms() {
            const hostname = window.location.hostname;
            document.querySelectorAll('form').forEach(form => {
                const passField = form.querySelector('input[type="password"], input[autocomplete="current-password" i], input[autocomplete="new-password" i]');
                const userField = form.querySelector('input[type="email"], input[type="text"], input[name*="user" i], input[name*="email" i], input[autocomplete="username" i]');
                // Procesar tanto formularios con contraseña como los de solo usuario/correo (paso 1)
                if (!passField && !userField) return;
                // Evitar duplicar botón
                if (form.__nezaAutofillSetup) return;
                form.__nezaAutofillSetup = true;

                const autofillBtn = document.createElement('button');
                autofillBtn.textContent = 'Autocompletar';
                autofillBtn.type = 'button';
                autofillBtn.style.cssText = 'margin-left:8px;background:#00D4AA;padding:4px 10px;border-radius:6px;border:none;color:#000;cursor:pointer;font-weight:600;';
                autofillBtn.onmouseenter = () => autofillBtn.style.filter = 'brightness(0.95)';
                autofillBtn.onmouseleave = () => autofillBtn.style.filter = '';
                autofillBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    manager.autofill(hostname, form, passField || userField || form);
                };

                // Insertar junto al campo apropiado (password si existe, si no usuario/email)
                const anchor = passField || userField;
                if (anchor && anchor.insertAdjacentElement) {
                    anchor.insertAdjacentElement('afterend', autofillBtn);
                } else if (anchor && anchor.parentNode) {
                    anchor.parentNode.appendChild(autofillBtn);
                }

                // Mostrar sugerencias automáticamente al enfocar si hay credenciales guardadas
                if (anchor) {
                    anchor.addEventListener('focus', () => {
                        try {
                            const creds = manager.getCredentials(hostname);
                            if (creds && creds.length > 0) {
                                manager.autofill(hostname, form, anchor);
                            }
                        } catch(_){}
                    }, true);
                }

                // Guardar credenciales en submit
                form.addEventListener('submit', () => {
                    const uf = form.querySelector('input[type="text"], input[type="email"], input[name*="user" i], input[name*="email" i], input[autocomplete="username" i]');
                    const username = uf && uf.type !== 'email' ? (uf.value || '') : '';
                    const email = uf && uf.type === 'email' ? (uf.value || '') : '';
                    const password = (passField && passField.value) || '';
                    const idVal = username || email || '';
                    if (idVal && !password) {
                        // Paso 1 (solo correo/usuario). Guardar identificador y recordar para el siguiente paso.
                        try { sessionStorage.setItem('neza_pm_last_identifier', idVal); } catch(_){}
                        manager.addCredential(hostname, { username, email, password: '' });
                    } else if (password) {
                        // Paso con contraseña. Usar identificador del propio form o el previo.
                        let idFromPrev = '';
                        try { idFromPrev = sessionStorage.getItem('neza_pm_last_identifier') || ''; } catch(_){}
                        const user = username || (idFromPrev && !email ? idFromPrev : '');
                        const mail = email || (idFromPrev && idFromPrev.includes('@') ? idFromPrev : '');
                        manager.addCredential(hostname, { username: user, email: mail, password });
                        try { sessionStorage.removeItem('neza_pm_last_identifier'); } catch(_){}
                    }
                }, true);
            });
        }

        // Observador para formularios inyectados dinámicamente (SPAs)
        const mo = new MutationObserver(() => enhanceForms());
        mo.observe(document.documentElement, { childList: true, subtree: true });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', enhanceForms, { once: true });
        } else {
            enhanceForms();
        }

        // Reintentos por si la página tarda en pintar formularios
        let attempts = 0;
        const retry = setInterval(() => {
            attempts++;
            enhanceForms();
            if (attempts > 5) clearInterval(retry);
        }, 1000);

        console.log('🔐 Neza Password Manager inyectado en webview');

        // Bloquear menú contextual nativo en videos y en YouTube para evitar doble menú
        document.addEventListener('contextmenu', (e) => {
            try {
                const host = (location && location.host || '').toLowerCase();
                const isYoutubeHost = host.includes('youtube.com') || host.includes('youtu.be') || host.includes('youtube-nocookie.com') || host.includes('googlevideo.com');
                const path = e.composedPath ? e.composedPath() : [];
                const isVideoTarget = (e.target && e.target.tagName === 'VIDEO') || path.some(node => node && node.tagName === 'VIDEO');

                if (isYoutubeHost || isVideoTarget) {
                    e.preventDefault();
                }
            } catch (_) {}
        }, true);
    } catch (err) {
        console.error('❌ Error inyectando Password Manager:', err);
    }
})();
