// password-manager.js
// Gestor de contraseñas para Neza GX Pro
// Guarda, autocompleta y muestra lista de usuarios/email/contraseña por sitio

class PasswordManager {
    constructor() {
        // Estructura: { hostname: [ { username, email, password } ] }
        this.passwords = this.loadPasswords();
    }

    loadPasswords() {
        try {
            const saved = localStorage.getItem('neza_passwords');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return {};
    }

    savePasswords() {
        localStorage.setItem('neza_passwords', JSON.stringify(this.passwords));
    }

    addCredential(hostname, { username, email, password }) {
        if (!this.passwords[hostname]) this.passwords[hostname] = [];
        this.passwords[hostname].push({ username, email, password });
        this.savePasswords();
    }

    getCredentials(hostname) {
        return this.passwords[hostname] || [];
    }

    autofill(hostname, form) {
        const creds = this.getCredentials(hostname);
        if (creds.length === 0) return;
        // Si hay más de una credencial, mostrar lista para elegir
        if (creds.length === 1) {
            this.fillForm(form, creds[0]);
        } else {
            this.showCredentialList(form, creds);
        }
    }

    fillForm(form, cred) {
        // Buscar campos típicos
        const userField = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]');
        const passField = form.querySelector('input[type="password"]');
        if (userField) userField.value = cred.username || cred.email || '';
        if (passField) passField.value = cred.password || '';
    }

    showCredentialList(form, creds) {
        // Crear lista flotante para elegir credencial
        let list = document.createElement('div');
        list.style.cssText = 'position:absolute;z-index:9999;background:#222;color:#fff;padding:8px;border-radius:6px;box-shadow:0 2px 8px #0008;';
        creds.forEach((cred, i) => {
            let btn = document.createElement('button');
            btn.textContent = cred.username || cred.email;
            btn.style.cssText = 'display:block;width:100%;margin:2px 0;background:#333;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;';
            btn.onclick = () => {
                this.fillForm(form, cred);
                list.remove();
            };
            list.appendChild(btn);
        });
        form.appendChild(list);
    }
}

window.nezaPasswordManager = new PasswordManager();

// Detectar formularios de login y activar autofill
window.addEventListener('DOMContentLoaded', () => {
    const hostname = window.location.hostname;
    document.querySelectorAll('form').forEach(form => {
        const passField = form.querySelector('input[type="password"]');
        if (passField) {
            // Botón para autocompletar
            let autofillBtn = document.createElement('button');
            autofillBtn.textContent = 'Autocompletar';
            autofillBtn.type = 'button';
            autofillBtn.style.cssText = 'margin-left:8px;background:#0da;padding:4px 10px;border-radius:4px;border:none;color:#fff;cursor:pointer;';
            autofillBtn.onclick = () => {
                window.nezaPasswordManager.autofill(hostname, form);
            };
            passField.parentNode.appendChild(autofillBtn);
        }
    });
});

// Guardar credenciales al enviar formulario
window.addEventListener('submit', (e) => {
    const form = e.target;
    const passField = form.querySelector('input[type="password"]');
    if (passField) {
        const userField = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]');
        const username = userField ? userField.value : '';
        const email = userField && userField.type === 'email' ? userField.value : '';
        const password = passField.value;
        const hostname = window.location.hostname;
        window.nezaPasswordManager.addCredential(hostname, { username, email, password });
    }
}, true);
