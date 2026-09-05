// Cobranzas y recordatorios del panel administrativo.
const cobranzasById = new Map();
const COBRANZAS_ALERTS_ENABLED_KEY = 'jr_admin_cobranzas_alerts_enabled';
const COBRANZAS_LAST_ALERT_KEY = 'jr_admin_cobranzas_last_alert';
let adminServiceWorkerRegistration = null;

function escapeCobranzasHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function getCobranzasLimit() {
    const limit = new Date();
    limit.setDate(limit.getDate() + 2);
    return limit.toISOString().split('T')[0];
}

function getLocalDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function updateCobranzasAlertsUi() {
    const container = document.getElementById('cobranzas-alerts');
    const status = document.getElementById('cobranzas-alerts-status');
    const button = document.getElementById('cobranzas-alerts-button');
    if (!container || !status || !button) return;

    container.classList.remove('is-enabled', 'is-denied');
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        status.textContent = 'Este navegador no admite notificaciones de la PWA.';
        button.textContent = 'No disponible';
        button.disabled = true;
        return;
    }

    const enabled = Notification.permission === 'granted'
        && localStorage.getItem(COBRANZAS_ALERTS_ENABLED_KEY) === 'true';
    if (enabled) {
        container.classList.add('is-enabled');
        status.textContent = 'Activas. Revisaremos vencimientos al abrir o volver a la aplicación.';
        button.textContent = 'Alertas activas';
        button.disabled = true;
        return;
    }

    if (Notification.permission === 'denied') {
        container.classList.add('is-denied');
        status.textContent = 'El navegador bloqueó las notificaciones. Habilítalas desde los permisos del sitio.';
        button.textContent = 'Bloqueadas';
        button.disabled = true;
        return;
    }

    status.textContent = 'Actívalas para recibir un aviso al entrar o volver a la PWA.';
    button.textContent = 'Activar alertas';
    button.disabled = false;
}

async function registerAdminPwa() {
    if (!('serviceWorker' in navigator)) {
        updateCobranzasAlertsUi();
        return null;
    }
    try {
        adminServiceWorkerRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        updateCobranzasAlertsUi();
        return adminServiceWorkerRegistration;
    } catch (error) {
        console.warn('No se pudo registrar la PWA de administración:', error);
        updateCobranzasAlertsUi();
        return null;
    }
}

async function activateCobranzasAlerts() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        localStorage.setItem(COBRANZAS_ALERTS_ENABLED_KEY, 'true');
        await registerAdminPwa();
        showToast('Alertas de cobros activadas.');
        await refreshCobranzasNavState();
    }
    updateCobranzasAlertsUi();
}

async function maybeNotifyCobranzas(rows = []) {
    if (!('Notification' in window) || !rows.length || Notification.permission !== 'granted') return;
    if (localStorage.getItem(COBRANZAS_ALERTS_ENABLED_KEY) !== 'true') return;

    const signature = rows.map(student => `${student.id}:${student.valid_until || ''}`).sort().join('|');
    const current = { date: getLocalDateKey(), signature };
    try {
        const previous = JSON.parse(localStorage.getItem(COBRANZAS_LAST_ALERT_KEY) || 'null');
        if (previous?.date === current.date && previous?.signature === signature) return;
    } catch {
        localStorage.removeItem(COBRANZAS_LAST_ALERT_KEY);
    }

    const registration = adminServiceWorkerRegistration || await registerAdminPwa();
    if (!registration) return;

    const now = new Date();
    const expired = rows.filter(student => (
        new Date(`${student.valid_until}T23:59:59`) < now
    )).length;
    const upcoming = rows.length - expired;
    const parts = [];
    if (expired) parts.push(`${expired} vencido${expired === 1 ? '' : 's'}`);
    if (upcoming) parts.push(`${upcoming} por vencer`);

    await registration.showNotification('JR Stars · Cobros por atender', {
        body: `${parts.join(' y ')}. Toca para revisar Cobranzas.`,
        icon: './icons/red-white/pwa-admin-192.png',
        badge: './icons/red-white/favicon-32.png',
        tag: 'jr-admin-cobranzas',
        renotify: true,
        data: { url: './?section=cobranzas' }
    });
    localStorage.setItem(COBRANZAS_LAST_ALERT_KEY, JSON.stringify(current));
}

function setCobranzasNavState(pendingCount = null) {
    const button = document.getElementById('bnav-cobranzas');
    if (!button) return;
    button.classList.remove('has-pending', 'is-clear');
    if (pendingCount === null) return;

    const hasPending = pendingCount > 0;
    button.classList.add(hasPending ? 'has-pending' : 'is-clear');
    button.setAttribute(
        'aria-label',
        hasPending ? `${pendingCount} cobros pendientes` : 'Cobranzas al día'
    );
}

async function refreshCobranzasNavState() {
    if (!window.supabaseClient) return;
    const { data, error } = await window.supabaseClient
        .from('students')
        .select('id, full_name, valid_until')
        .eq('is_active', true)
        .lte('valid_until', getCobranzasLimit());

    const rows = data || [];
    setCobranzasNavState(error ? null : rows.length);
    if (!error) maybeNotifyCobranzas(rows).catch(console.warn);
}

function setCobranzasMetrics(total = 0, expired = 0) {
    document.getElementById('cobranzas-total').textContent = total;
    document.getElementById('cobranzas-vencidos').textContent = expired;
    document.getElementById('cobranzas-proximos').textContent = Math.max(0, total - expired);
}

function formatCobranzasDate(value, options = {}) {
    if (!value) return 'Sin fecha';
    return new Date(`${value}T12:00:00`).toLocaleDateString('es-PE', options);
}

function normalizePeruPhone(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('51')) return digits;
    if (digits.length === 9) return `51${digits}`;
    return '';
}

async function loadCobranzas() {
    const list = document.getElementById('cobranzas-list');
    const refresh = document.getElementById('cobranzas-refresh');
    if (!list) return;

    list.innerHTML = '<div class="cobranzas-state cobranzas-state--loading"><span></span>Cargando cobros pendientes...</div>';
    refresh?.classList.add('is-loading');
    refresh?.setAttribute('disabled', '');

    try {
        const { data, error } = await window.supabaseClient
            .from('students')
            .select('id, full_name, valid_until, parent_name, parent_phone, tarifa_mensual, historial_notificaciones(fecha_envio)')
            .eq('is_active', true)
            .lte('valid_until', getCobranzasLimit())
            .order('valid_until', { ascending: true });

        if (error) throw error;

        const rows = data || [];
        const now = new Date();
        const expired = rows.filter(student => (
            new Date(`${student.valid_until}T23:59:59`) < now
        )).length;

        setCobranzasMetrics(rows.length, expired);
        setCobranzasNavState(rows.length);
        maybeNotifyCobranzas(rows).catch(console.warn);
        cobranzasById.clear();
        rows.forEach(student => cobranzasById.set(String(student.id), student));

        if (!rows.length) {
            list.innerHTML = `
                <div class="cobranzas-state cobranzas-state--empty">
                    <span class="cobranzas-state-icon">✓</span>
                    <strong>Todo al día</strong>
                    <p>No hay pagos vencidos ni próximos a vencer.</p>
                </div>`;
            return;
        }

        
        // Pre-procesar notificaciones para ordenamiento
        rows.forEach(student => {
            const notifs = student.historial_notificaciones || [];
            let last_notified_at = notifs.length > 0 ? notifs.reduce((max, n) => new Date(n.fecha_envio) > new Date(max.fecha_envio) ? n : max).fecha_envio : null;
            student._last_notified_at = last_notified_at;
            const phone = normalizePeruPhone(student.parent_phone);
            let canNotify = Boolean(phone);
            if (last_notified_at) {
                canNotify = canNotify && ((now - new Date(last_notified_at)) / 36e5 >= 24);
            }
            student._canNotify = canNotify;
        });

        // Ordenar: canNotify (true arriba), luego fecha ascendente
        rows.sort((a, b) => {
            if (a._canNotify && !b._canNotify) return -1;
            if (!a._canNotify && b._canNotify) return 1;
            return new Date(a.valid_until) - new Date(b.valid_until);
        });

        list.innerHTML = rows.map(student => renderCobranzaCard(student, now)).join('');

    } catch (error) {
        console.error(error);
        setCobranzasMetrics();
        setCobranzasNavState(null);
        list.innerHTML = `
            <div class="cobranzas-state cobranzas-state--error">
                <strong>No pudimos cargar las cobranzas</strong>
                <p>Revisa tu conexión e inténtalo nuevamente.</p>
            </div>`;
    } finally {
        refresh?.classList.remove('is-loading');
        refresh?.removeAttribute('disabled');
    }
}

function renderCobranzaCard(student, now) {
    const id = escapeCobranzasHtml(student.id);
    const rawName = student.full_name || 'Alumno sin nombre';
    const fullName = escapeCobranzasHtml(rawName);
    const parentName = escapeCobranzasHtml(student.parent_name || 'Apoderado no registrado');
    const phone = normalizePeruPhone(student.parent_phone);
    const phoneDisplay = phone ? `+${phone}` : 'Sin teléfono registrado';
    const dueDate = formatCobranzasDate(student.valid_until, {
        day: '2-digit', month: 'short', year: 'numeric'
    });
    const dateNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateValid = new Date(student.valid_until + "T00:00:00");
    const diffTime = dateValid - dateNow;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    const expired = diffDays < 0;

    let statusText = 'Por atender';
    if (diffDays < 0) statusText = 'Vencido';
    else if (diffDays === 0) statusText = 'Vence hoy';
    else if (diffDays === 1) statusText = 'Vence mañana';

    let canNotify = student._canNotify !== undefined ? student._canNotify : Boolean(phone);
    let notifiedText = 'Sin recordatorios enviados';
    if (student._last_notified_at) {
        const lastNotification = new Date(student._last_notified_at);
        if (student._canNotify === undefined) {
            canNotify = canNotify && ((now - lastNotification) / 36e5 >= 24);
        }
        notifiedText = `Último aviso: ${lastNotification.toLocaleDateString('es-PE', {
            day: '2-digit', month: 'short'
        })}, ${lastNotification.toLocaleTimeString('es-PE', {
            hour: '2-digit', minute: '2-digit'
        })}`;
    }

    const notifyLabel = !phone
        ? 'Falta teléfono'
        : canNotify ? 'Notificar por WhatsApp' : 'Notificado hoy';

    return `
        <article class="cobranza-card ${expired ? 'is-expired' : 'is-upcoming'}">
            <div class="cobranza-card-head">
                <span class="cobranza-status">${statusText}</span>
                <div class="cobranza-due"><span>Vencimiento</span><strong>${escapeCobranzasHtml(dueDate)}</strong></div>
            </div>
            <div class="cobranza-person">
                <span class="cobranza-avatar" aria-hidden="true">${escapeCobranzasHtml(rawName.charAt(0).toUpperCase())}</span>
                <div><h2>${fullName}</h2><p>${escapeCobranzasHtml(notifiedText)}</p></div>
            </div>
            <div class="cobranza-contact">
                <span>Apoderado</span><strong>${parentName}</strong><small>${escapeCobranzasHtml(phoneDisplay)}</small>
            </div>
            <div class="cobranza-actions">
                <button class="cobranza-action cobranza-action--notify" type="button" data-cobranza-action="notify" data-student-id="${id}" ${canNotify ? '' : 'disabled'}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.8-.9-2-.9-.3-.1-.5-.2-.7.1-.2.3-.8 1-.9 1.2-.2.2-.4.2-.7.1-1.7-.8-2.9-1.7-3.8-3.5-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5L9.3 6.7c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.8 1.2 3c.2.2 2.1 3.2 5 4.5 1.9.8 2.6.9 3.6.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1 0-.4-.1-.7-.2ZM12 22a10 10 0 0 1-5-1.3L2 22l1.3-4.9A10 10 0 1 1 12 22Z"/></svg>
                    <span>${notifyLabel}</span>
                </button>
                <button class="cobranza-action cobranza-action--disable" type="button" data-cobranza-action="disable" data-student-id="${id}">
                    <span>Inhabilitar</span>
                </button>
            </div>
        </article>`;
}

async function notificarWhatsApp(studentId) {
    const student = cobranzasById.get(String(studentId));
    const phone = normalizePeruPhone(student?.parent_phone);
    if (!student || !phone) return showToast('Registra un teléfono válido para el apoderado', 'error');

    const { error } = await window.supabaseClient
        .from('historial_notificaciones')
        .insert({ alumno_id: student.id, tipo_aviso: 'WhatsApp', mensaje: 'Aviso manual desde panel administrativo' });
    if (error) return showToast('No se pudo registrar la notificación', 'error');

    const tarifaStr = student.tarifa_mensual ? parseFloat(student.tarifa_mensual).toFixed(2) : '0.00';
    const text = `Hola ${student.parent_name || 'apoderado'}. Te saludamos de la academia JR Stars. Te recordamos que la mensualidad de ${student.full_name} (S/ ${student.tarifa_mensual || '80'}) vence este ${formatCobranzasDate(student.valid_until)}. Porfa regulariza mediante Yape al 955515693 o en efectivo en la cancha. Mándanos la captura por aquí.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    showToast('Recordatorio registrado. Abriendo WhatsApp.');
    loadCobranzas();
}

async function inhabilitarMoroso(studentId) {
    const student = cobranzasById.get(String(studentId));
    if (!student || !confirm(`¿Inhabilitar a ${student.full_name}? No podrá registrar asistencia hasta regularizar el pago.`)) return;

    const { error } = await window.supabaseClient
        .from('students')
        .update({ is_active: false })
        .eq('id', student.id);
    if (error) return showToast('No se pudo inhabilitar al alumno', 'error');

    showToast(`${student.full_name} fue inhabilitado.`);
    loadCobranzas();
}

document.getElementById('cobranzas-refresh')?.addEventListener('click', loadCobranzas);
document.getElementById('cobranzas-alerts-button')?.addEventListener('click', activateCobranzasAlerts);
document.getElementById('cobranzas-list')?.addEventListener('click', event => {
    const button = event.target.closest('[data-cobranza-action]');
    if (!button || button.disabled) return;
    if (button.dataset.cobranzaAction === 'notify') notificarWhatsApp(button.dataset.studentId);
    if (button.dataset.cobranzaAction === 'disable') inhabilitarMoroso(button.dataset.studentId);
});

registerAdminPwa().then(() => refreshCobranzasNavState());
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshCobranzasNavState();
});
setInterval(refreshCobranzasNavState, 30 * 60 * 1000);
