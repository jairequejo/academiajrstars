// Cobranzas, recordatorios y alertas del panel administrativo.
const cobranzasById = new Map();
const COBRANZAS_ALERTS_ENABLED_KEY = 'jr_admin_cobranzas_alerts_enabled';
const COBRANZAS_ALERTS_STATE_KEY = 'jr_admin_cobranzas_alerts_state_v2';
const COBRANZAS_ALERTS_MORNING_HOUR = 6;
const COBRANZAS_ALERTS_EVENING_HOUR = 18;
let adminServiceWorkerRegistration = null;
let cobranzasRows = [];
let cobranzasReferenceNow = new Date();
let cobranzasPendingCount = null;

function escapeCobranzasHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function getCobranzasLimit() {
    const limit = new Date();
    limit.setDate(limit.getDate() + 2);
    return `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
}

function getLocalDateKey(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCurrentCobranzaNotification(student) {
    const notifications = student?.historial_notificaciones || [];
    if (!notifications.length) return null;

    let cycleStart = null;
    if (student.valid_until) {
        cycleStart = new Date(`${student.valid_until}T12:00:00`);
        if (!Number.isNaN(cycleStart.getTime())) {
            cycleStart.setDate(cycleStart.getDate() - 7);
            cycleStart.setHours(0, 0, 0, 0);
        } else {
            cycleStart = null;
        }
    }

    return notifications.reduce((latest, notification) => {
        if (!notification?.fecha_envio) return latest;
        const sentAt = new Date(notification.fecha_envio);
        if (Number.isNaN(sentAt.getTime()) || (cycleStart && sentAt < cycleStart)) return latest;
        if (!latest || sentAt > new Date(latest)) return notification.fecha_envio;
        return latest;
    }, null);
}

function getStudentCobranzaNotification(student) {
    return Object.prototype.hasOwnProperty.call(student || {}, '_last_notified_at')
        ? student._last_notified_at
        : getCurrentCobranzaNotification(student);
}

function updateCobranzasAlertsUi() {
    const container = document.getElementById('cobranzas-alerts');
    const status = document.getElementById('cobranzas-alerts-status');
    const state = document.getElementById('cobranzas-alerts-state');
    const button = document.getElementById('cobranzas-alerts-button');
    if (!container || !status || !button) return;

    container.classList.remove('is-enabled', 'is-denied');
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        status.textContent = 'Este navegador no admite notificaciones de la aplicación.';
        if (state) state.textContent = 'No disponibles';
        button.textContent = 'No disponible';
        button.disabled = true;
        return;
    }

    const enabled = Notification.permission === 'granted'
        && localStorage.getItem(COBRANZAS_ALERTS_ENABLED_KEY) === 'true';
    if (enabled) {
        container.classList.add('is-enabled');
        status.textContent = 'Verás los nombres pendientes durante el día y, desde las 6 p. m., un recordatorio con lo que aún falte.';
        if (state) state.textContent = 'Activas';
        button.textContent = 'Desactivar';
        button.disabled = false;
        return;
    }

    if (Notification.permission === 'denied') {
        container.classList.add('is-denied');
        status.textContent = 'El navegador bloqueó las notificaciones. Habilítalas desde los permisos del sitio.';
        if (state) state.textContent = 'Bloqueadas';
        button.textContent = 'Bloqueadas';
        button.disabled = true;
        return;
    }

    status.textContent = Notification.permission === 'granted'
        ? 'Las alertas están pausadas en este dispositivo.'
        : 'Actívalas para recibir recordatorios visibles con los alumnos pendientes de aviso.';
    if (state) state.textContent = 'Desactivadas';
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

async function toggleCobranzasAlerts() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    const enabled = Notification.permission === 'granted'
        && localStorage.getItem(COBRANZAS_ALERTS_ENABLED_KEY) === 'true';
    if (enabled) {
        localStorage.setItem(COBRANZAS_ALERTS_ENABLED_KEY, 'false');
        updateCobranzasAlertsUi();
        showToast('Alertas de cobranzas desactivadas.');
        return;
    }

    const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (permission === 'granted') {
        localStorage.setItem(COBRANZAS_ALERTS_ENABLED_KEY, 'true');
        await registerAdminPwa();
        showToast('Alertas de cobranzas activadas.');
        await refreshCobranzasNavState();
    }
    updateCobranzasAlertsUi();
}

async function maybeNotifyCobranzas(rows = []) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (localStorage.getItem(COBRANZAS_ALERTS_ENABLED_KEY) !== 'true') return;

    const now = new Date();
    const hour = now.getHours();
    if (hour < COBRANZAS_ALERTS_MORNING_HOUR) return;

    const period = hour >= COBRANZAS_ALERTS_EVENING_HOUR ? 'evening' : 'morning';
    const date = getLocalDateKey(now);
    let state = { date, sent: {} };
    try {
        const saved = JSON.parse(localStorage.getItem(COBRANZAS_ALERTS_STATE_KEY) || 'null');
        if (saved?.date === date && saved.sent) state = saved;
    } catch {
        localStorage.removeItem(COBRANZAS_ALERTS_STATE_KEY);
    }
    if (state.sent[period]) return;

    const pending = rows
        .filter(student => !getStudentCobranzaNotification(student))
        .sort((a, b) => getCobranzaDayDifference(a.valid_until, now) - getCobranzaDayDifference(b.valid_until, now));
    if (!pending.length) return;

    const registration = adminServiceWorkerRegistration || await registerAdminPwa();
    if (!registration) return;

    const count = pending.length;
    const names = pending.slice(0, 2).map(student => {
        const parts = String(student.full_name || 'Alumno').trim().split(/\s+/);
        return parts.slice(0, 2).join(' ');
    });
    const nameSummary = count > 2
        ? `${names.join(', ')} y ${count - 2} más`
        : names.join(' y ');
    const title = period === 'evening'
        ? `⏰ Tienes ${count} ${count === 1 ? 'alumno' : 'alumnos'} por notificar`
        : `💳 ${count} ${count === 1 ? 'pago pendiente' : 'pagos pendientes'} de aviso`;
    const body = period === 'evening'
        ? `Antes de cerrar, aún falta notificar ${count === 1 ? 'el pago' : 'los pagos'} de ${nameSummary}.`
        : `Notifica ${count === 1 ? 'el pago' : 'los pagos'} de ${nameSummary}. Toca para abrir Cobranzas.`;

    await registration.showNotification(title, {
        body,
        icon: './icons/red-white/pwa-admin-192.png',
        badge: './icons/red-white/favicon-32.png',
        tag: `jr-admin-cobranzas-${period}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [220, 100, 220, 100, 320],
        actions: [{ action: 'open-cobranzas', title: 'Ver cobranzas' }],
        data: { url: './?section=cobranzas', period }
    });
    state.sent[period] = { at: now.toISOString(), count };
    localStorage.setItem(COBRANZAS_ALERTS_STATE_KEY, JSON.stringify(state));
}

function setCobranzasNavState(pendingCount = cobranzasPendingCount) {
    cobranzasPendingCount = pendingCount;
    const button = document.getElementById('bnav-cobranzas');
    if (!button) return;
    button.classList.remove('has-pending', 'is-clear');
    if (cobranzasPendingCount === null) return;

    const hasPending = cobranzasPendingCount > 0;
    button.classList.add(hasPending ? 'has-pending' : 'is-clear');
    button.setAttribute(
        'aria-label',
        hasPending ? `${cobranzasPendingCount} cobros pendientes` : 'Cobranzas al día'
    );
}

async function refreshCobranzasNavState() {
    if (!window.supabaseClient) return;
    const { data, error } = await window.supabaseClient
        .from('students')
        .select('id, full_name, valid_until, historial_notificaciones(fecha_envio)')
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

function getCobranzaDayDifference(value, now = new Date()) {
    if (!value) return Number.POSITIVE_INFINITY;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(`${value}T00:00:00`);
    return Math.round((due - today) / 864e5);
}

function getCobranzaDueMeta(value, now = new Date()) {
    const days = getCobranzaDayDifference(value, now);
    const shortDate = formatCobranzasDate(value, { day: 'numeric', month: 'short' });
    const fullDate = formatCobranzasDate(value, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    if (days < 0) return { days, state: 'expired', headline: `Venció el ${shortDate}`, phrase: `venció el ${shortDate}`, fullDate };
    if (days === 0) return { days, state: 'today', headline: 'Vence hoy', phrase: 'vence hoy', fullDate };
    if (days === 1) return { days, state: 'tomorrow', headline: 'Vence mañana', phrase: 'vence mañana', fullDate };
    return { days, state: 'upcoming', headline: `Vence el ${shortDate}`, phrase: `vence el ${shortDate}`, fullDate };
}

function formatNotificationAge(value, now = new Date()) {
    if (!value) return '';
    const elapsedMinutes = Math.max(0, Math.floor((now - new Date(value)) / 60000));
    if (elapsedMinutes < 1) return 'hace un momento';
    if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`;
    const hours = Math.floor(elapsedMinutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'ayer';
    if (days < 7) return `hace ${days} días`;
    return `el ${new Date(value).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}`;
}

function normalizePeruPhone(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('51')) return digits;
    if (digits.length === 9) return `51${digits}`;
    return '';
}

function normalizeCobranzasSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function prepareCobranzaStudent(student) {
    student._last_notified_at = getCurrentCobranzaNotification(student);
    student._due = getCobranzaDueMeta(student.valid_until, cobranzasReferenceNow);
    return student;
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
            .select('id, full_name, dni, valid_until, parent_name, parent_phone, tarifa_mensual, historial_notificaciones(fecha_envio)')
            .eq('is_active', true)
            .lte('valid_until', getCobranzasLimit())
            .order('valid_until', { ascending: true });

        if (error) throw error;

        cobranzasReferenceNow = new Date();
        cobranzasRows = (data || []).map(prepareCobranzaStudent);
        const expired = cobranzasRows.filter(student => student._due.days < 0).length;

        setCobranzasMetrics(cobranzasRows.length, expired);
        setCobranzasNavState(cobranzasRows.length);
        maybeNotifyCobranzas(cobranzasRows).catch(console.warn);
        cobranzasById.clear();
        cobranzasRows.forEach(student => cobranzasById.set(String(student.id), student));
        renderFilteredCobranzas();
    } catch (error) {
        console.error(error);
        cobranzasRows = [];
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

function getFilteredCobranzas() {
    const query = normalizeCobranzasSearch(document.getElementById('cobranzas-search')?.value);
    const dueFilter = getActiveCobranzaFilter('due');
    const notificationFilter = getActiveCobranzaFilter('notified');

    return cobranzasRows.filter(student => {
        const haystack = normalizeCobranzasSearch(`${student.full_name || ''} ${student.dni || ''} ${student.parent_name || ''} ${student.parent_phone || ''}`);
        const matchesQuery = !query || haystack.includes(query);
        const matchesDue = dueFilter === 'all'
            || (dueFilter === 'expired' && student._due.days < 0)
            || (dueFilter === 'today' && student._due.days === 0)
            || (dueFilter === 'tomorrow' && student._due.days === 1)
            || (dueFilter === 'upcoming' && student._due.days > 0);
        const wasNotified = Boolean(student._last_notified_at);
        const matchesNotification = notificationFilter === 'all'
            || (notificationFilter === 'notified' && wasNotified)
            || (notificationFilter === 'pending' && !wasNotified);
        return matchesQuery && matchesDue && matchesNotification;
    });
}

function getActiveCobranzaFilter(group) {
    return document.querySelector(`[data-cobranzas-filter="${group}"].is-active`)?.dataset.value || 'all';
}

function updateCobranzasFilterSummary(visibleCount) {
    const query = document.getElementById('cobranzas-search')?.value.trim() || '';
    const due = getActiveCobranzaFilter('due');
    const notified = getActiveCobranzaFilter('notified');
    const activeCount = Number(Boolean(query)) + Number(due !== 'all') + Number(notified !== 'all');
    const count = document.getElementById('cobranzas-filter-count');
    const results = document.getElementById('cobranzas-filter-results');
    const reset = document.getElementById('cobranzas-filter-reset');
    if (count) {
        count.textContent = activeCount;
        count.hidden = activeCount === 0;
    }
    if (results) results.textContent = `${visibleCount} de ${cobranzasRows.length} cobros`;
    if (reset) reset.hidden = activeCount === 0;
}

function renderFilteredCobranzas() {
    const list = document.getElementById('cobranzas-list');
    if (!list) return;

    const rows = getFilteredCobranzas();
    updateCobranzasFilterSummary(rows.length);
    if (!cobranzasRows.length) {
        list.innerHTML = `
            <div class="cobranzas-state cobranzas-state--empty">
                <span class="cobranzas-state-icon">✓</span>
                <strong>Todo al día</strong>
                <p>No hay pagos vencidos ni próximos a vencer.</p>
            </div>`;
        return;
    }
    if (!rows.length) {
        list.innerHTML = `
            <div class="cobranzas-state">
                <strong>No hay coincidencias</strong>
                <p>Prueba con otros filtros o limpia la búsqueda.</p>
            </div>`;
        return;
    }

    rows.sort((a, b) => {
        if (Boolean(a._last_notified_at) !== Boolean(b._last_notified_at)) return a._last_notified_at ? 1 : -1;
        return a._due.days - b._due.days;
    });
    list.innerHTML = rows.map(student => renderCobranzaCard(student, cobranzasReferenceNow)).join('');
}

function renderCobranzaCard(student, now) {
    const id = escapeCobranzasHtml(student.id);
    const rawName = student.full_name || 'Alumno sin nombre';
    const fullName = escapeCobranzasHtml(rawName);
    const parentName = escapeCobranzasHtml(student.parent_name || 'Apoderado no registrado');
    const phone = normalizePeruPhone(student.parent_phone);
    const phoneDisplay = phone ? `+${phone}` : 'Sin teléfono registrado';
    const parsedAmount = Number(student.tarifa_mensual ?? 80);
    const amount = Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : '80.00';
    const due = student._due || getCobranzaDueMeta(student.valid_until, now);
    const notificationAge = formatNotificationAge(student._last_notified_at, now);
    const wasNotified = Boolean(student._last_notified_at);
    const notificationText = wasNotified
        ? `Ya fue notificado ${notificationAge}`
        : 'Todavía no se envió un recordatorio';
    const notifyLabel = !phone
        ? 'Falta teléfono'
        : wasNotified ? `Notificado · ${notificationAge}` : 'Notificar por WhatsApp';

    return `
        <article class="cobranza-card is-${due.state} ${wasNotified ? 'is-notified' : ''}">
            <div class="cobranza-timing">
                <span class="cobranza-status">${due.days < 0 ? 'Vencido' : 'Pendiente'}</span>
                <strong>${escapeCobranzasHtml(due.headline)}</strong>
                <small>${escapeCobranzasHtml(due.fullDate)}</small>
            </div>
            <div class="cobranza-person">
                <span class="cobranza-avatar" aria-hidden="true">${escapeCobranzasHtml(rawName.charAt(0).toUpperCase())}</span>
                <div>
                    <h2>${fullName}</h2>
                    <p class="cobranza-notification-state">${escapeCobranzasHtml(notificationText)}</p>
                </div>
                <strong class="cobranza-amount">S/ ${amount}</strong>
            </div>
            <div class="cobranza-contact">
                <span>Apoderado</span><strong>${parentName}</strong><small>${escapeCobranzasHtml(phoneDisplay)}</small>
            </div>
            <div class="cobranza-actions">
                <button class="cobranza-action cobranza-action--notify ${wasNotified ? 'is-sent' : ''}" type="button" data-cobranza-action="${wasNotified ? 'review-notify' : 'notify'}" data-student-id="${id}" ${phone ? '' : 'disabled'}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.8-.9-2-.9-.3-.1-.5-.2-.7.1-.2.3-.8 1-.9 1.2-.2.2-.4.2-.7.1-1.7-.8-2.9-1.7-3.8-3.5-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5L9.3 6.7c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.8 1.2 3c.2.2 2.1 3.2 5 4.5 1.9.8 2.6.9 3.6.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1 0-.4-.1-.7-.2ZM12 22a10 10 0 0 1-5-1.3L2 22l1.3-4.9A10 10 0 1 1 12 22Z"/></svg>
                    <span>${escapeCobranzasHtml(notifyLabel)}</span>
                </button>
                <button class="cobranza-action cobranza-action--disable" type="button" data-cobranza-action="disable" data-student-id="${id}">
                    <span>Inhabilitar</span>
                </button>
            </div>
            ${wasNotified ? `
                <div class="cobranza-renotify" data-renotify-for="${id}" hidden>
                    <div>
                        <strong>Ya fue notificado ${escapeCobranzasHtml(notificationAge)}</strong>
                        <p>Si el primer mensaje no llegó, puedes abrir un nuevo recordatorio.</p>
                    </div>
                    <div class="cobranza-renotify-actions">
                        <button type="button" data-cobranza-action="cancel-renotify" data-student-id="${id}">Cancelar</button>
                        <button type="button" data-cobranza-action="confirm-renotify" data-student-id="${id}">Volver a notificar</button>
                    </div>
                </div>` : ''}
        </article>`;
}

function toggleCobranzaRenotify(studentId, forceClose = false) {
    const panels = [...document.querySelectorAll('[data-renotify-for]')];
    const selected = panels.find(panel => panel.dataset.renotifyFor === String(studentId));
    panels.forEach(panel => {
        if (panel !== selected) panel.hidden = true;
    });
    if (selected) selected.hidden = forceClose ? true : !selected.hidden;
}

async function sendCobranzaWhatsApp(studentId, resend = false) {
    const student = cobranzasById.get(String(studentId));
    const phone = normalizePeruPhone(student?.parent_phone);
    if (!student || !phone) return showToast('Registra un teléfono válido para el apoderado', 'error');

    const due = student._due || getCobranzaDueMeta(student.valid_until);
    const message = typeof buildCobranzaMessage === 'function'
        ? buildCobranzaMessage(student, due.phrase)
        : `Hola ${student.parent_name || 'apoderado'}. Te recordamos que la mensualidad de ${student.full_name} ${due.phrase}.`;
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    // La navegación debe ocurrir durante el toque. Si esperamos la base de datos,
    // varios navegadores móviles interpretan la nueva pestaña como un popup.
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    showToast('Abriendo WhatsApp…');

    const { error } = await window.supabaseClient
        .from('historial_notificaciones')
        .insert({
            alumno_id: student.id,
            tipo_aviso: 'WhatsApp',
            mensaje: message
        });

    if (error) {
        showToast('WhatsApp se abrió, pero no pudimos guardar el historial.', 'error');
        return;
    }

    student._last_notified_at = new Date().toISOString();
    renderFilteredCobranzas();
    showToast(resend ? 'Nuevo recordatorio registrado.' : 'Recordatorio registrado.');
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

function toggleCobranzasFilters() {
    const panel = document.getElementById('cobranzas-filters');
    const button = document.getElementById('cobranzas-filter-button');
    if (!panel || !button) return;
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
}

function resetCobranzasFilters() {
    const search = document.getElementById('cobranzas-search');
    if (search) search.value = '';
    document.querySelectorAll('[data-cobranzas-filter]').forEach(button => {
        const isActive = button.dataset.value === 'all';
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    renderFilteredCobranzas();
}

function selectCobranzaFilter(button) {
    const group = button.dataset.cobranzasFilter;
    document.querySelectorAll(`[data-cobranzas-filter="${group}"]`).forEach(option => {
        const isActive = option === button;
        option.classList.toggle('is-active', isActive);
        option.setAttribute('aria-pressed', String(isActive));
    });
    renderFilteredCobranzas();
}

document.getElementById('cobranzas-refresh')?.addEventListener('click', loadCobranzas);
document.getElementById('cobranzas-alerts-button')?.addEventListener('click', toggleCobranzasAlerts);
document.getElementById('cobranzas-filter-button')?.addEventListener('click', toggleCobranzasFilters);
document.getElementById('cobranzas-filter-reset')?.addEventListener('click', resetCobranzasFilters);
document.getElementById('cobranzas-search')?.addEventListener('input', renderFilteredCobranzas);
document.getElementById('cobranzas-filters')?.addEventListener('click', event => {
    const button = event.target.closest('[data-cobranzas-filter]');
    if (button) selectCobranzaFilter(button);
});
document.getElementById('cobranzas-list')?.addEventListener('click', event => {
    const button = event.target.closest('[data-cobranza-action]');
    if (!button || button.disabled) return;
    const studentId = button.dataset.studentId;
    if (button.dataset.cobranzaAction === 'notify') sendCobranzaWhatsApp(studentId);
    if (button.dataset.cobranzaAction === 'review-notify') toggleCobranzaRenotify(studentId);
    if (button.dataset.cobranzaAction === 'cancel-renotify') toggleCobranzaRenotify(studentId, true);
    if (button.dataset.cobranzaAction === 'confirm-renotify') sendCobranzaWhatsApp(studentId, true);
    if (button.dataset.cobranzaAction === 'disable') inhabilitarMoroso(studentId);
});

registerAdminPwa().then(() => refreshCobranzasNavState());
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshCobranzasNavState();
});
setInterval(refreshCobranzasNavState, 30 * 60 * 1000);
