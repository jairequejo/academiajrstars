// home/home.js — Portal público JR Stars

// ── HELPERS ──────────────────────────────────────────
const $ = id => document.getElementById(id);

function extractPortalCredential(value) {
    let raw = String(value || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        raw = url.searchParams.get('code') || raw;
    } catch {
        const match = raw.match(/[?&]code=([^&]+)/i);
        if (match) {
            try { raw = decodeURIComponent(match[1]); } catch { raw = match[1]; }
        }
    }
    return raw.trim();
}

// ── MODO DEMO (sin Supabase) ─────────────────────────
// Código de prueba que dibuja una ficha de EJEMPLO, marcada como DEMO.
// No consulta ninguna tabla ni muestra datos de menores reales.
const PORTAL_DEMO_CODE = '00000000';

// Códigos de prueba: además del estado "al día" se puede revisar el mes en curso
// con el pago aún dentro del plazo y el caso ya bloqueado.
const PORTAL_DEMO_CODES = {
    '00000000': null,
    '11111111': 'en-plazo',
    '22222222': 'bloqueado'
};

function isDemoCode(value) {
    return Object.prototype.hasOwnProperty.call(PORTAL_DEMO_CODES, String(value || '').trim());
}

function demoEstadoPago(value) {
    const key = String(value || '').trim();
    return isDemoCode(key) ? PORTAL_DEMO_CODES[key] : null;
}

function buildDemoBio() {
    // Índice 0 = control más reciente (progreso creciente hacia el presente).
    const talla  = [1.36, 1.34, 1.33, 1.32];
    const peso   = [28.2, 27.9, 27.6, 27.4];
    const salto  = [28.5, 27, 25.5, 24];
    const sprint = [2.96, 2.99, 3.02, 3.05];
    const hoy = new Date();
    const out = [];
    for (let i = 0; i < 4; i++) {
        const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        out.push({
            fecha: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`,
            talla: talla[i], peso: peso[i],
            salto_cm: salto[i], sprint_10m_seg: sprint[i]
        });
    }
    return out;
}

function buildPortalDemoLookup(estadoPago) {
    const hoy = new Date();
    const diasAtras = [0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25];
    return {
        found: true,
        student: {
            id: '00000000-0000-0000-0000-000000000000',
            full_name: 'Jugador de Prueba',
            categoria: '2015',
            sede: 'Sede demo',
            horario: 'LMV',
            turno: 'Tarde',
            grupo: 'A',
            batido_credits: 3,
            valid_until: '2026-12-31',
            demo_estado_pago: estadoPago || null,
            is_active: true,
            demo: true
        },
        attendance: diasAtras.map(n => {
            const f = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n, 18, 30);
            return { created_at: f.toISOString() };
        }),
        biometria: buildDemoBio()
    };
}

function marcarDemo(activo, estado) {
    let banner = document.getElementById('portal-demo-banner');
    if (!activo) { if (banner) banner.remove(); return; }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'portal-demo-banner';
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'position:relative;z-index:60;text-align:center;' +
            'background:#76263a;color:#fff;border-bottom:1px solid rgba(244,132,125,.5);' +
            'font:700 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:.12em;' +
            'text-transform:uppercase;padding:9px 14px';
        document.body.insertBefore(banner, document.body.firstChild);
    }
    const etiqueta = estado === 'en-plazo'
        ? 'pago pendiente dentro del plazo'
        : estado === 'bloqueado' ? 'mensualidad vencida' : 'al día';
    banner.textContent = `Modo demo · datos de ejemplo (${etiqueta}), no es un alumno real`;
}

// ── INIT ─────────────────────────────────────────────
// ── SESIÓN DEL JUGADOR ───────────────────────────────
// La sesión queda abierta en el dispositivo para que el jugador no tenga
// que escribir su código cada vez. Caduca sola y se cierra con "Salir".
const PORTAL_SESSION_DAYS = 30;

function guardarSesion(code) {
    try {
        localStorage.setItem('jrstars_portal_session', JSON.stringify({ code: String(code), t: Date.now() }));
    } catch (e) { /* sin almacenamiento */ }
}

function leerSesion() {
    let raw = null;
    try { raw = localStorage.getItem('jrstars_portal_session'); } catch (e) { return null; }
    if (!raw) return null;
    if (!raw.trim().startsWith('{')) return raw; // sesiones antiguas, solo el código
    try {
        const data = JSON.parse(raw);
        if (!data || !data.code) return null;
        if (Date.now() - Number(data.t || 0) > PORTAL_SESSION_DAYS * 86400000) {
            localStorage.removeItem('jrstars_portal_session');
            return null;
        }
        return String(data.code);
    } catch (e) {
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Leer ?code= de la URL (viene de chip NFC)
    const urlParams = new URLSearchParams(window.location.search);
    const nfcCode = urlParams.get('code');
    if (nfcCode) {
        window.history.replaceState({}, '', window.location.pathname);
        handleScanCode(nfcCode.trim());
    } else {
        const storedCode = leerSesion();
        if (storedCode) {
            const dniEl = document.getElementById('dni');
            if (dniEl) dniEl.value = storedCode;
            setTimeout(buscar, 100);
        }
    }

    initNFC();
    const dniInput = $('dni');
    dniInput?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        buscar();
    });
});

// ── BUSCAR POR DNI ────────────────────────────────────
async function buscar() {
    const dniEl = $('dni');
    const btn   = $('btnC');
    const errEl = $('err');
    const ldEl  = $('ld');
    if (!dniEl) return;

    const dni_or_id = extractPortalCredential(dniEl.value);
    dniEl.value = dni_or_id;
    if (errEl) errEl.classList.add('hidden');

    if (dni_or_id.length < 8) {
        dniEl.style.borderBottomColor = 'var(--red)';
        setTimeout(() => dniEl.style.borderBottomColor = '', 900);
        return;
    }

    if (btn) btn.disabled = true;
    if (ldEl) ldEl.classList.remove('hidden');

    try {
        // Consulta mediada por RPC: el rol anónimo ya no lee las tablas directamente.
        // portal_lookup devuelve SOLO el alumno buscado (por código, UUID o DNI).
        // Con el código demo no se consulta nada: se dibuja una ficha de ejemplo.
        const demoMode = isDemoCode(dni_or_id);
        const demoEstado = demoEstadoPago(dni_or_id);
        let _portalLook = null;
        let stErr = null;
        if (demoMode) {
            _portalLook = buildPortalDemoLookup(demoEstado);
        } else {
            const resp = await window.supabaseClient
                .rpc('portal_lookup', { p_query: dni_or_id });
            _portalLook = resp.data;
            stErr = resp.error;
        }
        marcarDemo(demoMode, demoEstado);

        const stData = (_portalLook && _portalLook.found) ? [_portalLook.student] : [];
        if (!stData || stData.length === 0) {
            if (ldEl) ldEl.classList.add('hidden');
            if (btn) btn.disabled = false;
            if (errEl) {
                errEl.classList.remove('hidden');
                // Si la función aún no existe en Supabase, lo decimos en pantalla.
                if (stErr && /could not find the function|does not exist|PGRST202/i.test(`${stErr.code || ''} ${stErr.message || ''}`)) {
                    if (!errEl.querySelector('#portal-rpc-hint')) {
                        const hint = document.createElement('p');
                        hint.id = 'portal-rpc-hint';
                        hint.style.cssText = 'font:400 12px/1.45 Inter,system-ui,sans-serif;color:#9aa6c4';
                        hint.textContent = 'Nota técnica: la función portal_lookup todavía no está aplicada en Supabase. Para probar la interfaz usa el código demo 00000000.';
                        errEl.appendChild(hint);
                    }
                }
                errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            return;
        }
        
        const student = stData[0];
        const sid = student.id;
        
        const hoy = new Date();
        // Regla de pago vigente: la mensualidad se registra dentro de los primeros
        // 15 días de cada mes. Hasta el día 15 se avisa "pago pendiente" sin bloquear;
        // desde el día 16, si no hay pago registrado, la ficha se bloquea.
        const diaDeHoy = hoy.getDate();
        const limitePlazo = new Date(hoy.getFullYear(), hoy.getMonth(), 15, 23, 59, 59, 999);
        let fecha_venc = null;
        if (student.valid_until) {
            const parts = student.valid_until.split('-');
            fecha_venc = new Date(parts[0], parts[1] - 1, parts[2]);
            fecha_venc.setHours(23, 59, 59, 999);
        }
        let estado_pago = (fecha_venc && fecha_venc >= hoy)
            ? 'al-dia'
            : (diaDeHoy <= 15 ? 'en-plazo' : 'bloqueado');
        // Sólo para la vista de prueba: permite ver el mes en curso y el bloqueo.
        if (student.demo_estado_pago) estado_pago = student.demo_estado_pago;
        const debe = estado_pago === 'bloqueado';
        // Fecha local (no UTC) para que el plazo no se corra al día siguiente.
        const limitePlazoISO = `${limitePlazo.getFullYear()}-${String(limitePlazo.getMonth() + 1).padStart(2, '0')}-${String(limitePlazo.getDate()).padStart(2, '0')}`;
        
        const inicio_ciclo = new Date(hoy.getFullYear(), 0, 1);
        
        const attData = (_portalLook && _portalLook.attendance) ? _portalLook.attendance : [];
            
        let racha = 0;
        let fechas_ord = [];
        if (attData && attData.length > 0) {
            const fechas_vistas = new Set();
            for (const r of attData) {
                const date = new Date(r.created_at);
                const localDateStr = date.toLocaleDateString();
                if (!fechas_vistas.has(localDateStr)) {
                    fechas_vistas.add(localDateStr);
                    fechas_ord.push(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
                }
            }
            if (fechas_ord.length > 0) {
                racha = 1;
                for (let i = 1; i < fechas_ord.length; i++) {
                    const diff = (fechas_ord[i - 1] - fechas_ord[i]) / (1000 * 60 * 60 * 24);
                    if (diff <= 4) racha++;
                    else break;
                }
            }
        }

        const total_sesiones = fechas_ord.length;
        const sesiones_mes = fechas_ord.filter(fecha =>
            fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth()
        ).length;
        const ultima_sesion = fechas_ord.length
            ? fechas_ord[0].toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '')
            : '—';

        // Ritmo por mes: seis cubos con los días de asistencia realmente
        // registrados. Es el único gráfico del portal que sale de la asistencia
        // y no de una medición corporal.
        const meses = (() => {
            const base = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            const cubos = [];
            for (let i = 5; i >= 0; i--) {
                const d0 = new Date(base.getFullYear(), base.getMonth() - i, 1);
                cubos.push({ y: d0.getFullYear(), m: d0.getMonth(), n: 0 });
            }
            for (const f of fechas_ord) {
                const c = cubos.find(x => x.y === f.getFullYear() && x.m === f.getMonth());
                if (c) c.n += 1;
            }
            return cubos;
        })();
        
        const bioData = (_portalLook && _portalLook.biometria) ? _portalLook.biometria : [];
            
        let historial = [];
        let talla_actual = null;
        let peso_actual = null;
        let delta_talla = null;
        let delta_peso = null;
        
        if (bioData && bioData.length > 0) {
            const ultimo = bioData[0];
            talla_actual = ultimo.talla != null ? `${ultimo.talla}m` : null;
            peso_actual = ultimo.peso != null ? `${ultimo.peso}kg` : null;
            
            if (bioData.length >= 2) {
                const anterior = bioData[1];
                if (ultimo.talla != null && anterior.talla != null) {
                    const diff = parseFloat(ultimo.talla) - parseFloat(anterior.talla);
                    const diffCm = Math.round(diff * 100);
                    delta_talla = diff >= 0 ? `+${diffCm}cm` : `${diffCm}cm`;
                }
                if (ultimo.peso != null && anterior.peso != null) {
                    const diff = parseFloat(ultimo.peso) - parseFloat(anterior.peso);
                    const rounded = Math.round(diff * 10) / 10;
                    delta_peso = `${rounded > 0 ? '+' : ''}${rounded}kg`;
                }
            }
            
            historial = bioData.map(r => ({
                fecha: r.fecha,
                talla: r.talla != null ? Number.parseFloat(r.talla) : null,
                peso: r.peso != null ? Number.parseFloat(r.peso) : null,
                salto_cm: r.salto_cm != null ? Number.parseFloat(r.salto_cm) : null,
                sprint_10m_seg: r.sprint_10m_seg != null ? Number.parseFloat(r.sprint_10m_seg) : null
            }));
        }
        
        const data = {
            full_name: student.full_name,
            category: student.categoria ? `Categoría ${student.categoria}` : 'Jugador JR Stars',
            sede: student.sede,
            horario: student.horario,
            grupo: student.grupo,
            turno: student.turno,
            img_url: null,
            batido_credits: student.batido_credits,
            valid_until: student.valid_until || null,
            estado_pago,
            limite_plazo: limitePlazoISO,
            debe,
            racha,
            total_sesiones,
            sesiones_mes,
            ultima_sesion,
            meses,
            registros_fisicos: historial.length,
            talla_actual,
            peso_actual,
            delta_talla,
            delta_peso,
            historial_biometrico: historial
        };
        
        if (ldEl) ldEl.classList.add('hidden');
        if (btn) btn.disabled = false;

        renderCard(data);
        mostrarPaneles('ficha');
        // El código demo no se recuerda: en la próxima visita el portal arranca limpio.
        if (!demoMode) guardarSesion(dni_or_id);
        dniEl.value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (e) {
        console.error(e);
        if (ldEl) ldEl.classList.add('hidden');
        if (btn) btn.disabled = false;
        alert('Error de conexión. Verifica tu internet.');
    }
}

// ── NAVEGACIÓN ENTRE PANELES ──────────────────────────
function mostrarPaneles(vista) {
    const p1 = $('p1'), p2 = $('p2'), p3 = $('p3');
    document.body.classList.toggle('portal-player-view', vista === 'ficha');
    if (vista === 'ficha') {
        if (p1) p1.classList.add('hidden');
        if (p2) p2.classList.remove('hidden');
        if (p3) p3.classList.remove('hidden');
    } else {
        if (p1) p1.classList.remove('hidden');
        if (p2) p2.classList.add('hidden');
        if (p3) p3.classList.add('hidden');
    }
}

function openMetricModal(key, unit, label) {
    if (!window._currentHistoryData) return;
    
    const history = window._currentHistoryData.filter(item => Number.isFinite(item[key]));
    if (!history.length) return;
    
    let modal = document.getElementById('metric-history-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'metric-history-modal';
        modal.className = 'portal-scanner-modal';
        modal.innerHTML = `
          <div class="metric-modal-content" onclick="event.stopPropagation()">
            <div class="metric-modal-head">
               <h3 id="mhm-title"></h3>
               <button onclick="closeMetricModal()" class="metric-modal-close" aria-label="Cerrar">×</button>
            </div>
            <div id="mhm-list" class="pc-history-list"></div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.onclick = closeMetricModal;
    }
    
    document.getElementById('mhm-title').textContent = label;
    
    const listHtml = history.map((item, index) => `
        <div class="pc-history-row${index === 0 ? ' is-latest' : ''}">
          <div>
            <span>${index === 0 ? 'ÚLTIMO CONTROL' : 'CONTROL'}</span>
            <strong>${escapePortalHtml(item.fecha || 'Sin fecha')}</strong>
          </div>
          <div class="mhm-val">${item[key]}${unit}</div>
        </div>
    `).join('');
    
    document.getElementById('mhm-list').innerHTML = listHtml;
    modal.classList.remove('hidden');
}

function closeMetricModal() {
    const modal = document.getElementById('metric-history-modal');
    if (modal) modal.classList.add('hidden');
}

// ── NOVEDADES DE LA SESIÓN ───────────────────────────
const PORTAL_NOTIF_SEEN = 'jrstars_portal_notif_seen';

function publicarNotif(items) {
    window._portalNotifs = Array.isArray(items) ? items : [];
    const seen = (() => {
        try { return new Set(JSON.parse(localStorage.getItem(PORTAL_NOTIF_SEEN) || '[]')); }
        catch { return new Set(); }
    })();
    const pendientes = window._portalNotifs.filter(n => !seen.has(n.id)).length;
    document.querySelectorAll('[data-notif-dot]').forEach(dot => { dot.hidden = pendientes === 0; });
    const panel = $('portal-notif');
    if (panel && !panel.classList.contains('hidden')) pintarNotif();
}

function pintarNotif() {
    const list = $('portal-notif-list');
    if (!list) return;
    const items = Array.isArray(window._portalNotifs) ? window._portalNotifs : [];
    if (!items.length) {
        list.innerHTML = '<p class="portal-notif-empty">Todavía no hay novedades. Cuando se registre un control, una racha o un cambio en la mensualidad, aparecerá aquí.</p>';
        return;
    }
    list.innerHTML = items.map(n => `
        <article class="portal-notif-item" data-tone="${escapePortalHtml(n.tone || 'info')}">
          <span class="portal-notif-bullet" aria-hidden="true"></span>
          <div>
            <strong>${escapePortalHtml(n.title)}</strong>
            <p>${escapePortalHtml(n.body)}</p>
            ${n.tag ? `<small>${escapePortalHtml(n.tag)}</small>` : ''}
          </div>
        </article>`).join('');
}

function marcarNotifVistas() {
    const items = Array.isArray(window._portalNotifs) ? window._portalNotifs : [];
    try { localStorage.setItem(PORTAL_NOTIF_SEEN, JSON.stringify(items.map(n => n.id))); } catch (e) { /* sin almacenamiento */ }
    document.querySelectorAll('[data-notif-dot]').forEach(dot => { dot.hidden = true; });
}

function abrirNotif() {
    const panel = $('portal-notif');
    if (!panel) return;
    window._notifReturnFocus = document.activeElement;
    pintarNotif();
    panel.classList.remove('hidden');
    $('portal-notif-backdrop')?.classList.remove('hidden');
    document.body.classList.add('portal-notif-open');
    document.querySelectorAll('[aria-controls="portal-notif"]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    marcarNotifVistas();
    panel.querySelector('.portal-notif-close')?.focus({ preventScroll: true });
}

function cerrarNotif() {
    const panel = $('portal-notif');
    if (!panel || panel.classList.contains('hidden')) return;
    panel.classList.add('hidden');
    $('portal-notif-backdrop')?.classList.add('hidden');
    document.body.classList.remove('portal-notif-open');
    document.querySelectorAll('[aria-controls="portal-notif"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    const back = window._notifReturnFocus;
    window._notifReturnFocus = null;
    if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') cerrarNotif();
});

function volver() {
    localStorage.removeItem('jrstars_portal_session');
    marcarDemo(false);
    cerrarNotif();
    window._portalNotifs = [];
    const who = $('pt-nav-who');
    if (who) { who.textContent = ''; who.hidden = true; }
    document.body.classList.remove('portal-locked-view');
    mostrarPaneles('buscar');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── SCANNER QR ────────────────────────────────────────
let qrScanner = null;
let qrLocalizationObserver = null;

function localizePortalScanner() {
    const labels = {
        'html5-qrcode-button-camera-permission': 'PERMITIR CÁMARA',
        'html5-qrcode-button-camera-start': 'INICIAR CÁMARA',
        'html5-qrcode-button-camera-stop': 'DETENER CÁMARA',
        'html5-qrcode-anchor-scan-type-change': 'ESCANEAR DESDE UNA FOTO',
        'html5-qrcode-button-file-selection': 'ELEGIR FOTO'
    };
    Object.entries(labels).forEach(([id, label]) => {
        const control = document.getElementById(id);
        if (control && control.textContent !== label) control.textContent = label;
    });
}

function toggleScanner() {
    const container = $('scanner-container');
    if (!container) return;
    const opening = container.classList.contains('hidden');
    container.setAttribute('aria-hidden', String(!opening));
    document.body.classList.toggle('portal-scanner-open', opening);

    if (opening) {
        container.classList.remove('hidden');
        if (!qrScanner) {
            qrScanner = new Html5QrcodeScanner('reader', {
                fps: 15,
                qrbox: (viewWidth, viewHeight) => {
                    const size = Math.floor(Math.min(viewWidth, viewHeight) * .72);
                    return { width: size, height: size };
                },
                rememberLastUsedCamera: true,
                aspectRatio: 1
            });
            qrScanner.render(
                (decodedText) => {
                    try { if (qrScanner.getState() !== 3) qrScanner.pause(true); } catch {}
                    toggleScanner();
                    handleScanCode(decodedText);
                },
                () => {}
            );
            localizePortalScanner();
            const reader = $('reader');
            if (reader && !qrLocalizationObserver) {
                qrLocalizationObserver = new MutationObserver(localizePortalScanner);
                qrLocalizationObserver.observe(reader, { childList: true, subtree: true });
            }
        } else {
            try { if (qrScanner.getState() === 3) qrScanner.resume(); } catch {}
        }
    } else {
        container.classList.add('hidden');
        try { if (qrScanner && qrScanner.getState() !== 3) qrScanner.pause(true); } catch {}
    }
}

document.addEventListener('keydown', event => {
    const scanner = $('scanner-container');
    if (event.key === 'Escape' && scanner && !scanner.classList.contains('hidden')) toggleScanner();
});

// ── HANDLE CÓDIGO (QR o NFC) ──────────────────────────
function handleScanCode(rawCode) {
    const raw = extractPortalCredential(rawCode);

    const dniEl = $('dni');
    if (dniEl) dniEl.value = raw;
    buscar();
}

// ── NFC ───────────────────────────────────────────────
const NDEF_URI_PREFIXES_HOME = [
    '', 'http://www.', 'https://www.', 'http://', 'https://',
    'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.',
    'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://',
    'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:',
    'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://',
    'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:',
    'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

function _homeNfcExtract(record) {
    let fullText = null;
    try {
        if (record.recordType === 'url') {
            const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
            fullText = (NDEF_URI_PREFIXES_HOME[bytes[0]] ?? '') + new TextDecoder('utf-8').decode(bytes.slice(1)).trim();
        } else if (record.recordType === 'text') {
            const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
            const langLen = bytes[0] & 0x3F;
            const charset = (bytes[0] & 0x80) ? 'utf-16' : 'utf-8';
            fullText = new TextDecoder(charset).decode(bytes.slice(1 + langLen)).trim();
        } else {
            fullText = new TextDecoder(record.encoding || 'utf-8').decode(record.data)
                .replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
        }
    } catch { return null; }
    return fullText || null;
}

async function initNFC() {
    if (!('NDEFReader' in window)) return;
    try {
        const ndef = new NDEFReader();
        await ndef.scan();
        ndef.addEventListener('reading', ({ message }) => {
            for (const record of message.records) {
                const raw = _homeNfcExtract(record);
                if (!raw) continue;
                try { if (qrScanner && !$('scanner-container').classList.contains('hidden')) toggleScanner(); } catch {}
                handleScanCode(raw);
                break;
            }
        });
    } catch (e) {
        console.warn('NFC no disponible:', e.message);
    }
}

// ── RENDER FICHA ──────────────────────────────────────
function escapePortalHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
}

function buildMetricSparkline(history, key, unit, label) {
    const points = [...history].reverse().filter(item => Number.isFinite(item[key]));
    if (!points.length) return '';

    const W = 300, H = 100, PAD = 12;
    const values = points.map(item => item[key]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const coords = points.map((item, i) => {
        const x = points.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2) / (points.length - 1));
        const y = H - PAD - ((item[key] - min) / range) * (H - PAD * 2);
        return { x: +x.toFixed(1), y: +y.toFixed(1), val: item[key], fecha: item.fecha };
    });

    const linePts = coords.map(p => `${p.x},${p.y}`).join(' ');
    // Area fill: close path at bottom
    const first = coords[0], last2 = coords[coords.length - 1];
    const areaPath = `M${first.x},${first.y} ` + coords.slice(1).map(p => `L${p.x},${p.y}`).join(' ') + ` L${last2.x},${H} L${first.x},${H} Z`;

    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const diff = prev ? (last[key] - prev[key]) : 0;
    const trendArrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    // Paleta de la academia: azul para la mejora, rojo para el retroceso.
    const trendColor = diff > 0 ? '#153a79' : diff < 0 ? '#c41315' : '#6b7488';
    // For sprint, lower is better — invert trend color
    const isInverse = key === 'sprint_10m_seg';
    const finalColor = isInverse ? (diff < 0 ? '#153a79' : diff > 0 ? '#c41315' : '#6b7488') : trendColor;

    // El cambio se muestra en la unidad que la familia entiende:
    // estatura en cm (no "0.0 m") y sprint con 2 decimales (no "0.0 s").
    const deltaUnits = {
        talla: { factor: 100, unit: 'cm', decimals: 0 },
        peso: { factor: 1, unit: 'kg', decimals: 1 },
        salto_cm: { factor: 1, unit: 'cm', decimals: 1 },
        sprint_10m_seg: { factor: 1, unit: 's', decimals: 2 }
    };
    const du = deltaUnits[key] || { factor: 1, unit: unit, decimals: 1 };
    const deltaText = (Math.abs(diff) * du.factor).toFixed(du.decimals);
    const smallUnit = `<span style="text-transform:none">${du.unit}</span>`;
    // Las métricas se muestran con la tipografía de titulares (Bebas), que no tiene
    // minúsculas: la unidad va en Inter para que se lea "m" y no "M".
    const realUnit = `<span class="pc-unit">${unit}</span>`;

    const gradId = `sg-${key}`;
    const colors = {
        talla: { line: '#e5191b', glow: 'rgba(229,25,27,.55)', fill: 'rgba(229,25,27,.15)' },
        peso:  { line: '#f5a623', glow: 'rgba(245,166,35,.5)',  fill: 'rgba(245,166,35,.12)' },
        salto_cm:      { line: '#153a79', glow: 'rgba(21,58,121,.45)', fill: 'rgba(21,58,121,.12)' },
        sprint_10m_seg: { line: '#76263a', glow: 'rgba(118,38,58,.45)', fill: 'rgba(118,38,58,.12)' },
    };
    const c = colors[key] || colors.talla;

    return `
      <button type="button" class="ms-card ms-card--${key}" onclick="openMetricModal('${key}', '${unit}', '${label}')" aria-label="Ver historial de ${escapePortalHtml(label.replace(/[^\p{L}\p{N}\s.]/gu, '').trim())}">
        <span class="ms-head">
          <span class="ms-head-left">
            <span class="ms-label">${escapePortalHtml(label)}</span>
            <span class="ms-value">${escapePortalHtml(last[key])}${realUnit}</span>
          </span>
          <span class="ms-trend" style="color:${finalColor};">${trendArrow} ${deltaText}${smallUnit}</span>
        </span>
        <svg viewBox="0 0 ${W} ${H}" class="ms-svg" role="img" aria-label="Evolución de ${escapePortalHtml(label.replace(/[^\p{L}\p{N}\s.]/gu, '').trim().toLowerCase())}">
          <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${c.line}" stop-opacity=".35"/>
              <stop offset="100%" stop-color="${c.line}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#${gradId})"/>
          <path class="ms-grid" d="M${PAD} ${Math.round(H*0.25)}H${W-PAD}M${PAD} ${Math.round(H*0.5)}H${W-PAD}M${PAD} ${Math.round(H*0.75)}H${W-PAD}"/>
          <polyline points="${linePts}" fill="none" stroke="${c.line}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px ${c.glow})"/>
          ${coords.map((p, i) => i === coords.length - 1
            ? `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="${c.line}" stroke-width="3"/>`
            : `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${c.line}" opacity=".6"/>`
          ).join('')}
        </svg>
        <span class="ms-foot">
          <span>${escapePortalHtml(points[0].fecha || 'Inicio')}</span>
          <span class="ms-minmax">MIN ${min}${realUnit} · MAX ${max}${realUnit}</span>
          <span>${escapePortalHtml(last.fecha || 'Hoy')}</span>
        </span>
      </button>`;
}

function renderCard(d) {
    const wrap = $('card-wrap');
    if (!wrap) return;

    const fullName = String(d.full_name || 'Jugador JR Stars').trim();
    window._currentPlayerShareName = fullName;
    const name = escapePortalHtml(fullName);
    const firstName = escapePortalHtml(fullName.split(/\s+/)[0] || 'Jugador');
    // Iniciales para el avatar local (sin servicios externos; funciona al compartir).
    const iniciales = (() => {
        const partes = fullName.split(/\s+/).filter(Boolean);
        if (!partes.length) return 'JR';
        const a = partes[0][0] || '';
        const b = partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] || '');
        return (a + b).toUpperCase();
    })();
    const season = new Date().getFullYear();
    const totalSessions = Number(d.total_sesiones) || 0;
    const monthSessions = Number(d.sesiones_mes) || 0;
    const streak = Number(d.racha) || 0;
    const physicalRecords = Number(d.registros_fisicos) || 0;
    const credits = Math.max(0, Number(d.batido_credits) || 0);
    const historyData = Array.isArray(d.historial_biometrico) ? d.historial_biometrico : [];
    const creditBalance = $('kiosk-credit-balance');
    const energyLabel = $('kiosk-energy-label');
    const energyBar = $('kiosk-energy-bar');
    if (creditBalance) creditBalance.textContent = `${credits} ${credits === 1 ? 'CRÉDITO' : 'CRÉDITOS'}`;
    if (energyLabel) energyLabel.textContent = credits >= 15 ? 'ALTA' : credits >= 5 ? 'MEDIA' : 'BAJA';
    if (energyBar) energyBar.style.width = `${Math.min(100, (credits / 20) * 100)}%`;

    const meta = [d.category, d.sede && `Sede ${d.sede}`, d.grupo && `Grupo ${d.grupo}`, d.turno, d.horario]
        .filter(Boolean)
        .map(item => `<span class="epic-chip">${escapePortalHtml(item)}</span>`)
        .join('');
    const status = d.debe
        ? '<span class="epic-status is-locked">Acceso restringido</span>'
        : '<span class="epic-status">Jugador activo</span>';
    const streakTitle = streak >= 8 ? 'Muy constante' : streak >= 4 ? 'Buen ritmo' : streak > 0 ? 'Racha encendida' : 'Aún sin racha';
    const streakCopy = streak > 0
        ? `Vino ${streak} ${streak === 1 ? 'entrenamiento seguido' : 'entrenamientos seguidos'}.`
        : 'Cuando venga al siguiente entrenamiento empieza su racha.';
    const lastBio = historyData[0] || {};
    const saltoCmLatest = Number.isFinite(lastBio.salto_cm) ? `${lastBio.salto_cm}cm` : '—';
    const sprintLatest = Number.isFinite(lastBio.sprint_10m_seg) ? `${lastBio.sprint_10m_seg}s` : '—';

    // Chips en 4 bloques: categoría, sede, grupo y horario (turno + días juntos).
    const sedeTexto = d.sede ? String(d.sede).trim() : '';
    const sedeChip = sedeTexto
        ? (/^sede\b/i.test(sedeTexto) ? sedeTexto : `Sede ${sedeTexto}`)
        : null;
    const horarioChip = [d.turno, d.horario].map(v => (v ? String(v).trim() : '')).filter(Boolean).join(' · ') || null;
    const metaChips = [d.category, sedeChip, d.grupo ? `Grupo ${d.grupo}` : null, horarioChip]
      .filter(Boolean)
      .map(i => `<li class="pc-chip">${escapePortalHtml(i)}</li>`)
      .join('');
    const nameLengthClass = fullName.length > 30
      ? ' is-xlong'
      : fullName.length > 23
        ? ' is-long'
        : fullName.length > 15
          ? ' is-medium'
          : '';

    // ── Datos en palabras para la familia ──────────────────────────────
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
        'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mesLabel = (raw) => {
        const m = String(raw || '').match(/^(\d{4})-(\d{2})$/);
        return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : String(raw || '');
    };
    const vencText = (() => {
        const m = String(d.valid_until || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]}` : null;
    })();
    // Estado de la mensualidad: al día, dentro del plazo del mes o bloqueado.
    const estadoPago = d.estado_pago || (d.debe ? 'bloqueado' : 'al-dia');
    const plazoText = (() => {
        const m = String(d.limite_plazo || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]}`;
        const hoy = new Date();
        return `15 de ${MESES[hoy.getMonth()]}`;
    })();

    // Resumen "antes → ahora": se entiende sin leer un gráfico.
    const primerControl = historyData.length ? historyData[historyData.length - 1] : null;
    const ultimoControl = historyData[0] || null;
    const valido = v => (Number.isFinite(v) ? v : null);
    const cambios = [];
    const u = txt => `<span class="pc-unit">${txt}</span>`;
    if (primerControl && ultimoControl) {
        if (valido(primerControl.talla) !== null && valido(ultimoControl.talla) !== null)
            cambios.push(['Estatura', `${Math.round(primerControl.talla * 100)}${u('cm')} → ${Math.round(ultimoControl.talla * 100)}${u('cm')}`]);
        if (valido(primerControl.peso) !== null && valido(ultimoControl.peso) !== null)
            cambios.push(['Peso', `${primerControl.peso}${u('kg')} → ${ultimoControl.peso}${u('kg')}`]);
        if (valido(primerControl.salto_cm) !== null && valido(ultimoControl.salto_cm) !== null)
            cambios.push(['Salto', `${primerControl.salto_cm}${u('cm')} → ${ultimoControl.salto_cm}${u('cm')}`]);
        if (valido(primerControl.sprint_10m_seg) !== null && valido(ultimoControl.sprint_10m_seg) !== null)
            cambios.push(['Sprint 10 m', `${primerControl.sprint_10m_seg}${u('s')} → ${ultimoControl.sprint_10m_seg}${u('s')}`]);
    }
    const cambiosHtml = cambios.length
        ? cambios.map(([k, v]) => `<div><span>${escapePortalHtml(k)}</span><strong>${v}</strong></div>`).join('')
        : '';
    const fechaPrimera = primerControl ? mesLabel(primerControl.fecha) : '';
    const fechaUltima = ultimoControl ? mesLabel(ultimoControl.fecha) : '';
    const rangoLabel = (fechaPrimera && fechaUltima && fechaPrimera !== fechaUltima)
        ? `De ${fechaPrimera} a ${fechaUltima}`
        : 'Comparación entre controles';

    // ── Reto cercano: el siguiente hito de 5 entrenamientos de la temporada ──
    const siguienteHito = (Math.floor(totalSessions / 5) + 1) * 5;
    const faltanHito = Math.max(1, siguienteHito - totalSessions);
    const retoTexto = totalSessions === 0
        ? 'Su primer hito son <strong>5</strong> entrenamientos de la temporada.'
        : `Le faltan <strong>${faltanHito}</strong> ${faltanHito === 1 ? 'entrenamiento' : 'entrenamientos'} para llegar a <strong>${siguienteHito}</strong> de la temporada.`;
    const anilloLargo = 2 * Math.PI * 52;
    const anilloPct = Math.max(0, Math.min(1, totalSessions / siguienteHito));
    const anilloFin = (anilloLargo * (1 - anilloPct)).toFixed(2);

    // La línea que responde la pregunta de la familia sin leer nada más.
    const resumenLinea = monthSessions > 0
        ? `Este mes vino a <strong>${monthSessions}</strong> ${monthSessions === 1 ? 'entrenamiento' : 'entrenamientos'}; en la temporada suma <strong>${totalSessions}</strong>.`
        : `Este mes todavía no registra entrenamientos; en la temporada suma <strong>${totalSessions}</strong>.`;

    // Lo deportivo se compara consigo mismo. El cuerpo va aparte y plegado.
    const cuerpoKeys = ['Estatura', 'Peso'];
    const filaCambio = ([k, v]) => `<div><dt>${escapePortalHtml(k)}</dt><dd>${v}</dd></div>`;
    const cambiosCuerpoHtml = cambios.filter(c => cuerpoKeys.includes(c[0])).map(filaCambio).join('');

    const chartsJuego = historyData.length ? `
      <div class="pc-charts">
        ${buildMetricSparkline(historyData, 'salto_cm', 'cm', '🦵 Salto')}
        ${buildMetricSparkline(historyData, 'sprint_10m_seg', 's', '⚡ Sprint 10 m')}
      </div>` : `
      <div class="performance-empty">
        <span aria-hidden="true">＋</span>
        <div><strong>Primera medición pendiente</strong><p>Cuando el entrenador registre el primer control, aquí aparecerá su evolución.</p></div>
      </div>`;
    const chartsCuerpo = historyData.length ? `
      <div class="pc-charts is-cuerpo">
        ${buildMetricSparkline(historyData, 'talla', 'm', '📏 Estatura')}
        ${buildMetricSparkline(historyData, 'peso', 'kg', '⚖️ Peso')}
      </div>` : '';

    // ── Datos de la tarjeta que se comparte ────────────────────────────
    // La imagen se construye aparte, con medidas fijas, para no heredar la
    // rejilla de la web ni dejar franjas vacías a los lados.
    const num = v => (Number.isFinite(v) ? Number(v) : null);
    const saltoIni = primerControl ? num(primerControl.salto_cm) : null;
    const saltoFin = ultimoControl ? num(ultimoControl.salto_cm) : null;
    const sprintIni = primerControl ? num(primerControl.sprint_10m_seg) : null;
    const sprintFin = ultimoControl ? num(ultimoControl.sprint_10m_seg) : null;
    window._shareData = {
        nombre: fullName,
        iniciales,
        foto: d.foto_url || null,
        season,
        totalSessions,
        monthSessions,
        streak,
        streakTitle,
        siguienteHito,
        faltanHito,
        controles: physicalRecords,
        chips: [d.category, sedeChip, d.grupo ? `Grupo ${d.grupo}` : null, horarioChip]
            .filter(Boolean).map(String),
        salto: (saltoIni !== null && saltoFin !== null) ? { ini: saltoIni, fin: saltoFin } : null,
        sprint: (sprintIni !== null && sprintFin !== null) ? { ini: sprintIni, fin: sprintFin } : null
    };

    // ── Ritmo por mes: la asistencia real, en columnas ────────────────
    const CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'];
    const LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
    const mesesData = Array.isArray(d.meses) ? d.meses : [];
    const maxMes = Math.max(1, ...mesesData.map(m => Number(m.n) || 0));
    const mesHoy = new Date().getMonth();
    // Resumen hablado del gráfico: el dibujo solo no dice nada a un lector de pantalla.
    const ariaMeses = mesesData.length
        ? mesesData.map(m => `${LARGOS[m.m]}: ${m.n} ${m.n === 1 ? 'día' : 'días'}`).join('; ')
        : 'sin registros';
    const mesesHtml = mesesData.map(m => {
        const n = Number(m.n) || 0;
        const alto = n ? Math.max(8, Math.round((n / maxMes) * 80)) : 0;
        return `
          <div class="pc-ritmo-col${m.m === mesHoy ? ' is-actual' : ''}" style="--h:${alto}%">
            <span class="pc-ritmo-pista">
              ${n ? '<span class="pc-ritmo-relleno"></span>' : ''}
              <span class="pc-ritmo-num">${n}</span>
            </span>
            <span class="pc-ritmo-mes">${CORTOS[m.m]}</span>
          </div>`;
    }).join('');

    const playerPanel = `
      <header class="pc-hero">
        <div class="pc-topline">
          <p class="pc-kicker">Ficha del jugador · Temporada ${season}</p>
          ${estadoPago === 'bloqueado'
            ? '<p class="pc-status-locked">Mensualidad vencida</p>'
            : estadoPago === 'en-plazo'
              ? '<p class="pc-status-pending">Pago pendiente</p>'
              : '<p class="pc-status-active">Al día</p>'}
        </div>
        <div class="pc-hero-body">
          ${d.foto_url
            ? `<img class="pc-avatar" src="${escapePortalHtml(d.foto_url)}" alt="Foto de ${name}">`
            : `<div class="pc-avatar pc-avatar-fallback" role="img" aria-label="Iniciales de ${name}">${iniciales}</div>`}
          <div class="pc-identity">
            <h1 class="pc-name${nameLengthClass}" id="ficha-nombre">${name}</h1>
            <ul class="pc-meta">${metaChips}</ul>
            <p class="pc-hero-line">${resumenLinea}</p>
          </div>
          <aside class="pc-streak" aria-label="Constancia">
            <p class="pc-streak-label">Constancia</p>
            <p class="pc-streak-value">
              <span class="pc-streak-flame" aria-hidden="true">🔥</span>
              <strong class="pc-streak-number">${streak > 0 ? streak : '—'}</strong>
              <span class="pc-streak-unit">${streak > 0 ? 'seguidas' : 'sin racha'}</span>
            </p>
            <div class="pc-streak-info">
              <p class="pc-streak-title">${streakTitle}</p>
              <p class="pc-streak-copy">${streakCopy}</p>
            </div>
          </aside>
        </div>
      </header>`;

    // Administración al final y separada de lo deportivo.
    const adminPago = $('admin-pago');
    const adminPagoSub = $('admin-pago-sub');
    if (adminPago) {
        adminPago.textContent = estadoPago === 'al-dia' ? 'Al día' : estadoPago === 'en-plazo' ? 'Pendiente' : 'Vencida';
    }
    if (adminPagoSub) {
        adminPagoSub.textContent = estadoPago === 'al-dia'
            ? (vencText ? `Cubierta hasta el ${vencText}.` : 'Según el registro de la academia.')
            : `Plazo: ${plazoText}. Se registra dentro de los primeros 15 días del mes.`;
    }

    // La barra de escritorio oculta las secciones que no existen en esta vista.
    document.body.classList.toggle('portal-locked-view', estadoPago === 'bloqueado');

    // ── Novedades: solo datos que ya están en la ficha ─────────────────
    const notifs = [];
    if (estadoPago === 'al-dia') {
        notifs.push({
            id: `pago-al-dia-${d.valid_until || 'sin-fecha'}`,
            tone: 'ok',
            tag: 'Mensualidad',
            title: 'Mensualidad al día',
            body: vencText ? `Cubierta hasta el ${vencText}.` : 'Según el registro de la academia.'
        });
    } else if (estadoPago === 'en-plazo') {
        notifs.push({
            id: `pago-plazo-${d.limite_plazo || 'mes'}`,
            tone: 'warn',
            tag: 'Mensualidad',
            title: 'Mensualidad pendiente',
            body: `Se registra dentro de los primeros 15 días del mes. Plazo: ${plazoText}.`
        });
    } else {
        notifs.push({
            id: `pago-vencido-${d.valid_until || 'sin-fecha'}`,
            tone: 'warn',
            tag: 'Mensualidad',
            title: 'Mensualidad vencida',
            body: 'El historial sigue guardado. Regulariza el pago para volver a verlo.'
        });
    }
    if (streak > 0) {
        notifs.push({
            id: `racha-${streak}`,
            tone: 'ok',
            tag: 'Asistencia',
            title: `Racha de ${streak} ${streak === 1 ? 'entrenamiento' : 'entrenamientos'}`,
            body: `${streakTitle}.`
        });
    } else {
        notifs.push({
            id: 'racha-0',
            tone: 'info',
            tag: 'Asistencia',
            title: 'Sin racha activa',
            body: 'El próximo entrenamiento cuenta para empezar una nueva.'
        });
    }
    if (ultimoControl && ultimoControl.fecha) {
        notifs.push({
            id: `control-${ultimoControl.fecha}`,
            tone: 'info',
            tag: 'Evolución',
            title: 'Último control registrado',
            body: `${mesLabel(ultimoControl.fecha)}. Talla, peso, salto y sprint están en su evolución.`
        });
    }
    if (totalSessions > 0) {
        notifs.push({
            id: `hito-${siguienteHito}`,
            tone: 'info',
            tag: 'Temporada',
            title: `${totalSessions} de ${siguienteHito} entrenos`,
            body: `Le faltan ${faltanHito} ${faltanHito === 1 ? 'entrenamiento' : 'entrenamientos'} para el siguiente hito.`
        });
    }
    // La clave separa las novedades de cada jugador en el mismo dispositivo.
    let playerKey = 0;
    for (const ch of fullName) playerKey = (playerKey * 31 + ch.charCodeAt(0)) | 0;
    playerKey = (playerKey >>> 0).toString(36);
    notifs.forEach(n => { n.id = `${playerKey}-${n.id}`; });
    publicarNotif(notifs);

    if (estadoPago === 'bloqueado') {
        wrap.innerHTML = `
          <article class="epic-card is-locked" id="ficha-jugador">
            ${playerPanel}
            <section class="epic-data-panel epic-locked-panel">
              <div class="epic-report-head"><div><span>REPORTE DE TEMPORADA</span><h3>PROGRESO</h3></div><strong>${season}</strong></div>
              <div class="epic-lock">
                <div class="epic-lock-mark" aria-hidden="true">PENDIENTE</div>
                <div class="epic-lock-icon" aria-hidden="true">!</div>
                <h3>HISTORIAL EN PAUSA</h3>
                <p>La evolución de <strong>${firstName}</strong> sigue guardada. La mensualidad se registra dentro de los primeros 15 días del mes y todavía figura pendiente${vencText ? ` (mes anterior cubierto hasta el ${escapePortalHtml(vencText)})` : ''}. Regularízala para volver a ver sus métricas e historial.</p>
                <button class="epic-pay" onclick="document.getElementById('modal-yape').classList.remove('hidden')">COORDINAR PAGO · YAPE / PLIN</button>
              </div>
            </section>
          </article>`;
        return;
    }

    // Guardar para el modal
    window._currentHistoryData = historyData;

    wrap.innerHTML = `
      <article class="epic-card" id="ficha-jugador" aria-labelledby="ficha-nombre">
        ${playerPanel}
        <div class="pc-body">

          <!-- RITMO: asistencia real por mes -->
          <section class="pc-band pc-band--ritmo" id="asistencia" aria-labelledby="ritmo-titulo">
            <header class="pc-band-head">
              <p class="pc-band-kicker">La temporada</p>
              <h2 class="pc-band-title" id="ritmo-titulo">Su ritmo de entrenamiento</h2>
              <p class="pc-band-sub">${retoTexto}</p>
            </header>

            <div class="pc-ritmo">
              <figure class="pc-ritmo-fig">
                <div class="pc-ritmo-grafica" role="img" aria-label="Días entrenados por mes: ${escapePortalHtml(ariaMeses)}">
                  ${mesesHtml}
                </div>
              </figure>

              <div class="pc-ritmo-lado">
                <figure class="pc-anillo">
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle class="pc-anillo-track" cx="60" cy="60" r="52"></circle>
                    <circle class="pc-anillo-fill" cx="60" cy="60" r="52"
                            style="--aro-fin:${anilloFin};stroke-dasharray:${anilloLargo.toFixed(2)};stroke-dashoffset:${anilloLargo.toFixed(2)}"></circle>
                  </svg>
                  <figcaption class="pc-anillo-centro">
                    <strong data-contar="${totalSessions}">${totalSessions}</strong>
                    <span>entrenos</span>
                  </figcaption>
                </figure>
                <div class="pc-ritmo-copy">
                  <dl class="pc-ritmo-datos">
                    <div><dt>Este mes</dt><dd data-contar="${monthSessions}">${monthSessions}</dd></div>
                    <div><dt>Último entreno</dt><dd>${escapePortalHtml(d.ultima_sesion || '—')}</dd></div>
                  </dl>
                  <div class="pc-ritmo-hito">
                    <progress class="pc-ritmo-hito-pista" value="${totalSessions}" max="${siguienteHito}">${totalSessions} de ${siguienteHito}</progress>
                    <p>Siguiente hito: <strong>${siguienteHito}</strong> entrenos de la temporada</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- EVOLUCIÓN: sus marcas y su tendencia -->
          <section class="pc-band pc-band--evolucion" id="progreso" aria-labelledby="evo-titulo">
            <header class="pc-band-head">
              <p class="pc-band-kicker">Comparado consigo mismo</p>
              <h2 class="pc-band-title" id="evo-titulo">Su evolución</h2>
              <p class="pc-band-sub">${escapePortalHtml(rangoLabel)} · ${physicalRecords} ${physicalRecords === 1 ? 'control registrado' : 'controles registrados'}</p>
            </header>

            ${chartsJuego}

            <p class="pc-evo-note">Son sus propias marcas, del primer control al último: sirven para ver cómo cambia, no son una nota ni una comparación con otros niños.</p>
          </section>

          ${cambiosCuerpoHtml ? `
          <details class="pc-crecimiento">
            <summary>Crecimiento (registro del entrenador)</summary>
            <p class="pc-aviso">Medidas de acompañamiento del desarrollo, tomadas hasta dos veces por trimestre. No evalúan su rendimiento ni su salud y no se comparan con otros niños.</p>
            <dl class="pc-compare">${cambiosCuerpoHtml}</dl>
            ${chartsCuerpo}
          </details>` : ''}

          <button type="button" onclick="compartirProgreso()" class="pc-share" id="btn-compartir">
            <span id="share-text">COMPARTIR PROGRESO</span><b id="share-icon" aria-hidden="true">↗</b>
          </button>
        </div>
      </article>`;

    // Los números entran contando y el anillo se llena: refuerzo breve, sin
    // retrasar la lectura ni mover nada de sitio.
    animarContadores(wrap);
    requestAnimationFrame(() => {
        const aro = wrap.querySelector('.pc-anillo-fill');
        if (aro) aro.classList.add('is-on');
    });
}

// Refuerzo visual: cuenta desde 0 hasta el dato. Se salta con movimiento
// reducido y sirve para cualquier elemento con data-contar.
function animarContadores(root) {
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-contar]').forEach(el => {
        const destino = Number(el.dataset.contar) || 0;
        if (sinMovimiento || destino <= 0) {
            el.textContent = String(destino);
            return;
        }
        const inicio = performance.now();
        const paso = (t) => {
            const p = Math.min(1, (t - inicio) / 700);
            el.textContent = String(Math.round(destino * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
    });
}

// ── RANKING ───────────────────────────────────────────
// El top 5 público de asistencias se retiró de la ficha: comparar niños entre
// sí desmotiva al que queda fuera y mezcla el esfuerzo propio con el de los
// demás. La RPC `portal_ranking` sigue en Supabase, disponible si se decide
// publicar una versión privada (solo la constancia del propio jugador).

function getShareProgressOverlay() {
    let overlay = document.getElementById('share-progress-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'share-progress-overlay';
    overlay.className = 'share-progress-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="share-progress-card" role="status" aria-live="polite">
        <img src="../img/escudo.png" alt="" aria-hidden="true">
        <div class="share-progress-copy">
          <span>JR STARS · PROGRESO</span>
          <strong id="share-progress-label">Preparando imagen…</strong>
          <div class="share-progress-track" role="progressbar" aria-label="Generando imagen" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <i id="share-progress-bar"></i>
          </div>
          <small id="share-progress-percent">0%</small>
          <div class="share-ready-actions" id="share-ready-actions" hidden>
            <button type="button" id="share-now-button">COMPARTIR AHORA</button>
            <button type="button" id="share-cancel-button">Cancelar</button>
          </div>
          <div class="share-download" id="share-download" hidden>
            <img id="share-preview-image" alt="Vista previa de la ficha de progreso">
            <div class="share-download-actions">
              <a id="share-download-link" download>DESCARGAR IMAGEN</a>
              <a id="share-open-link" target="_blank" rel="noopener">ABRIR EN PESTAÑA NUEVA</a>
              <button type="button" id="share-done-button">LISTO</button>
            </div>
            <small>Si el navegador no la guarda, mantén presionada la imagen (o clic derecho) y elige «Guardar imagen como…».</small>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    const done = overlay.querySelector('#share-done-button');
    if (done) {
        done.addEventListener('click', () => {
            resetShareDownload();
            hideShareProgress();
        });
    }
    return overlay;
}

function resetShareDownload() {
    const overlay = document.getElementById('share-progress-overlay');
    if (!overlay) return;
    const box = overlay.querySelector('#share-download');
    const card = overlay.querySelector('.share-progress-card');
    const image = overlay.querySelector('#share-preview-image');
    if (box) box.hidden = true;
    if (card) card.classList.remove('is-download');
    if (image) image.removeAttribute('src');
    if (window._shareBlobUrl) {
        URL.revokeObjectURL(window._shareBlobUrl);
        window._shareBlobUrl = null;
    }
}

// Muestra la imagen ya generada con acciones de clic real del usuario.
// La descarga automática no es fiable: el navegador la bloquea porque ocurre
// segundos después del toque y ya no cuenta como acción del usuario.
function showShareDownload(blob, fileName) {
    const overlay = getShareProgressOverlay();
    const box = overlay.querySelector('#share-download');
    const card = overlay.querySelector('.share-progress-card');
    const image = overlay.querySelector('#share-preview-image');
    const link = overlay.querySelector('#share-download-link');
    const open = overlay.querySelector('#share-open-link');
    if (!box || !image || !link) return;

    if (window._shareBlobUrl) URL.revokeObjectURL(window._shareBlobUrl);
    const url = URL.createObjectURL(blob);
    window._shareBlobUrl = url;

    image.src = url;
    link.href = url;
    link.setAttribute('download', fileName);
    if (open) open.href = url;

    box.hidden = false;
    if (card) card.classList.add('is-download');
    const label = overlay.querySelector('#share-progress-label');
    if (label) label.textContent = 'Tu imagen está lista';
    const actions = overlay.querySelector('#share-ready-actions');
    if (actions) actions.hidden = true;
    window.clearTimeout(window._shareProgressHideTimer);
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

function updateShareProgress(percent, label) {
    const overlay = getShareProgressOverlay();
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    const bar = overlay.querySelector('#share-progress-bar');
    const progress = overlay.querySelector('[role="progressbar"]');
    const text = overlay.querySelector('#share-progress-label');
    const counter = overlay.querySelector('#share-progress-percent');
    if (bar) bar.style.width = `${value}%`;
    if (progress) progress.setAttribute('aria-valuenow', String(value));
    if (text && label) text.textContent = label;
    if (counter) counter.textContent = `${Math.round(value)}%`;
}

function showShareProgress() {
    const overlay = getShareProgressOverlay();
    const actions = overlay.querySelector('#share-ready-actions');
    if (actions) actions.hidden = true;
    resetShareDownload();
    window.clearTimeout(window._shareProgressHideTimer);
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

function hideShareProgress() {
    const overlay = document.getElementById('share-progress-overlay');
    if (!overlay) return;
    resetShareDownload();
    overlay.classList.remove('is-visible');
    window.clearTimeout(window._shareProgressHideTimer);
    window._shareProgressHideTimer = window.setTimeout(() => { overlay.hidden = true; }, 180);
}

// Antes de fotografiar la tarjeta hay que esperar a la tipografía y a que el
// navegador pinte una vez, con tope por si la pestaña está en segundo plano.
async function esperarFuentesYCuadro() {
    if (document.fonts && document.fonts.ready) {
        await Promise.race([
            document.fonts.ready,
            new Promise(resolve => window.setTimeout(resolve, 5000))
        ]);
    }
    await new Promise(resolve => {
        let listo = false;
        const terminar = () => { if (!listo) { listo = true; resolve(); } };
        requestAnimationFrame(() => requestAnimationFrame(terminar));
        window.setTimeout(terminar, 300);
    });
}

function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('No se pudo generar el archivo PNG'));
        }, 'image/png');
    });
}

function getShareFileName() {
    const player = String(window._currentPlayerShareName || 'jugador')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
    return `jr-stars-progreso-${player || 'jugador'}.png`;
}

function downloadShareImage(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showShareResult(message, isError = false) {
    let toast = document.getElementById('share-result-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'share-result-toast';
        toast.className = 'share-result-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.classList.toggle('is-error', isError);
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(window._shareResultTimer);
    window._shareResultTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 5000);
}

function isMobileShareDevice() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
        return navigator.userAgentData.mobile;
    }
    const userAgent = navigator.userAgent || '';
    return /Android|iPhone|iPod|IEMobile|Opera Mini/i.test(userAgent)
        || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
}

function canShareProgressFile(file) {
    try {
        return isMobileShareDevice()
            && typeof navigator.share === 'function'
            && typeof navigator.canShare === 'function'
            && navigator.canShare({ files: [file] });
    } catch {
        return false;
    }
}

function shareProgressFileFromUserTap(file) {
    const overlay = getShareProgressOverlay();
    const actions = overlay.querySelector('#share-ready-actions');
    const shareButton = overlay.querySelector('#share-now-button');
    const cancelButton = overlay.querySelector('#share-cancel-button');
    if (!actions || !shareButton || !cancelButton) {
        return Promise.resolve({ status: 'failed', error: new Error('Controles para compartir no disponibles') });
    }

    actions.hidden = false;
    updateShareProgress(100, 'Imagen lista. Elige dónde publicarla.');

    return new Promise(resolve => {
        const finish = result => {
            shareButton.removeEventListener('click', onShare);
            cancelButton.removeEventListener('click', onCancel);
            shareButton.disabled = false;
            resolve(result);
        };
        const onCancel = () => finish({ status: 'cancelled' });
        const onShare = async () => {
            shareButton.disabled = true;
            shareButton.textContent = 'ABRIENDO APLICACIONES…';
            try {
                await navigator.share({
                    title: 'Progreso en Academia JR Stars',
                    text: '⚽ Mira mi progreso en la Academia JR Stars. Disciplina, constancia y evolución en cada entrenamiento. 🔥🏆',
                    files: [file]
                });
                finish({ status: 'shared' });
            } catch (error) {
                finish({ status: error && error.name === 'AbortError' ? 'cancelled' : 'failed', error });
            } finally {
                shareButton.textContent = 'COMPARTIR AHORA';
            }
        };

        shareButton.addEventListener('click', onShare);
        cancelButton.addEventListener('click', onCancel);
        shareButton.focus({ preventScroll: true });
    });
}

// ── TARJETA PARA COMPARTIR ────────────────────────────────────────────
// Una pieza aparte, de 1080×1350, pensada como carta de jugador: el ancho se
// usa completo, sin la columna de lectura del portal y sin márgenes muertos.
// Sólo lleva datos registrados; las barras comparan al niño consigo mismo.
function construirTarjetaCompartir() {
    const d = window._shareData || {};
    const esc = escapePortalHtml;
    const total = Number(d.totalSessions) || 0;
    const mes = Number(d.monthSessions) || 0;
    const racha = Number(d.streak) || 0;
    const meta = Number(d.siguienteHito) || 5;
    const faltan = Number(d.faltanHito) || 1;
    const season = d.season || new Date().getFullYear();
    const pct = (a, b) => Math.max(0, Math.min(100, Math.round((b > 0 ? a / b : 0) * 100)));
    const fix = (n, dec) => Number(n).toFixed(dec).replace(/\.0+$/, '');

    const filas = [
        { k: 'Entrenos este mes', v: String(mes), u: '', n: 'Del total de la temporada', p: pct(mes, Math.max(mes, total)) },
        { k: 'Entrenos en la temporada', v: String(total), u: '', n: `Siguiente meta: ${meta}`, p: pct(total, meta) }
    ];
    if (d.salto) {
        const dif = +(d.salto.fin - d.salto.ini).toFixed(1);
        filas.push({
            k: 'Salto', v: fix(d.salto.fin, 1), u: 'cm', p: pct(d.salto.ini, Math.max(d.salto.ini, d.salto.fin)),
            n: dif >= 0 ? `+${fix(dif, 1)} cm desde el primer control` : `${fix(dif, 1)} cm desde el primer control`
        });
    }
    if (d.sprint) {
        const dif = +(d.sprint.ini - d.sprint.fin).toFixed(2);
        filas.push({
            k: 'Sprint 10 m', v: fix(d.sprint.fin, 2), u: 's',
            p: pct(Math.min(d.sprint.ini, d.sprint.fin), d.sprint.ini),
            n: dif >= 0 ? `${fix(dif, 2)} s menos que al inicio` : `${fix(Math.abs(dif), 2)} s más que al inicio`
        });
    }
    if (filas.length < 4) {
        filas.push({
            k: 'Controles registrados', v: String(Number(d.controles) || 0), u: '', n: 'Mediciones del entrenador', p: 0
        });
    }

    const chips = (d.chips || []).map(c => `<span class="sc-chip">${esc(c)}</span>`).join('');
    const largoNombre = String(d.nombre || '').length;
    const claseNombre = largoNombre > 24 ? ' is-xl' : largoNombre > 17 ? ' is-l' : '';
    const foto = d.foto
        ? `<img src="${esc(d.foto)}" alt="">`
        : `<span class="sc-iniciales">${esc(d.iniciales || 'JR')}</span>`;

    const el = document.createElement('div');
    el.id = 'share-card';
    el.className = 'sc';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="sc-bg">
        <span class="sc-halo"></span>
        <span class="sc-banda"></span>
        <span class="sc-puntos"></span>
        <span class="sc-aro"></span>
        <strong class="sc-fantasma">${total}</strong>
      </div>

      <header class="sc-top">
        <div class="sc-marca">
          <img src="../img/escudo.png" alt="">
          <div>
            <span>ACADEMIA DE FÚTBOL</span>
            <strong>JR STARS</strong>
          </div>
        </div>
        <div class="sc-temporada">TEMPORADA ${season}</div>
      </header>

      <section class="sc-id">
        <div class="sc-foto">${foto}</div>
        <div class="sc-id-copy">
          <span class="sc-kicker">FICHA DEL JUGADOR</span>
          <h1 class="sc-nombre${claseNombre}">${esc(d.nombre || 'Jugador JR Stars')}</h1>
          <div class="sc-chips">${chips}</div>
        </div>
        <div class="sc-racha">
          <span class="sc-racha-label">CONSTANCIA</span>
          <div class="sc-racha-valor">
            <span class="sc-llama">🔥</span>
            <strong>${racha > 0 ? racha : '—'}</strong>
          </div>
          <span class="sc-racha-unidad">${racha > 0 ? 'SEGUIDAS' : 'SIN RACHA'}</span>
          <span class="sc-racha-titulo">${esc(d.streakTitle || '')}</span>
        </div>
      </section>

      <section class="sc-meta">
        <div class="sc-meta-copy">
          <span>PRÓXIMA META</span>
          <strong>${meta} entrenamientos de la temporada</strong>
        </div>
        <div class="sc-meta-barra"><i style="width:${pct(total, meta)}%"></i></div>
        <span class="sc-meta-falta">Le faltan ${faltan}</span>
      </section>

      <section class="sc-stats">
        ${filas.map(f => `
          <div class="sc-stat">
            <div class="sc-stat-head">
              <span class="sc-stat-label">${esc(f.k)}</span>
              <span class="sc-stat-valor">${esc(f.v)}${f.u ? `<small>${f.u}</small>` : ''}</span>
            </div>
            <div class="sc-stat-barra"><i style="width:${f.p}%"></i></div>
            <small class="sc-stat-nota">${esc(f.n)}</small>
          </div>`).join('')}
      </section>

      <footer class="sc-pie">
        <div class="sc-pie-marca">
          <strong>SIGUE SU PROGRESO</strong>
          <span>academiajrstars.com · Portal del Jugador</span>
        </div>
        <div class="sc-pie-datos">
          <span>955 515 693</span>
          <span>@academiajrstars</span>
        </div>
      </footer>`;
    return el;
}

// Monta la tarjeta fuera de pantalla y espera a que sus imágenes carguen.
async function montarTarjetaCompartir() {
    const previa = document.getElementById('share-card');
    if (previa) previa.remove();
    const el = construirTarjetaCompartir();
    document.body.appendChild(el);
    await esperarFuentesYCuadro();
    await Promise.all(Array.from(el.querySelectorAll('img')).map(img => (
        img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise(res => {
                img.addEventListener('load', res, { once: true });
                img.addEventListener('error', res, { once: true });
                window.setTimeout(res, 6000);
            })
    )));
    return el;
}

async function compartirProgreso() {
    const btnText = document.getElementById('share-text');
    const btnIcon = document.getElementById('share-icon');
    const button = document.getElementById('btn-compartir');
    if (!btnText || window._sharingPlayerProgress) return;

    const originalText = btnText.textContent;
    const originalIcon = btnIcon ? btnIcon.textContent : '';
    window._sharingPlayerProgress = true;
    btnText.textContent = 'PREPARANDO IMAGEN…';
    if (btnIcon) btnIcon.textContent = '⏳';
    if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
    }
    showShareProgress();
    updateShareProgress(6, 'Preparando la ficha…');

    // Se declara fuera del try para que el bloque finally también lo vea.
    let panelAbierto = false;
    let tarjeta = null;

    try {
        if (typeof html2canvas !== 'function') throw new Error('Generador de imágenes no disponible');
        if (!window._shareData) throw new Error('Ficha no cargada');

        updateShareProgress(34, 'Armando la tarjeta…');
        tarjeta = await montarTarjetaCompartir();
        updateShareProgress(68, 'Creando imagen para redes…');

        const canvas = await html2canvas(tarjeta, {
            scale: 1.2,
            width: 1080,
            height: 1350,
            windowWidth: 1200,
            windowHeight: 1450,
            useCORS: true,
            allowTaint: false,
            imageTimeout: 10000,
            logging: false,
            backgroundColor: '#05070d'
        });

        updateShareProgress(90, 'Empaquetando archivo PNG…');
        const blob = await canvasToPngBlob(canvas);
        const fileName = getShareFileName();
        const file = new File([blob], fileName, { type: 'image/png' });
        updateShareProgress(100, 'Imagen lista');
        const canShareFile = canShareProgressFile(file);

        if (canShareFile) {
            const shareResult = await shareProgressFileFromUserTap(file);
            if (shareResult.status === 'failed') {
                console.warn('No se pudo abrir el menú para compartir; se ofrece la descarga.', shareResult.error);
                showShareDownload(blob, fileName);
                panelAbierto = true;
                showShareResult('No se pudo abrir el menú de compartir. Descarga la imagen desde este aviso.', true);
            }
        } else {
            // Sin menú nativo (PC o navegador que no lo soporta): se muestra la
            // imagen con botones de descarga que sí cuentan como acción del usuario.
            showShareDownload(blob, fileName);
            panelAbierto = true;
        }
    } catch (error) {
        console.error('Error al compartir progreso:', error);
        showShareResult('No pudimos crear la imagen. Revisa tu conexión e inténtalo nuevamente.', true);
    } finally {
        if (tarjeta) tarjeta.remove();
        if (!panelAbierto) hideShareProgress();
        window._sharingPlayerProgress = false;
        btnText.textContent = originalText;
        if (btnIcon) btnIcon.textContent = originalIcon;
        if (button) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    }
}
