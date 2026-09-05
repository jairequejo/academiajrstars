// Cobranzas y recordatorios del panel administrativo.
const cobranzasById = new Map();

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
    const { count, error } = await window.supabaseClient
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .lte('valid_until', getCobranzasLimit());

    setCobranzasNavState(error ? null : (count || 0));
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
            .select('id, full_name, valid_until, parent_name, parent_phone, last_notified_at, tarifa_mensual')
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
    const expired = new Date(`${student.valid_until}T23:59:59`) < now;

    let canNotify = Boolean(phone);
    let notifiedText = 'Sin recordatorios enviados';
    if (student.last_notified_at) {
        const lastNotification = new Date(student.last_notified_at);
        canNotify = canNotify && ((now - lastNotification) / 36e5 >= 24);
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
                <span class="cobranza-status">${expired ? 'Vencido' : 'Vence pronto'}</span>
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
        .from('students')
        .update({ last_notified_at: new Date().toISOString() })
        .eq('id', student.id);
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
document.getElementById('cobranzas-list')?.addEventListener('click', event => {
    const button = event.target.closest('[data-cobranza-action]');
    if (!button || button.disabled) return;
    if (button.dataset.cobranzaAction === 'notify') notificarWhatsApp(button.dataset.studentId);
    if (button.dataset.cobranzaAction === 'disable') inhabilitarMoroso(button.dataset.studentId);
});

refreshCobranzasNavState();
