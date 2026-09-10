// Preferencias locales del panel administrativo.
const ADMIN_BOTTOM_NAV_KEY = 'jr_admin_bottom_nav_v1';
const ADMIN_MESSAGE_TEMPLATE_KEY = 'jr_admin_cobranza_message_v1';
const ADMIN_BOTTOM_NAV_DEFAULT = ['stats', 'alumnos', 'cobranzas', 'batidos', 'calendario'];

const ADMIN_NAV_CATALOG = {
    stats: { label: 'Estadísticas', shortLabel: 'Stats', icon: 'chart' },
    alumnos: { label: 'Alumnos', shortLabel: 'Alumnos', icon: 'users' },
    cobranzas: { label: 'Cobranzas', shortLabel: 'Cobros', icon: 'cash' },
    batidos: { label: 'Caja y pagos', shortLabel: 'Caja', icon: 'wallet' },
    calendario: { label: 'Asistencia', shortLabel: 'Asistencia', icon: 'calendar' },
    scanner: { label: 'Scanner', shortLabel: 'Scanner', icon: 'camera' },
    rendimiento: { label: 'Rendimiento', shortLabel: 'Rendimiento', icon: 'ruler' },
    ranking: { label: 'Ranking', shortLabel: 'Ranking', icon: 'medal' },
    entrenadores: { label: 'Entrenadores', shortLabel: 'Equipo', icon: 'activity' },
    configuracion: { label: 'Configuración', shortLabel: 'Ajustes', icon: 'settings' }
};

const ADMIN_DEFAULT_MESSAGE_TEMPLATE = `Hola {apoderado} 👋 Te saluda la Academia JR Stars.

Te recordamos que la mensualidad de {alumno}, por S/ {monto}, {vencimiento}. Puedes pagar por Yape al 955 515 693 o en efectivo en la cancha.

Cuando realices el pago, envíanos la captura por aquí para registrarlo. ¡Gracias!

Atte. Edwin Iván Requejo Paredes`;

let deferredAdminInstallPrompt = null;

function readAdminPreference(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

function writeAdminPreference(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function getAdminBottomNavSelection() {
    try {
        const selection = JSON.parse(readAdminPreference(ADMIN_BOTTOM_NAV_KEY, 'null'));
        const valid = Array.isArray(selection)
            && selection.length === 5
            && new Set(selection).size === 5
            && selection.every(page => ADMIN_NAV_CATALOG[page]);
        return valid ? selection : [...ADMIN_BOTTOM_NAV_DEFAULT];
    } catch {
        return [...ADMIN_BOTTOM_NAV_DEFAULT];
    }
}

function bottomNavIcon(icon) {
    return `<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="../img/admin-icons.svg?v=20260909#${icon}"></use></svg>`;
}

function renderAdminBottomNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    nav.innerHTML = getAdminBottomNavSelection().map(page => {
        const item = ADMIN_NAV_CATALOG[page];
        return `<button class="bottom-nav-item" id="bnav-${page}" type="button" onclick="goTo('${page}', event)" aria-label="${item.label}">
            <span class="bnav-icon" aria-hidden="true">${bottomNavIcon(item.icon)}</span>
            <span class="bnav-label">${item.shortLabel}</span>
        </button>`;
    }).join('');

    if (typeof paginaActual !== 'undefined') setBottomNav(paginaActual);
    if (typeof setCobranzasNavState === 'function') setCobranzasNavState();
}

function renderAdminNavFields(selection = getAdminBottomNavSelection()) {
    const fields = document.getElementById('config-nav-fields');
    if (!fields) return;

    const options = Object.entries(ADMIN_NAV_CATALOG).map(([value, item]) => (
        `<option value="${value}">${item.label}</option>`
    )).join('');

    fields.innerHTML = selection.map((page, index) => `
        <label class="config-nav-field">
            <span>Posición ${index + 1}</span>
            <select data-config-nav-position="${index}">${options}</select>
        </label>`).join('');

    fields.querySelectorAll('[data-config-nav-position]').forEach((select, index) => {
        select.value = selection[index];
    });
}

function saveAdminBottomNav() {
    const selects = [...document.querySelectorAll('[data-config-nav-position]')];
    const selection = selects.map(select => select.value);
    if (selection.length !== 5 || new Set(selection).size !== selection.length) {
        showToast('Cada posición debe tener una sección diferente.', 'error');
        return;
    }
    if (!writeAdminPreference(ADMIN_BOTTOM_NAV_KEY, JSON.stringify(selection))) {
        showToast('No se pudo guardar el menú en este dispositivo.', 'error');
        return;
    }
    renderAdminBottomNav();
    showToast('Menú inferior actualizado.');
}

function resetAdminBottomNav() {
    writeAdminPreference(ADMIN_BOTTOM_NAV_KEY, JSON.stringify(ADMIN_BOTTOM_NAV_DEFAULT));
    renderAdminNavFields(ADMIN_BOTTOM_NAV_DEFAULT);
    renderAdminBottomNav();
    showToast('Menú inferior restaurado.');
}

function getCobranzaMessageTemplate() {
    return readAdminPreference(ADMIN_MESSAGE_TEMPLATE_KEY, ADMIN_DEFAULT_MESSAGE_TEMPLATE)
        || ADMIN_DEFAULT_MESSAGE_TEMPLATE;
}

function fillCobranzaMessage(template, values) {
    return Object.entries(values).reduce(
        (message, [key, value]) => message.split(`{${key}}`).join(String(value ?? '')),
        template
    );
}

function buildCobranzaMessage(student, duePhrase) {
    const parsedAmount = Number(student?.tarifa_mensual ?? 80);
    const amount = Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : '80.00';
    return fillCobranzaMessage(getCobranzaMessageTemplate(), {
        apoderado: student?.parent_name || 'apoderado',
        alumno: student?.full_name || 'el alumno',
        monto: amount,
        vencimiento: duePhrase || 'está pendiente'
    });
}

function updateCobranzaMessagePreview() {
    const input = document.getElementById('config-message-template');
    const preview = document.getElementById('config-message-preview');
    if (!input || !preview) return;
    preview.textContent = fillCobranzaMessage(input.value, {
        apoderado: 'María',
        alumno: 'Diego Ramírez',
        monto: '80.00',
        vencimiento: 'vence mañana'
    });
}

function saveCobranzaMessageTemplate() {
    const input = document.getElementById('config-message-template');
    if (!input) return;
    const value = input.value.trim();
    if (!value) {
        showToast('Escribe un mensaje antes de guardarlo.', 'error');
        return;
    }
    if (!writeAdminPreference(ADMIN_MESSAGE_TEMPLATE_KEY, value)) {
        showToast('No se pudo guardar el mensaje.', 'error');
        return;
    }
    showToast('Mensaje de cobranza guardado.');
}

function resetCobranzaMessageTemplate() {
    const input = document.getElementById('config-message-template');
    if (!input) return;
    input.value = ADMIN_DEFAULT_MESSAGE_TEMPLATE;
    writeAdminPreference(ADMIN_MESSAGE_TEMPLATE_KEY, ADMIN_DEFAULT_MESSAGE_TEMPLATE);
    updateCobranzaMessagePreview();
    showToast('Mensaje original restaurado.');
}

function adminPwaIsInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateAdminPwaInstallUi() {
    const button = document.getElementById('config-pwa-install');
    const status = document.getElementById('config-pwa-status');
    const help = document.getElementById('config-pwa-help');
    if (!button || !status || !help) return;

    help.hidden = true;
    if (adminPwaIsInstalled()) {
        status.textContent = 'JR Admin ya está instalado en este dispositivo.';
        button.textContent = 'Aplicación instalada';
        button.disabled = true;
        return;
    }

    button.disabled = false;
    button.textContent = deferredAdminInstallPrompt ? 'Instalar aplicación' : 'Ver cómo instalar';
    status.textContent = 'Instala el panel para abrirlo como una aplicación y acceder más rápido.';
}

async function installAdminPwa() {
    const help = document.getElementById('config-pwa-help');
    if (adminPwaIsInstalled()) return;

    if (deferredAdminInstallPrompt) {
        deferredAdminInstallPrompt.prompt();
        const choice = await deferredAdminInstallPrompt.userChoice;
        deferredAdminInstallPrompt = null;
        updateAdminPwaInstallUi();
        if (choice.outcome === 'accepted') showToast('Instalación iniciada.');
        return;
    }

    if (!help) return;
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    help.textContent = isiOS
        ? 'En Safari toca Compartir y luego “Agregar a inicio”.'
        : 'Abre el menú del navegador y elige “Instalar aplicación” o “Agregar a pantalla de inicio”.';
    help.hidden = false;
}

function initAdminConfiguration() {
    renderAdminBottomNav();
    renderAdminNavFields();

    const messageInput = document.getElementById('config-message-template');
    if (messageInput) {
        messageInput.value = getCobranzaMessageTemplate();
        messageInput.addEventListener('input', updateCobranzaMessagePreview);
        updateCobranzaMessagePreview();
    }

    document.getElementById('config-nav-save')?.addEventListener('click', saveAdminBottomNav);
    document.getElementById('config-nav-reset')?.addEventListener('click', resetAdminBottomNav);
    document.getElementById('config-message-save')?.addEventListener('click', saveCobranzaMessageTemplate);
    document.getElementById('config-message-reset')?.addEventListener('click', resetCobranzaMessageTemplate);
    document.getElementById('config-pwa-install')?.addEventListener('click', installAdminPwa);
    updateAdminPwaInstallUi();
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredAdminInstallPrompt = event;
    updateAdminPwaInstallUi();
});

window.addEventListener('appinstalled', () => {
    deferredAdminInstallPrompt = null;
    updateAdminPwaInstallUi();
    showToast('JR Admin quedó instalado.');
});

initAdminConfiguration();
