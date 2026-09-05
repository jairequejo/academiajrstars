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

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Leer ?code= de la URL (viene de chip NFC)
    const urlParams = new URLSearchParams(window.location.search);
    const nfcCode = urlParams.get('code');
    if (nfcCode) {
        window.history.replaceState({}, '', window.location.pathname);
        handleScanCode(nfcCode.trim());
    } else {
        const storedDni = localStorage.getItem('jrstars_portal_session');
        if (storedDni) {
            const dniEl = document.getElementById('dni');
            if (dniEl) dniEl.value = storedDni;
            setTimeout(buscar, 100);
        }
    }

    loadRanking();
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
        let student_id_resolved = null;
        const { data: exactCredentials, error: credentialError } = await window.supabaseClient
            .from('credentials')
            .select('student_id')
            .eq('code', dni_or_id)
            .eq('is_active', true)
            .limit(1);
        if (!credentialError && exactCredentials?.length) {
            student_id_resolved = exactCredentials[0].student_id;
        }

        if (!student_id_resolved && dni_or_id.startsWith("JRS:")) {
            const parts = dni_or_id.split(":");
            if (parts.length >= 2) {
                const short_id = parts[1];
                const { data: creds } = await window.supabaseClient
                    .from('credentials')
                    .select('student_id')
                    .like('code', `JRS:${short_id}:%`)
                    .eq('is_active', true)
                    .limit(1);
                if (creds && creds.length > 0) student_id_resolved = creds[0].student_id;
            }
        }
        
        let query = window.supabaseClient
            .from('students')
            .select('id, full_name, valid_until, horario, sede, batido_credits, grupo, categoria, turno')
            .eq('is_active', true);
            
        if (student_id_resolved) {
            query = query.eq('id', student_id_resolved);
        } else {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dni_or_id);
            if (isUUID) {
                query = query.eq('id', dni_or_id);
            } else {
                query = query.eq('dni', dni_or_id);
            }
        }
        
        const { data: stData, error: stErr } = await query;
        if (!stData || stData.length === 0) {
            if (ldEl) ldEl.classList.add('hidden');
            if (btn) btn.disabled = false;
            if (errEl) {
                errEl.classList.remove('hidden');
                errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            return;
        }
        
        const student = stData[0];
        const sid = student.id;
        
        const hoy = new Date();
        let debe = true;
        if (student.valid_until) {
            const parts = student.valid_until.split('-');
            const fecha_venc = new Date(parts[0], parts[1] - 1, parts[2]);
            fecha_venc.setHours(23, 59, 59, 999);
            debe = fecha_venc < hoy;
        }
        
        const inicio_ciclo = new Date(hoy.getFullYear(), 0, 1);
        
        const { data: attData } = await window.supabaseClient
            .from('attendance')
            .select('created_at')
            .eq('student_id', sid)
            .gte('created_at', inicio_ciclo.toISOString())
            .order('created_at', { ascending: false });
            
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
        
        const { data: bioData } = await window.supabaseClient
            .from('biometria')
            .select('fecha, talla, peso, salto_cm, sprint_10m_seg')
            .eq('student_id', sid)
            .order('created_at', { ascending: false })
            .limit(12);
            
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
                peso: r.peso != null ? Number.parseFloat(r.peso) : null
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
            debe,
            racha,
            total_sesiones,
            sesiones_mes,
            ultima_sesion,
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
        localStorage.setItem('jrstars_portal_session', dni_or_id);
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

function volver() {
    localStorage.removeItem('jrstars_portal_session');
    mostrarPaneles('buscar');
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
    const trendColor = diff > 0 ? '#4ade80' : diff < 0 ? '#f87171' : '#a1a1aa';
    // For sprint, lower is better — invert trend color
    const isInverse = key === 'sprint_10m_seg';
    const finalColor = isInverse ? (diff < 0 ? '#4ade80' : diff > 0 ? '#f87171' : '#a1a1aa') : trendColor;

    const gradId = `sg-${key}`;
    const colors = {
        talla: { line: '#e5191b', glow: 'rgba(229,25,27,.55)', fill: 'rgba(229,25,27,.15)' },
        peso:  { line: '#f5a623', glow: 'rgba(245,166,35,.5)',  fill: 'rgba(245,166,35,.12)' },
        salto_cm:      { line: '#4ade80', glow: 'rgba(74,222,128,.5)', fill: 'rgba(74,222,128,.12)' },
        sprint_10m_seg: { line: '#818cf8', glow: 'rgba(129,140,248,.5)', fill: 'rgba(129,140,248,.12)' },
    };
    const c = colors[key] || colors.talla;

    return `
      <article class="ms-card ms-card--${key}">
        <div class="ms-head">
          <div class="ms-head-left">
            <span class="ms-label">${escapePortalHtml(label)}</span>
            <span class="ms-value">${escapePortalHtml(last[key])}${unit}</span>
          </div>
          <span class="ms-trend" style="color:${finalColor};">${trendArrow} ${Math.abs(diff).toFixed(diff % 1 === 0 ? 0 : 1)}${unit}</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" class="ms-svg" role="img" aria-label="Evolución de ${escapePortalHtml(label.toLowerCase())}">
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
        <div class="ms-foot">
          <span>${escapePortalHtml(points[0].fecha || 'Inicio')}</span>
          <span class="ms-minmax">MIN ${min}${unit} · MAX ${max}${unit}</span>
          <span>${escapePortalHtml(last.fecha || 'Hoy')}</span>
        </div>
      </article>`;
}

function renderCard(d) {
    const wrap = $('card-wrap');
    if (!wrap) return;

    const fullName = String(d.full_name || 'Jugador JR Stars').trim();
    const name = escapePortalHtml(fullName);
    const firstName = escapePortalHtml(fullName.split(/\s+/)[0] || 'Jugador');
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
    const streakTitle = streak >= 8 ? 'Racha legendaria' : streak >= 4 ? 'En modo estrella' : streak > 0 ? 'Racha encendida' : 'Tu próxima racha';
    const streakCopy = streak > 0
        ? `${streak} ${streak === 1 ? 'sesión consecutiva' : 'sesiones consecutivas'} construyendo disciplina.`
        : 'El próximo entrenamiento enciende tu estrella.';
    const lastBio = historyData[0] || {};
    const saltoCmLatest = Number.isFinite(lastBio.salto_cm) ? `${lastBio.salto_cm}cm` : '—';
    const sprintLatest = Number.isFinite(lastBio.sprint_10m_seg) ? `${lastBio.sprint_10m_seg}s` : '—';

    const playerPanel = `
      <div class="pc-hero">
        <div class="pc-topline">
          <span>JR STARS · TEMPORADA ${season}</span>
          ${d.debe
            ? '<span class="pc-status-locked">Acceso restringido</span>'
            : '<span class="pc-status-active">Jugador activo</span>'}
        </div>
        <div class="pc-hero-body">
          <img class="pc-avatar"
            src="${d.foto_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(firstName)}&background=e5191b&color=fff&size=256`}"
            alt="Foto de ${name}"
            onerror="this.src='../img/escudo.png'; this.style.objectFit='contain'; this.style.padding='8px';">
          <div class="pc-identity">
            <span class="pc-kicker">Perfil de alto rendimiento</span>
            <h2 class="pc-name">${name}</h2>
            <div class="pc-meta">${[d.category, d.sede && `Sede ${d.sede}`, d.grupo && `Grupo ${d.grupo}`, d.turno, d.horario].filter(Boolean).map(i => `<span class="pc-chip">${escapePortalHtml(i)}</span>`).join('')}</div>
          </div>
          <div class="pc-streak">
            <div class="pc-streak-flame" aria-hidden="true">🔥</div>
            <div class="pc-streak-number">${streak}</div>
            <div class="pc-streak-unit">${streak === 1 ? 'SESIÓN' : 'SESIONES'}</div>
            <div class="pc-streak-info">
              <span class="pc-streak-label">Disciplina</span>
              <div class="pc-streak-title">${streakTitle}</div>
              <p class="pc-streak-copy">${streakCopy}</p>
            </div>
          </div>
        </div>
      </div>`;

    if (d.debe) {
        wrap.innerHTML = `
          <article class="epic-card is-locked">
            ${playerPanel}
            <section class="epic-data-panel epic-locked-panel">
              <div class="epic-report-head"><div><span>REPORTE DE TEMPORADA</span><h3>PROGRESO</h3></div><strong>${season}</strong></div>
              <div class="epic-lock">
                <div class="epic-lock-mark" aria-hidden="true">LOCKED</div>
                <div class="epic-lock-icon" aria-hidden="true">×</div>
                <h3>PROGRESO BLOQUEADO</h3>
                <p>La evolución de <strong>${firstName}</strong> está lista, pero la mensualidad figura pendiente. Regularízala para recuperar sus métricas e historial.</p>
                <button class="epic-pay" onclick="document.getElementById('modal-yape').classList.remove('hidden')">PAGAR S/80 · YAPE / PLIN</button>
              </div>
            </section>
          </article>`;
        return;
    }

    const waMsg = encodeURIComponent(
        `¡${d.full_name} ya suma ${totalSessions} sesiones esta temporada en JR Stars! 🔥🏆\n` +
        `Revisa el Portal del Jugador → ${window.location.origin}/portal/`
    );
    const hasPhysicalData = Boolean(d.talla_actual || d.peso_actual);

    const charts = historyData.length ? `
      <div class="pc-charts">
        ${buildMetricSparkline(historyData, 'talla', 'm', 'Estatura')}
        ${buildMetricSparkline(historyData, 'peso', 'kg', 'Peso')}
        ${buildMetricSparkline(historyData, 'salto_cm', 'cm', 'Salto CMJ')}
        ${buildMetricSparkline(historyData, 'sprint_10m_seg', 's', 'Sprint 10m')}
      </div>` : '';

    const metricHistory = historyData.length ? `
      <div>
        <div class="pc-history-head">
          <div><span>Registro por registro</span><h4>Historial de métricas</h4></div>
          <strong>${physicalRecords}</strong>
        </div>
        <div class="pc-history-list">
          ${historyData.map((item, index) => `
            <div class="pc-history-row${index === 0 ? ' is-latest' : ''}">
              <div>
                <span>${index === 0 ? 'ÚLTIMO CONTROL' : 'CONTROL'}</span>
                <strong>${escapePortalHtml(item.fecha || 'Sin fecha')}</strong>
              </div>
              <dl class="pc-history-dl">
                <div><dt>Estatura</dt><dd>${Number.isFinite(item.talla) ? `${item.talla}m` : '—'}</dd></div>
                <div><dt>Peso</dt><dd>${Number.isFinite(item.peso) ? `${item.peso}kg` : '—'}</dd></div>
                <div><dt>Salto</dt><dd>${Number.isFinite(item.salto_cm) ? `${item.salto_cm}cm` : '—'}</dd></div>
                <div><dt>Sprint</dt><dd>${Number.isFinite(item.sprint_10m_seg) ? `${item.sprint_10m_seg}s` : '—'}</dd></div>
              </dl>
            </div>`).join('')}
        </div>
      </div>` : `
      <div class="performance-empty">
        <span aria-hidden="true">＋</span>
        <div><strong>Primera medición pendiente</strong><p>Cuando el entrenador registre talla y peso, aquí aparecerá toda su evolución.</p></div>
      </div>`;

    wrap.innerHTML = `
      <article class="epic-card">
        ${playerPanel}
        <div class="pc-body">
          <div class="pc-section-head">
            <div class="pc-section-head-left">
              <span>Rendimiento primero</span>
              <h3>EVOLUCIÓN FÍSICA</h3>
            </div>
            <span class="pc-section-badge">${physicalRecords} ${physicalRecords === 1 ? 'CONTROL' : 'CONTROLES'}</span>
          </div>

          <div class="pc-metrics-grid">
            <div class="pc-metric">
              <span class="pc-metric-label">📏 Estatura actual</span>
              <span class="pc-metric-value">${escapePortalHtml(d.talla_actual || '—')}</span>
              <span class="pc-metric-delta" style="${d.delta_talla ? 'color:#16a34a;' : 'color:#aaa;'}">${escapePortalHtml(d.delta_talla || 'Sin tendencia')}</span>
            </div>
            <div class="pc-metric pc-metric--gold">
              <span class="pc-metric-label">⚖️ Peso actual</span>
              <span class="pc-metric-value">${escapePortalHtml(d.peso_actual || '—')}</span>
              <span class="pc-metric-delta" style="${d.delta_peso ? 'color:#d97706;' : 'color:#aaa;'}">${escapePortalHtml(d.delta_peso || 'Sin tendencia')}</span>
            </div>
            <div class="pc-metric pc-metric--green">
              <span class="pc-metric-label">🦵 Salto Vertical</span>
              <span class="pc-metric-value" style="${saltoCmLatest === '—' ? 'color:#bbb;font-size:32px;' : ''}">${saltoCmLatest}</span>
              <span class="pc-metric-delta" style="${saltoCmLatest === '—' ? 'color:#bbb;font-size:9px;background:#f3f3f0;padding:3px 7px;border-radius:6px;' : 'color:#16a34a;'}">${saltoCmLatest === '—' ? 'Pendiente de medir' : 'Potencia CMJ'}</span>
            </div>
            <div class="pc-metric pc-metric--purple">
              <span class="pc-metric-label">⚡ Sprint 10m</span>
              <span class="pc-metric-value" style="${sprintLatest === '—' ? 'color:#bbb;font-size:32px;' : ''}">${sprintLatest}</span>
              <span class="pc-metric-delta" style="${sprintLatest === '—' ? 'color:#bbb;font-size:9px;background:rgba(255,255,255,.08);padding:3px 7px;border-radius:6px;' : ''}">${sprintLatest === '—' ? 'Pendiente de medir' : 'Aceleración'}</span>
            </div>
          </div>

          ${charts}
          ${metricHistory}

          <div class="pc-divider"></div>

          <div class="pc-att-label">Disciplina y asistencia</div>
          <div class="pc-att-grid">
            <div class="pc-att-card"><strong>${totalSessions}</strong><span>Sesiones del ciclo</span></div>
            <div class="pc-att-card"><strong>${monthSessions}</strong><span>Este mes</span></div>
            <div class="pc-att-card"><strong>${escapePortalHtml(d.ultima_sesion || '—')}</strong><span>Último entreno</span></div>
          </div>
          <div class="pc-momentum">
            <div class="pc-momentum-icon" aria-hidden="true">↗</div>
            <div><strong>${streakTitle}</strong><p>${streakCopy}</p></div>
          </div>

          <a href="https://wa.me/?text=${waMsg}" target="_blank" rel="noopener noreferrer" class="pc-share">
            <span>COMPARTIR PROGRESO</span><b>↗</b>
          </a>
        </div>
      </article>`;
}

// ── RANKING ───────────────────────────────────────────
async function loadRanking() {
    const el = $('ranking');
    if (!el) return;
    try {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { data: atts, error: errAtt } = await window.supabaseClient
            .from('attendance')
            .select('student_id')
            .gte('created_at', firstDay);
            
        if (errAtt || !atts || !atts.length) {
            el.innerHTML = '<div class="rk-empty">Datos disponibles próximamente.</div>';
            return;
        }
        
        const counts = {};
        for (const r of atts) counts[r.student_id] = (counts[r.student_id] || 0) + 1;
        
        const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
        if (!sorted.length) {
            el.innerHTML = '<div class="rk-empty">Datos disponibles próximamente.</div>';
            return;
        }
        
        const ids = sorted.map(x=>x[0]);
        const { data: stds, error: errStds } = await window.supabaseClient
            .from('students')
            .select('id, full_name')
            .in('id', ids);
            
        const stMap = {};
        if (stds) stds.forEach(s => stMap[s.id] = s);
        
        const result = sorted.map(([sid, count]) => {
            const st = stMap[sid];
            let short = sid;
            if (st) {
                const parts = st.full_name.split(' ');
                short = parts[0] + (parts.length > 1 ? ' ' + parts[1][0] + '.' : '');
            }
            return { student_id: sid, name: short, score: count };
        });
        
        el.innerHTML = result.map((item, i) => `
          <div class="rk-item${i === 0 ? ' first' : ''}">
            <div class="rk-pos">${i + 1}</div>
            <div class="rk-name">${escapePortalHtml(item.name)}</div>
            <div class="rk-score">🔥 ${escapePortalHtml(item.score)}</div>
          </div>`).join('');
    } catch {
        el.innerHTML = '<div class="rk-empty" style="color:var(--red2)">No disponible.</div>';
    }
}
