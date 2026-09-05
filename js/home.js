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
            .select('fecha, talla, peso')
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
    mostrarPaneles('buscar');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── SCANNER QR ────────────────────────────────────────
let qrScanner = null;

function toggleScanner() {
    const container = $('scanner-container');
    if (!container) return;
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        if (!qrScanner) {
            qrScanner = new Html5QrcodeScanner('reader', {
                fps: 15,
                qrbox: { width: 220, height: 220 },
                rememberLastUsedCamera: true
            });
            qrScanner.render(
                (decodedText) => {
                    try { if (qrScanner.getState() !== 3) qrScanner.pause(true); } catch {}
                    toggleScanner();
                    handleScanCode(decodedText);
                },
                () => {}
            );
        } else {
            try { if (qrScanner.getState() === 3) qrScanner.resume(); } catch {}
        }
    } else {
        container.classList.add('hidden');
        try { if (qrScanner && qrScanner.getState() !== 3) qrScanner.pause(true); } catch {}
    }
}

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

    const width = 300;
    const height = 92;
    const inset = 10;
    const values = points.map(item => item[key]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const coordinates = points.map((item, index) => {
        const x = points.length === 1 ? width / 2 : inset + (index * (width - inset * 2) / (points.length - 1));
        const y = height - inset - ((item[key] - min) / range) * (height - inset * 2);
        return { x: x.toFixed(1), y: y.toFixed(1) };
    });
    const line = coordinates.map(point => `${point.x},${point.y}`).join(' ');
    const last = points[points.length - 1];

    return `
      <article class="metric-spark metric-spark--${key}">
        <div class="metric-spark-head"><span>${escapePortalHtml(label)}</span><strong>${escapePortalHtml(last[key])}${unit}</strong></div>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución de ${escapePortalHtml(label.toLowerCase())}">
          <path class="metric-grid-line" d="M10 22H290M10 46H290M10 70H290"></path>
          <polyline class="metric-line" points="${line}"></polyline>
          ${coordinates.map((point, index) => `<circle class="metric-dot${index === coordinates.length - 1 ? ' is-current' : ''}" cx="${point.x}" cy="${point.y}" r="${index === coordinates.length - 1 ? 5 : 3}"></circle>`).join('')}
        </svg>
        <div class="metric-spark-foot"><span>${escapePortalHtml(points[0].fecha || 'Inicio')}</span><span>${escapePortalHtml(last.fecha || 'Actual')}</span></div>
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
    const playerPanel = `
      <section class="epic-player-panel player-overview">
        <div class="epic-player-topline"><span>JR STARS · TEMPORADA ${season}</span>${status}</div>
        <div class="player-overview-grid">
          <div class="player-identity-block">
            <img class="player-crest" src="../img/escudo.png" alt="Escudo JR Stars" width="96" height="96">
            <span class="epic-kicker">Perfil de alto rendimiento</span>
            <h2 class="epic-name">${name}</h2>
            <div class="epic-meta">${meta}</div>
          </div>
          <div class="streak-stage${streak > 0 ? ' is-active' : ''}">
            <span class="streak-overline">Disciplina en juego</span>
            <div class="streak-star-shell" aria-label="${streak} sesiones de racha">
              <span class="streak-spark streak-spark--one" aria-hidden="true">★</span>
              <span class="streak-spark streak-spark--two" aria-hidden="true">★</span>
              <svg class="streak-star" viewBox="0 0 200 190" aria-hidden="true">
                <defs><linearGradient id="streak-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff176"></stop><stop offset=".42" stop-color="#ffb300"></stop><stop offset="1" stop-color="#ff1744"></stop></linearGradient></defs>
                <path d="M100 8 123 69 188 72 137 113 154 178 100 141 46 178 63 113 12 72 77 69Z"></path>
              </svg>
              <div class="streak-value"><strong>${streak}</strong><span>${streak === 1 ? 'SESIÓN' : 'SESIONES'}</span></div>
            </div>
            <strong class="streak-title">${streakTitle}</strong>
            <p>${streakCopy}</p>
          </div>
        </div>
      </section>`;

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
    const metricHistory = historyData.length ? `
      <section class="metric-history">
        <div class="metric-history-head"><div><span>Registro por registro</span><h4>Historial de métricas</h4></div><strong>${physicalRecords}</strong></div>
        <div class="metric-history-list">
          ${historyData.map((item, index) => `
            <article class="metric-history-row${index === 0 ? ' is-latest' : ''}">
              <div><span>${index === 0 ? 'ÚLTIMO CONTROL' : 'CONTROL'}</span><strong>${escapePortalHtml(item.fecha || 'Sin fecha')}</strong></div>
              <dl><div><dt>Estatura</dt><dd>${Number.isFinite(item.talla) ? `${item.talla}m` : '—'}</dd></div><div><dt>Peso</dt><dd>${Number.isFinite(item.peso) ? `${item.peso}kg` : '—'}</dd></div></dl>
            </article>`).join('')}
        </div>
      </section>` : `
      <div class="performance-empty">
        <span aria-hidden="true">＋</span><div><strong>Primera medición pendiente</strong><p>Cuando el entrenador registre talla y peso, aquí aparecerá toda su evolución.</p></div>
      </div>`;
    const charts = historyData.length ? `
      <div class="metric-charts">
        ${buildMetricSparkline(historyData, 'talla', 'm', 'Estatura')}
        ${buildMetricSparkline(historyData, 'peso', 'kg', 'Peso')}
      </div>` : '';

    wrap.innerHTML = `
      <article class="epic-card">
        ${playerPanel}
        <section class="epic-data-panel">
          <section class="performance-zone">
            <div class="performance-heading">
              <div><span>Rendimiento primero</span><h3>EVOLUCIÓN FÍSICA</h3></div>
              <b>${physicalRecords} ${physicalRecords === 1 ? 'CONTROL' : 'CONTROLES'}</b>
            </div>
            <div class="performance-metrics">
              <article class="performance-metric performance-metric--height"><span>Estatura actual</span><strong>${escapePortalHtml(d.talla_actual || '—')}</strong><em>${escapePortalHtml(d.delta_talla || 'Sin tendencia')}</em></article>
              <article class="performance-metric performance-metric--weight"><span>Peso actual</span><strong>${escapePortalHtml(d.peso_actual || '—')}</strong><em>${escapePortalHtml(d.delta_peso || 'Sin tendencia')}</em></article>
              <article class="performance-metric performance-metric--score"><span>Controles</span><strong>${physicalRecords}</strong><em>${hasPhysicalData ? 'Progreso medible' : 'Por comenzar'}</em></article>
            </div>
            ${charts}
            ${metricHistory}
          </section>

          <section class="attendance-zone">
            <div class="epic-section-title">Disciplina y asistencia</div>
            <div class="attendance-grid">
              <article><strong>${totalSessions}</strong><span>Sesiones del ciclo</span></article>
              <article><strong>${monthSessions}</strong><span>Este mes</span></article>
              <article><strong>${escapePortalHtml(d.ultima_sesion || '—')}</strong><span>Último entreno</span></article>
            </div>
            <div class="momentum-strip"><span class="momentum-mark" aria-hidden="true">↗</span><div><strong>${streakTitle}</strong><p>${streakCopy}</p></div></div>
          </section>

          <section class="player-facts">
            <div><span>Sede</span><strong>${escapePortalHtml(d.sede || 'Por asignar')}</strong></div>
            <div><span>Horario</span><strong>${escapePortalHtml(d.horario || 'Por asignar')}</strong></div>
            <div><span>Estado</span><strong>Al día</strong></div>
          </section>
          <div class="epic-actions"><a href="https://wa.me/?text=${waMsg}" target="_blank" rel="noopener noreferrer" class="epic-share"><span>COMPARTIR PROGRESO</span><b>↗</b></a></div>
        </section>
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
