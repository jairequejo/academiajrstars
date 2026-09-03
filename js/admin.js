// admin/admin.js — Panel de administración JR Stars

// ── AUTH ──────────────────────────────────────────────
const token = localStorage.getItem('jr_admin_token');
if (!token) window.location.href = '/admin/login.html';

document.getElementById('admin-email').textContent =
  localStorage.getItem('jr_admin_email') || '';

const H = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

function logout() {
  localStorage.removeItem('jr_admin_token');
  localStorage.removeItem('jr_admin_email');
  window.location.href = '/admin/login.html';
}

// ── SIDEBAR MOBILE ────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('visible');
  document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

// ── NAVEGACIÓN ────────────────────────────────────────
let paginaActual = 'stats';

function goTo(page, ev) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  const navItem = document.getElementById(`nav-${page}`);
  if (navItem) navItem.classList.add('active');

  paginaActual = page;
  closeSidebar();

  if (page === 'stats') loadStats();
  if (page === 'alumnos') loadAlumnos();
  if (page === 'batidos') loadCreditos();
  if (page === 'rendimiento') resetBioSearch();
  if (page === 'ranking') cargarRanking();
  if (page === 'calendario') loadCalendario();
  if (page === 'entrenadores') loadEntrenadores();
  
  if (page === 'scanner') {
      setTimeout(initAdminScanner, 200);
  } else {
      if (typeof stopAdminScanner === 'function') stopAdminScanner();
  }
}

// Barra de navegación inferior (móvil)
function setBottomNav(page) {
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`bnav-${page}`);
  if (btn) btn.classList.add('active');
}

// ── TOAST ─────────────────────────────────────────────
function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.innerHTML = adminIcon(type === 'error' ? 'error' : 'check');
  t.appendChild(document.createTextNode(msg));
  t.className = `toast visible ${type === 'error' ? 'error' : ''}`;
  setTimeout(() => t.classList.remove('visible'), 3000);
}

// ── STATS ─────────────────────────────────────────────
async function generate_jrs_code(student_id, full_name, valid_until) {
    const short_id = student_id.substring(0, 8);
    let valid_until_str = "20991231";
    if (valid_until) {
        const d = new Date(valid_until);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        if (!isNaN(d)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            valid_until_str = `${y}${m}${dd}`;
        }
    }
    const firstName = full_name ? full_name.trim().split(' ')[0] : "USER";
    const name_b64url = btoa(unescape(encodeURIComponent(firstName))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const message = `${short_id}|${valid_until_str}|${name_b64url}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode('default_secret_key_123'),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return `JRS:${short_id}:${valid_until_str}:${name_b64url}:${hashHex.substring(0, 16)}`;
}


async function generate_jrs_code(student_id, full_name, valid_until) {
    const short_id = student_id.substring(0, 8);
    let valid_until_str = "20991231";
    if (valid_until) {
        const d = new Date(valid_until);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        if (!isNaN(d)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            valid_until_str = `${y}${m}${dd}`;
        }
    }
    const firstName = full_name ? full_name.trim().split(' ')[0] : "USER";
    const name_b64url = btoa(unescape(encodeURIComponent(firstName))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const message = `${short_id}|${valid_until_str}|${name_b64url}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode('default_secret_key_123'),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return `JRS:${short_id}:${valid_until_str}:${name_b64url}:${hashHex.substring(0, 16)}`;
}

async function loadStats() {
  try {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];

    const { count: totalAlumnos } = await window.supabaseClient.from('students').select('id', {count: 'exact', head: true}).eq('is_active', true);
    const { count: presentesHoy } = await window.supabaseClient.from('attendance').select('id', {count: 'exact', head: true}).gte('created_at', `${hoyStr}T00:00:00`).lte('created_at', `${hoyStr}T23:59:59`);
    
    document.getElementById('s-total').textContent = totalAlumnos || 0;
    document.getElementById('s-presentes').textContent = presentesHoy || 0;
    document.getElementById('s-ausentes').textContent = Math.max(0, (totalAlumnos || 0) - (presentesHoy || 0));
    document.getElementById('s-fecha').textContent = hoyStr;
  } catch (e) { console.error(e); }
}


// ── SCANNER ───────────────────────────────────────────
let _adminScanner = null;
let _adminScannerStarted = false;

function initAdminScanner() {
    if (_adminScannerStarted) return;
    _adminScannerStarted = true;

    const readerEl = document.getElementById('admin-reader');
    if (!readerEl) return;

    _adminScanner = new Html5Qrcode('admin-reader');

    Html5Qrcode.getCameras()
        .then(cameras => {
            if (!cameras || cameras.length === 0) {
                readerEl.innerHTML = '<p style="color:red;font-family:monospace">No se encontró cámara.</p>';
                return;
            }

            // Preferir cámara trasera
            let camId = cameras[0].id;
            const back = cameras.find(c =>
                c.label.toLowerCase().includes('back') ||
                c.label.toLowerCase().includes('rear') ||
                c.label.toLowerCase().includes('environment')
            );
            if (back) camId = back.id;

            return _adminScanner.start(
                camId,
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    // Extraer código JRS si viene en URL
                    let code = decodedText;
                    if (decodedText.includes('?code=')) {
                        code = decodedText.split('?code=')[1];
                    }
                    onAdminQRScanned(code);
                },
                () => { /* frame sin QR, ignorar */ }
            );
        })
        .catch(err => {
            console.warn('[Admin Scanner] No camera available or permissions denied. Scanner will be dormant.');
            readerEl.innerHTML = `<div style="padding:1rem;color:var(--gray)">No camera detected. Used for QR only if connected.</div>`;
        });
        
    initNFC();
}

function stopAdminScanner() {
    if (_adminScanner) {
        try {
            _adminScanner.stop().catch(() => {});
        } catch(e) {}
        _adminScanner = null;
        _adminScannerStarted = false;
    }
}


async function onAdminQRScanned(code) {
    if (!code) return;

    const resultEl = document.getElementById('scan-result');
    const historyEl = document.getElementById('scan-history');

    if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.className = 'scan-result';
        resultEl.textContent = 'Procesando...';
    }

    try {
        const res = await fetch('/attendance/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        const data = await res.json();
        const nombre = data.student_name || 'Desconocido';
        const estado = data.status || 'error';
        const mensaje = data.message || data.detail || '';

        if (resultEl) {
            resultEl.className = `scan-result ${estado}`;
            if (estado === 'debe') {
              resultEl.innerHTML = `<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#ban"></use></svg> <strong>${nombre}</strong><br>
                <span style="color:#ff6ec7;font-size:.85rem">MENSUALIDAD VENCIDA</span><br>
                <span style="font-size:.8rem;opacity:.8">${data.detalle || ''}</span>`;
            } else {
              resultEl.innerHTML = mensaje;
            }
        }

        if (historyEl) {
            const hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const li = document.createElement('li');
            li.style.cssText = 'padding:.5rem 0;border-bottom:1px solid var(--border);font-family:var(--font-cond);font-size:.9rem';
            const color = estado === 'debe' ? '#e91e8c' : 'var(--gold)';
            li.innerHTML = `<strong style="color:${color}">${hora}</strong> — ${nombre || code}`;
            historyEl.insertBefore(li, historyEl.firstChild);
            if (historyEl.children.length > 10) historyEl.removeChild(historyEl.lastChild);
        }

        setTimeout(() => { if (resultEl) resultEl.style.display = 'none'; }, 3000);

    } catch (e) {
        if (resultEl) {
            resultEl.className = 'scan-result error';
            resultEl.innerHTML = adminIcon('error') + ' Error de conexión';
            setTimeout(() => { resultEl.style.display = 'none'; }, 2000);
        }
    }
}



// ── NFC (Admin Scanner) ───────────────────────────────
// Tabla oficial de prefijos URI del estándar NDEF
const NDEF_URI_PREFIXES_ADMIN = [
  '', 'http://www.', 'https://www.', 'http://', 'https://',
  'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.',
  'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://',
  'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:',
  'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://',
  'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:',
  'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

function _nfcExtractCode(record) {
  let fullText = null;
  try {
    if (record.recordType === 'url') {
      const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
      const prefix = NDEF_URI_PREFIXES_ADMIN[bytes[0]] ?? '';
      fullText = prefix + new TextDecoder('utf-8').decode(bytes.slice(1)).trim();
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

  if (!fullText) return null;
  if (fullText.startsWith('http://') || fullText.startsWith('https://')) {
    try {
      const url = new URL(fullText);
      const p = url.searchParams.get('code');
      if (p) return decodeURIComponent(p);
    } catch { /* fallback */ }
    const idx = fullText.indexOf('?code=');
    if (idx !== -1) return decodeURIComponent(fullText.slice(idx + 6));
    return null;
  }
  if (fullText.startsWith('JRS:') || fullText.startsWith('STU-')) return fullText;
  if (fullText.includes('?code=')) return decodeURIComponent(fullText.split('?code=')[1]);
  return null;
}

async function initNFC() {
  if (!('NDEFReader' in window)) return;
  try {
    const ndef = new NDEFReader();
    await ndef.scan();

    // Mostrar badge NFC activo
    const badge = document.getElementById('nfc-badge-admin');
    if (badge) badge.style.display = 'inline-flex';

    ndef.addEventListener('reading', ({ message }) => {
      for (const record of message.records) {
        const code = _nfcExtractCode(record);
        if (!code) continue;
        processAdminScan(code);
        break; // primer record válido — detener loop
      }
    });
  } catch (e) {
    console.warn('NFC no disponible en admin:', e.message);
  }
}



async function processAdminScan(code) {
  try {
    const res = await fetch('/attendance/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const d = await res.json();
    const el = document.getElementById('scan-result');
    if (el) {
      el.style.display = 'block';
      el.className = `scan-result ${d.status}`;
      if (d.status === 'debe') {
        el.innerHTML = `<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#ban"></use></svg> <strong>${d.student_name}</strong><br>
          <span style="color:#ff6ec7;font-size:.85rem">MENSUALIDAD VENCIDA</span><br>
          <span style="font-size:.8rem;opacity:.8">${d.detalle || ''}</span>`;
      } else {
        el.innerHTML = d.message;
      }
      setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
    const li = document.createElement('li');
    li.style.cssText = 'padding:.5rem 0;border-bottom:1px solid var(--border);font-family:var(--font-cond);font-size:.9rem';
    const color = d.status === 'debe' ? '#e91e8c' : 'var(--gold)';
    li.innerHTML = `<strong style="color:${color}">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> <svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#radio"></use></svg> — ${d.student_name || code}`;
    document.getElementById('scan-history')?.prepend(li);
  } catch (e) {
    console.warn('Error procesando NFC en admin:', e);
  }
}



// ── ALUMNOS (Registro + Cobro Inicial y Tabla Semáforo) ──
let alumnosData = []; // cache para filtros


async function loadAlumnos() {
  try {
    const { data, error } = await window.supabaseClient.from('students').select('*').order('full_name');
    if (error) throw error;
    alumnosData = data || [];
    renderAlumnos(alumnosData);
  } catch(e) {
    console.error(e);
    showToast('Error cargando alumnos', 'error');
  }
}


function aplicarFiltros() {
  const estado = document.getElementById('filtro-estado')?.value || '';
  const horario = document.getElementById('filtro-horario')?.value || '';
  const sede = document.getElementById('filtro-sede')?.value || '';
  const grupo = document.getElementById('filtro-grupo')?.value || '';
  const busqueda = (document.getElementById('filtro-busqueda')?.value || '').toLowerCase().trim();
  const hoy = new Date();

  const filtrados = alumnosData.filter(a => {
    // Filtro búsqueda de texto
    if (busqueda && !a.full_name.toLowerCase().includes(busqueda)) return false;
    // Filtro horario
    if (horario && (a.horario || '').toLowerCase() !== horario.toLowerCase()) return false;
    // Filtro sede
    if (sede && (a.sede || '').toLowerCase() !== sede.toLowerCase()) return false;
    // Filtro grupo
    if (grupo && (a.grupo || '').toLowerCase() !== grupo.toLowerCase()) return false;
    // Filtro estado
    if (estado) {
      if (estado === 'inactivo' && a.is_active !== false) return false;
      if (estado !== 'inactivo' && !a.is_active) return false;
      if (estado === 'al-dia') {
        if (!a.valid_until) return false;
        const f = new Date(a.valid_until); f.setMinutes(f.getMinutes() + f.getTimezoneOffset());
        if (f < hoy) return false;
      }
      if (estado === 'vencido') {
        if (!a.valid_until) return true;
        const f = new Date(a.valid_until); f.setMinutes(f.getMinutes() + f.getTimezoneOffset());
        if (f >= hoy) return false;
      }
    }
    return true;
  });

  renderAlumnos(filtrados);
}

function accionesAlumno(a) {
  const id = encodeURIComponent(a.id);
  return `<button class="btn btn-outline" type="button" data-alumno-action="editar" data-alumno-id="${id}">${adminIcon("edit")} Editar</button>
    <button class="btn btn-gold" type="button" data-alumno-action="ver" data-alumno-id="${id}">${adminIcon("user")} Ver</button>`;
}

function renderAlumnos(data) {
  const container = document.getElementById('alumnos-list');
  if (!data.length) {
    container.innerHTML = '<p style="color:var(--gray);font-family:var(--font-cond);padding:1rem 0">No se encontraron alumnos con esos filtros.</p>';
    return;
  }
  const hoy = new Date();

  // Vista mobile: cards en lugar de tabla
  const esMobile = window.innerWidth <= 700;

  if (esMobile) {
    container.innerHTML = data.map(a => {
      let estadoColor = 'var(--red2)', estadoTexto = 'Inactivo', vencimiento = '—';
      if (a.is_active) {
        if (a.valid_until) {
          const fv = new Date(a.valid_until); fv.setMinutes(fv.getMinutes() + fv.getTimezoneOffset());
          vencimiento = fv.toLocaleDateString('es-PE');
          if (fv >= hoy) { estadoColor = '#00ff88'; estadoTexto = 'Al Día'; }
          else { estadoColor = 'var(--gold)'; estadoTexto = 'Vencido'; }
        } else { estadoColor = 'var(--gold)'; estadoTexto = 'Sin Pago'; }
      }
      return `
      <div class="alumno-card" style="opacity:${a.is_active ? '1' : '0.55'}">
        <div class="alumno-card-header">
          <div>
            <div class="alumno-card-name">${a.full_name}</div>
            <div style="font-size:.72rem;color:var(--gray);font-family:var(--font-mono)">DNI: ${a.dni || '—'}</div>
          </div>
          <span style="color:${estadoColor};font-weight:bold;font-size:.8rem;font-family:var(--font-cond)">${estadoTexto}</span>
        </div>
        <div class="alumno-card-row">
          <span class="badge badge-gold">${a.horario || 'LMV'}</span>
          <span style="font-family:var(--font-mono);font-size:.8rem;color:var(--gray)">Vence: ${vencimiento}</span>
        </div>
        <div class="alumno-card-actions alumno-actions">${accionesAlumno(a)}</div>
      </div>`;
    }).join('');
  } else {
    container.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th>Nombre</th><th>Estado</th><th>Vence</th><th>Horario</th><th>Acciones</th>
      </tr></thead>
      <tbody>
        ${data.map(a => {
      let estadoColor = 'var(--red2)', estadoTexto = 'Inactivo', vencimiento = '—';
      if (a.is_active) {
        if (a.valid_until) {
          const fv = new Date(a.valid_until); fv.setMinutes(fv.getMinutes() + fv.getTimezoneOffset());
          vencimiento = fv.toLocaleDateString('es-PE');
          if (fv >= hoy) { estadoColor = '#00ff88'; estadoTexto = 'Al Día'; }
          else { estadoColor = 'var(--gold)'; estadoTexto = 'Vencido'; }
        } else { estadoColor = 'var(--gold)'; estadoTexto = 'Sin Pago'; }
      }
      return `
          <tr style="opacity:${a.is_active ? '1' : '0.5'}">
            <td><strong>${a.full_name}</strong><br><span style="font-size:.75rem;color:var(--gray)">DNI: ${a.dni || '—'}</span></td>
            <td><span style="color:${estadoColor};font-weight:bold;font-size:.85rem">${estadoTexto}</span></td>
            <td style="font-family:var(--font-mono);font-size:.85rem">${vencimiento}</td>
            <td><span class="badge badge-gold">${a.horario || 'LMV'}</span></td>
            <td><div class="alumno-actions">${accionesAlumno(a)}</div></td>
          </tr>`;
    }).join('')}
      </tbody>
    </table>`;
  }
}


async function crearAlumno() {
  const nombre = document.getElementById('a-nombre').value.trim();
  const dni = document.getElementById('a-dni').value.trim();
  const fechaNac = document.getElementById('a-fecha-nacimiento')?.value || null;
  const apoderado = document.getElementById('a-apoderado').value.trim();
  const telefono = document.getElementById('a-telefono').value.trim();
  const sede = document.getElementById('a-sede')?.value || null;
  const grupo = document.getElementById('a-grupo')?.value || null;
  const categoria = document.getElementById('a-categoria')?.value || null;
  const pagoMes = parseFloat(document.getElementById('a-pago-mes').value) || 0;
  const pagoMat = parseFloat(document.getElementById('a-pago-mat').value) || 0;
  const metodo = document.getElementById('a-metodo').value;
  const horario = document.getElementById('a-horario').value;
  const turno = document.getElementById('a-turno')?.value || null;

  if (!nombre) {
    showToast('El nombre es obligatorio', 'error');
    return false;
  }

  const hoy = new Date();
  hoy.setDate(hoy.getDate() + 30);
  const fecha_vencimiento_str = hoy.toISOString().split('T')[0];

  const insert_data = {
      full_name: nombre,
      dni: dni || null,
      fecha_nacimiento: fechaNac || null,
      horario: horario,
      sede: sede || null,
      turno: turno || null,
      grupo: grupo || null,
      categoria: categoria || null,
      is_active: true,
      batido_credits: 0,
      valid_until: fecha_vencimiento_str,
      parent_name: apoderado || null,
      parent_phone: telefono || null,
      tarifa_mensual: pagoMes
  };

  try {
      const { data: nuevo_alumno_data, error: insertError } = await window.supabaseClient.from('students').insert(insert_data).select();
      if (insertError) throw insertError;
      const nuevo_alumno = nuevo_alumno_data[0];

      try {
          const codigo_qr = await generate_jrs_code(nuevo_alumno.id, nuevo_alumno.full_name, fecha_vencimiento_str);
          const { error: credErr } = await window.supabaseClient.from('credentials').insert({
              student_id: nuevo_alumno.id,
              code: codigo_qr,
              is_active: true
          });
          if (credErr) throw credErr;
      } catch (e) {
          await window.supabaseClient.from('students').delete().eq('id', nuevo_alumno.id);
          throw new Error('Error al generar credencial');
      }

      if (pagoMes > 0) {
          const { error: pagoErr } = await window.supabaseClient.from('mensualidades').insert({
              student_id: nuevo_alumno.id,
              monto: pagoMes,
              metodo_pago: metodo,
              fecha_inicio: new Date().toISOString().split('T')[0],
              fecha_vencimiento: fecha_vencimiento_str
          });
          if (pagoErr) throw pagoErr;
      }

      document.getElementById('a-nombre').value = '';
      document.getElementById('a-dni').value = '';
      document.getElementById('a-fecha-nacimiento').value = '';
      document.getElementById('a-apoderado').value = '';
  } catch (err) {
      console.error(err);
      showToast(`Error: ${err.message || 'Error de conexión'}`, 'error');
      return false;
  }
  document.getElementById('a-telefono').value = '';
  document.getElementById('a-sede').value = '';
  document.getElementById('a-grupo').value = '';
  document.getElementById('a-categoria').value = '';
  showToast(pagoMes > 0 ? 'Alumno inscrito. Cobro registrado.' : 'Alumno inscrito.');
  loadAlumnos();
  return true;
}



function toggleEstadoAlumno(id, nombre, reactivar) {
  window.adminAlumnoUI.confirmarEstado(id, reactivar);
}


async function verQR(studentId, inline = false) {
  try {
    const { data, error } = await window.supabaseClient.from('credentials').select('code').eq('student_id', studentId).eq('is_active', true).limit(1);
    if (error) throw error;
    let codeStr = '';
    if (data && data.length > 0) {
      codeStr = data[0].code;
    } else {
      showToast('Generando nuevo QR...', 'ok');
      const { data: stData, error: stError } = await window.supabaseClient.from('students').select('full_name, valid_until').eq('id', studentId).single();
      if (stError) throw stError;
      codeStr = await generate_jrs_code(studentId, stData?.full_name || '', stData?.valid_until);
      const { error: credError } = await window.supabaseClient.from('credentials').insert({student_id: studentId, code: codeStr, is_active: true});
      if (credError) throw credError;
    }
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codeStr)}`;
    if (!inline) window.open(qrImageUrl, '_blank');
    return qrImageUrl;
  } catch {
    showToast('Error al obtener el QR.', 'error');
    return null;
  }
}


// ── MODAL EDITAR ALUMNO ────────────────────────────────────
function abrirModalEdicion(student_id) {
  const a = alumnosData.find(x => x.id === student_id);
  if (!a) { showToast('Alumno no encontrado en caché. Recarga la lista.', 'error'); return; }

  // Rellenar campos
  document.getElementById('edit-id').value = a.id;
  document.getElementById('edit-full-name').value = a.full_name || '';
  document.getElementById('edit-dni').value = a.dni || '';
  document.getElementById('edit-fecha-nacimiento').value = a.fecha_nacimiento || '';
  document.getElementById('edit-parent-name').value = a.parent_name || '';
  document.getElementById('edit-parent-phone').value = a.parent_phone || '';
  window.adminSedes.setValue('edit-sede', a.sede || '');
  document.getElementById('edit-turno').value = a.turno || '';
  document.getElementById('edit-horario').value = a.horario || 'LMV';
  document.getElementById('edit-grupo').value = a.grupo || '';
  document.getElementById('edit-categoria').value = a.categoria || '';
  // tarifa_mensual: '' vacío → null (reset a default), número → valor (0 = becado)
  const tarifaRaw = a.tarifa_mensual;
  document.getElementById('edit-tarifa').value = tarifaRaw !== null && tarifaRaw !== undefined ? tarifaRaw : '';
  document.getElementById('edit-codigo-legacy').value = a.codigo_legacy || '';

  window.adminAlumnoUI.actualizarEstado(a);
  document.getElementById('modal-editar-alumno').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function cerrarModalEdicion() {
  document.getElementById('modal-editar-alumno').classList.add('hidden');
  document.body.style.overflow = '';
}

function cerrarModalEdicionOutside(event) {
  // Solo cerrar si el click fue en el overlay (no en el modal-box)
  if (event.target === document.getElementById('modal-editar-alumno')) {
    cerrarModalEdicion();
  }
}


async function guardarEdicionAlumno(event) {
  event.preventDefault();

  const id = document.getElementById('edit-id').value;
  if (!id) return;

  const val = (elId) => {
    const el = document.getElementById(elId);
    return el ? el.value.trim() : null;
  };

  const payload = {};
  const fullName = val('edit-full-name');
  if (fullName) payload.full_name = fullName;

  const dni = val('edit-dni');
  if (dni) payload.dni = dni;

  const fechaNac = val('edit-fecha-nacimiento');
  if (fechaNac) payload.fecha_nacimiento = fechaNac;

  const parentName = val('edit-parent-name');
  if (parentName) payload.parent_name = parentName;

  const parentPhone = val('edit-parent-phone');
  if (parentPhone) payload.parent_phone = parentPhone;

  const sede = val('edit-sede');
  if (sede) payload.sede = sede;

  const turno = document.getElementById('edit-turno').value;
  if (turno) payload.turno = turno;

  const horario = document.getElementById('edit-horario').value;
  if (horario) payload.horario = horario;

  const grupo = val('edit-grupo');
  if (grupo) payload.grupo = grupo;

  const categoria = val('edit-categoria');
  if (categoria) payload.categoria = categoria;

  const tarifaInput = document.getElementById('edit-tarifa').value;
  payload.tarifa_mensual = tarifaInput === '' ? null : parseFloat(tarifaInput);

  const codigoLegacy = val('edit-codigo-legacy');
  if (codigoLegacy) payload.codigo_legacy = codigoLegacy;

  if (!Object.keys(payload).length) {
    showToast('No hay cambios para guardar', 'error');
    return;
  }

  try {
    const { error } = await window.supabaseClient.from('students').update(payload).eq('id', id);
    if (error) throw error;
    cerrarModalEdicion();
    showToast('Alumno actualizado correctamente');
    loadAlumnos();
  } catch (err) {
    console.error(err);
    showToast(`Error: ${err.message || 'Error de conexión'}`, 'error');
  }
}


// Cerrar modal con tecla Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
    const modal = document.getElementById('modal-editar-alumno');
    if (modal && !modal.classList.contains('hidden')) cerrarModalEdicion();
  }
});

// ── CAJA / PAGOS ─────────────────────────────────────────────
let searchDebounce = null;
let chipActivo = 'todos';
let todosPagosData = []; // cache completo de alumnos para Caja


async function loadCreditos() {
  const container = document.getElementById('creditos-result');
  if (!container) return;

  container.innerHTML = '<p style="color:var(--gray);padding:1.5rem;font-family:var(--font-cond);text-align:center"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#clock"></use></svg> Cargando alumnos…</p>';

  chipActivo = 'todos';
  document.querySelectorAll('.filtro-chip').forEach(c => c.classList.remove('active'));
  const chipTodos = document.getElementById('chip-todos');
  if (chipTodos) chipTodos.classList.add('active');
  const input = document.getElementById('batidos-nombre-search');
  if (input) input.value = '';
  actualizarBtnClear();

  try {
    const { data, error } = await window.supabaseClient.from('students').select('*').order('full_name');
    if (error) throw error;
    
    const hoy = new Date();
    todosPagosData = (data || []).map(a => {
      let dias_restantes = null;
      if (a.valid_until) {
        const fv = new Date(a.valid_until);
        fv.setMinutes(fv.getMinutes() + fv.getTimezoneOffset());
        dias_restantes = Math.floor((fv - hoy) / (1000 * 60 * 60 * 24));
      }
      return { ...a, dias_restantes };
    });

    aplicarFiltrosPagos();
  } catch {
    container.innerHTML = '<p style="color:var(--red2);font-family:var(--font-cond);padding:1rem"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#error"></use></svg> Error al cargar alumnos.</p>';
  }
}


function onSearchInput() {
  clearTimeout(searchDebounce);
  actualizarBtnClear();
  searchDebounce = setTimeout(() => aplicarFiltrosPagos(), 250);
}

function setChip(chip, ev) {
  chipActivo = chip;
  document.querySelectorAll('.filtro-chip').forEach(c => c.classList.remove('active'));
  const chipEl = document.getElementById(`chip-${chip}`);
  if (chipEl) chipEl.classList.add('active');
  aplicarFiltrosPagos();
}

function aplicarFiltrosPagos() {
  const q = (document.getElementById('batidos-nombre-search')?.value || '').toLowerCase().trim();

  let lista = todosPagosData.filter(a => {
    // Búsqueda por nombre
    if (q && !a.full_name.toLowerCase().includes(q)) return false;
    // Filtro por chip
    if (chipActivo === 'lmv') return a.horario === 'LMV';
    if (chipActivo === 'mjs') return a.horario === 'MJS';
    if (chipActivo === 'al-dia') return a.is_active && (a.dias_restantes ?? -1) > 0;
    if (chipActivo === 'vencido') return a.is_active && (a.dias_restantes ?? -1) <= 0;
    return true; // 'todos'
  });

  // Ordenar por urgencia:
  // 1º Activos vencidos (dias <= 0) → más negativos primero
  // 2º Activos próximos a vencer (dias pequeños)
  // 3º Activos con muchos días
  // 4º Inactivos al fondo
  lista.sort((a, b) => {
    const priA = !a.is_active ? 99999 : (a.dias_restantes ?? -9999);
    const priB = !b.is_active ? 99999 : (b.dias_restantes ?? -9999);
    return priA - priB;
  });

  renderListaPagos(lista);
}

function renderListaPagos(lista) {
  const container = document.getElementById('creditos-result');
  if (!lista.length) {
    container.innerHTML = '<div class="empty-search-state"><div class="empty-icon"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#search"></use></svg></div><p>No hay alumnos con ese filtro.</p></div>';
    return;
  }

  container.innerHTML = lista.map(a => {
    const dias = a.dias_restantes;
    const tarifa = a.tarifa_mensual || 80;

    let estadoTexto, estadoColor, borde;
    if (!a.is_active) {
      estadoTexto = 'INACTIVO';
      estadoColor = 'var(--gray2)';
      borde = 'var(--border)';
    } else if (dias === null) {
      estadoTexto = 'SIN PAGO';
      estadoColor = 'var(--gold)';
      borde = 'rgba(212,160,23,.35)';
    } else if (dias <= 0) {
      estadoTexto = `VENCIDO · ${Math.abs(dias)}d`;
      estadoColor = 'var(--red2)';
      borde = 'rgba(255,60,60,.35)';
    } else if (dias <= 7) {
      estadoTexto = `<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#alert"></use></svg> ${dias}d restantes`;
      estadoColor = 'var(--gold)';
      borde = 'rgba(255,152,0,.35)';
    } else {
      estadoTexto = `<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#check"></use></svg> ${dias}d restantes`;
      estadoColor = 'var(--green)';
      borde = 'rgba(0,255,136,.15)';
    }

    const btnCobrar = a.is_active ? `
      <button class="btn btn-gold btn-cobrar" type="button"
        onclick="abrirPagoAlumno('${a.id}', '${a.full_name.replace(/'/g, "\\'")}')">
        <svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#cash"></use></svg> Cobrar
      </button>` : '';

    return `
    <div class="apr-row" style="border-color:${borde};opacity:${a.is_active ? '1' : '0.45'}">
      <div class="apr-info">
        <div class="apr-nombre">${a.full_name}</div>
        <div class="apr-meta">
          <span class="badge badge-gold">${a.horario || 'LMV'}</span>
          ${a.sede ? `<span style="font-family:var(--font-mono);font-size:.72rem;color:var(--gray2)">${a.sede}</span>` : ''}
          <span class="apr-estado" style="color:${estadoColor}">${estadoTexto}</span>
        </div>
      </div>
      ${btnCobrar}
    </div>`;
  }).join('');
}

// Abre un mini-panel de pago para el alumno seleccionado
function abrirPagoAlumno(id, nombre) {
  const a = todosPagosData.find(x => x.id === id);
  const creditos = a?.batido_credits ?? 0;

  // ── Lógica de tarifa inteligente ──
  // tarifa_mensual null → default S/80 | 0 → BECADO | número → tarifa real
  const tarifaRaw = a?.tarifa_mensual;
  let tarifa, tarifaLabel, esBecado;
  if (tarifaRaw === 0) {
    tarifa = 0;
    esBecado = true;
    tarifaLabel = '<span class="pago-becado">Becado · S/ 0.00</span>';
  } else if (tarifaRaw == null) {
    tarifa = 80;
    esBecado = false;
    tarifaLabel = 'S/ 80.00 / mes <span class="pago-tarifa-nota">Tarifa por defecto</span>';
  } else {
    tarifa = tarifaRaw;
    esBecado = false;
    tarifaLabel = `S/ ${tarifa.toFixed(2)} / mes`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'pago-overlay';
  overlay.dataset.tarifa = tarifa;  // guardamos para pagarMensualidad
  overlay.dataset.studentId = id;
  overlay.className = 'pago-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="pago-panel" role="dialog" aria-labelledby="pago-title">
      <div class="pago-header">
        <div>
          <h2 id="pago-title">Registrar pago</h2>
          <p id="pago-student-name" class="pago-student-name"></p>
        </div>
        <button class="pago-close" type="button" aria-label="Cerrar ventana de pago" onclick="document.getElementById('pago-overlay').remove()"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#close"></use></svg></button>
      </div>

      <div class="pago-opcion">
        <div class="pago-opcion-icon">${esBecado ? '<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#school"></use></svg>' : '<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#cash"></use></svg>'}</div>
        <div class="pago-opcion-info">
          <div class="pago-opcion-titulo">Mensualidad</div>
          <div class="pago-opcion-precio">${tarifaLabel}</div>
        </div>
        <button class="btn btn-gold pago-opcion-btn" type="button"
          onclick="pagarMensualidad('${id}'); document.getElementById('pago-overlay').remove()">
          ${esBecado ? 'Renovar gratis' : 'Cobrar'}
        </button>
      </div>

      <div class="pago-opcion">
        <div class="pago-opcion-icon"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#cup"></use></svg></div>
        <div class="pago-opcion-info">
          <div class="pago-opcion-titulo">Créditos Batidos</div>
          <div class="pago-opcion-precio">${creditos} créditos actuales</div>
        </div>
        <div class="pago-recarga">
          <label for="cr-${id}">Cantidad a recargar</label>
          <input class="input-jr credit-input" type="number" min="1" max="20" value="4" id="cr-${id}">
          <button class="btn btn-outline pago-opcion-btn" type="button"
            onclick="recargar('${id}')">+ Recargar</button>
        </div>
      </div>

      <!-- Historial de pagos -->
      <div id="historial-pagos-wrap" class="pago-historial">
        <h3>Historial de pagos</h3>
        <p class="pago-historial-message">Cargando...</p>
      </div>
    </div>`;

  overlay.querySelector('#pago-student-name').textContent = nombre;
  document.body.appendChild(overlay);
  loadHistorialPagos(id);
}

function actualizarBtnClear() {
  const val = document.getElementById('batidos-nombre-search')?.value || '';
  const btn = document.getElementById('btn-clear-search');
  if (btn) btn.style.display = val ? 'flex' : 'none';
}

function limpiarBusqueda() {
  const input = document.getElementById('batidos-nombre-search');
  if (input) input.value = '';
  actualizarBtnClear();
  aplicarFiltrosPagos();
}

// Mantener para compatibilidad (Caja > búsqueda dropdown ELIMINADO, ahora filtro en tabla)
function cerrarDropdown() {
  const d = document.getElementById('search-dropdown');
  if (d) { d.innerHTML = ''; d.classList.remove('visible'); }
}


async function loadHistorialPagos(student_id) {
  const wrap = document.getElementById('historial-pagos-wrap');
  if (!wrap) return;
  try {
    const { data, error } = await window.supabaseClient.from('mensualidades').select('id, monto, metodo_pago, fecha_vencimiento, created_at').eq('student_id', student_id).order('created_at', { ascending: false }).limit(24);
    if (error) throw error;
    
    if (!data || !data.length) {
      wrap.innerHTML = `
        <h3>Historial de pagos</h3>
        <p class="pago-historial-message">No hay pagos registrados.</p>`;
      return;
    }
    wrap.innerHTML = `
      <h3>Historial de pagos</h3>
      <div class="pago-historial-list">
        ${data.map(p => {
      const fecha = p.created_at
        ? new Date(p.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
      const monto = (p.monto ?? 0) === 0
        ? '<span class="pago-becado">Becado</span>'
        : `<span class="pago-historial-monto">S/ ${Number(p.monto).toFixed(2)}</span>`;
      const metodo = p.metodo_pago || '—';
      return `<div class="pago-historial-row">
            <span class="pago-historial-fecha">${fecha}</span>
            ${monto}
            <span class="pago-historial-metodo">${metodo}</span>
          </div>`;
    }).join('')}
      </div>`;
  } catch {
    wrap.innerHTML = `
      <h3>Historial de pagos</h3>
      <p class="pago-historial-message">Error al cargar historial.</p>`;
  }
}



async function pagarMensualidad(id) {
  const overlay = document.getElementById('pago-overlay');
  const tarifa = parseFloat(overlay?.dataset?.tarifa ?? 80);
  const esBecado = tarifa === 0;

  const msgConfirm = esBecado
    ? `¿Renovar 1 mes GRATIS (BECADO) a este alumno?`
    : `¿Confirmar el cobro de S/ ${tarifa.toFixed(2)} por 1 mes de entrenamiento?`;

  const confirmacion = confirm(msgConfirm);
  if (!confirmacion) return;

  let metodo = 'Becado';
  if (!esBecado) {
    metodo = prompt('¿Cómo pagó? (Efectivo, Yape o Plin):', 'Efectivo');
    if (metodo === null) return;
    metodo = metodo.trim() || 'Efectivo';
  }

  try {
    const { data: res_alumno, error: err_alumno } = await window.supabaseClient.from('students').select('id, valid_until, full_name').eq('id', id).single();
    if (err_alumno || !res_alumno) { showToast('Alumno no encontrado', 'error'); return; }

    const hoy = new Date();
    let nueva_fecha = new Date();
    if (res_alumno.valid_until) {
        const fecha_actual_vencimiento = new Date(res_alumno.valid_until);
        fecha_actual_vencimiento.setMinutes(fecha_actual_vencimiento.getMinutes() + fecha_actual_vencimiento.getTimezoneOffset());
        if (fecha_actual_vencimiento >= hoy) {
            nueva_fecha = new Date(fecha_actual_vencimiento);
            nueva_fecha.setDate(nueva_fecha.getDate() + 30);
        } else {
            nueva_fecha.setDate(hoy.getDate() + 30);
        }
    } else {
        nueva_fecha.setDate(hoy.getDate() + 30);
    }
    const fecha_str = nueva_fecha.toISOString().split('T')[0];

    const { error: err_upd } = await window.supabaseClient.from('students').update({valid_until: fecha_str}).eq('id', id);
    if (err_upd) throw err_upd;

    try {
        const nuevo_jrs_code = await generate_jrs_code(id, res_alumno.full_name, fecha_str);
        const { data: cred_res } = await window.supabaseClient.from('credentials').select('id').eq('student_id', id).eq('is_active', true).limit(1);

        if (cred_res && cred_res.length > 0) {
            await window.supabaseClient.from('credentials').update({code: nuevo_jrs_code}).eq('id', cred_res[0].id);
        } else {
            await window.supabaseClient.from('credentials').insert({student_id: id, code: nuevo_jrs_code, is_active: true});
        }
    } catch (e) {
        console.warn("No se pudo regenerar el código JRS:", e);
    }

    try {
        await window.supabaseClient.from('mensualidades').insert({
            student_id: id,
            monto: esBecado ? 0 : tarifa,
            metodo_pago: metodo,
            fecha_inicio: new Date().toISOString().split('T')[0],
            fecha_vencimiento: fecha_str
        });
    } catch(e) {
        console.warn("Error al guardar recibo:", e);
    }

    showToast('Pago registrado con éxito (+30 días)');
    loadAlumnos();
    if (typeof loadCreditos === 'function') loadCreditos();
  } catch (err) {
      console.error(err);
      showToast('Error de red o base de datos', 'error');
  }
}



async function recargar(id) {
  const cantidad = parseInt(document.getElementById(`cr-${id}`)?.value) || 4;
  const { data: alumno } = await window.supabaseClient.from('students').select('id, full_name, batido_credits').eq('id', id).single();
  if (!alumno) { showToast('Alumno no encontrado', 'error'); return; }

  const nuevo = (alumno.batido_credits || 0) + cantidad;
  const { error } = await window.supabaseClient.from('students').update({batido_credits: nuevo}).eq('id', id);
  
  if (error) { showToast('Error al recargar', 'error'); return; }

  showToast(`${alumno.full_name}: ahora tiene ${nuevo} cr.`);
  document.getElementById('pago-overlay')?.remove();
  loadCreditos();
}


// Cerrar dropdown al click fuera
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-autocomplete-wrap')) cerrarDropdown();
});



// ── INIT ──────────────────────────────────────────────
loadStats();

// ── ASISTENCIA GLOBAL (CALENDARIO MAESTRO) ────────────
const CAL_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CAL_DIAS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
const CAL_SCHEDULE = { 'LMV': [1, 3, 5], 'MJS': [2, 4, 6] };

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let _calStudents = [];
let _calAttMap = {};

function updateCalLabel() {
  const el = document.getElementById('cal-month-label');
  if (el) el.textContent = `${CAL_MESES[calMonth]} ${calYear}`;
}

function calChangeMonth(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  loadCalendario();
}


async function loadCalendario() {
  const loading = document.getElementById('cal-loading');
  const container = document.getElementById('cal-table-container');
  if (!loading || !container) return;

  loading.style.display = 'flex';
  container.innerHTML = '';
  updateCalLabel();

  try {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const mm = String(calMonth + 1).padStart(2, '0');
    const dd = String(daysInMonth).padStart(2, '0');
    const first = `${calYear}-${mm}-01T00:00:00`;
    const last = `${calYear}-${mm}-${dd}T23:59:59`;

    const [studRes, rangeRes] = await Promise.all([
      window.supabaseClient.from('students').select('id, full_name, horario, turno, sede').eq('is_active', true).order('full_name'),
      window.supabaseClient.from('attendance').select('id, student_id, created_at').gte('created_at', first).lte('created_at', last)
    ]);

    if (studRes.error) throw studRes.error;
    if (rangeRes.error) throw rangeRes.error;

    _calStudents = studRes.data || [];
    const attData = rangeRes.data || [];

    _calAttMap = {};
    attData.forEach(r => {
      if (r.student_id && r.created_at) {
        const fecha = r.created_at.substring(0, 10);
        _calAttMap[`${r.student_id}_${fecha}`] = true;
      }
    });

    await window.adminSedes.load();

    renderCalendario();

    const lu = document.getElementById('cal-last-update');
    if (lu) lu.textContent = `Actualizado: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  } catch (e) {
    loading.innerHTML = `<span style="color:var(--red2);font-family:var(--font-cond)"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#error"></use></svg> ${e.message}</span>`;
    return;
  }

  loading.style.display = 'none';
}


function renderCalendario() {
  const turnoFilter = document.getElementById('cal-filter-turno')?.value || '';
  const sedeFilter = document.getElementById('cal-filter-sede')?.value || '';
  const searchFilter = (document.getElementById('cal-search')?.value || '').toLowerCase();

  const students = _calStudents.filter(s => {
    const matchSearch = (s.full_name || '').toLowerCase().includes(searchFilter);
    const matchTurno = !turnoFilter || (s.turno || '').toLowerCase() === turnoFilter.toLowerCase();
    const matchSede = !sedeFilter || (s.sede || '').toLowerCase() === sedeFilter.toLowerCase();
    return matchSearch && matchTurno && matchSede;
  });

  const today = new Date();
  const isCurrentMonth = today.getMonth() === calMonth && today.getFullYear() === calYear;
  const todayDay = today.getDate();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const mm = String(calMonth + 1).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, dow: new Date(calYear, calMonth, d).getDay() });
  }

  // Stats globales
  let totalPresencias = 0, totalEsperadas = 0, presentHoy = 0;
  students.forEach(s => {
    const schedule = CAL_SCHEDULE[s.horario] || null;
    days.forEach(({ day, dow }) => {
      if (dow === 0) return;
      const dateStr = `${calYear}-${mm}-${String(day).padStart(2, '0')}`;
      if (new Date(calYear, calMonth, day) > today) return;
      if (schedule && !schedule.includes(dow)) return;
      if (dow === 6 && (!schedule || !schedule.includes(6))) return;
      totalEsperadas++;
      if (_calAttMap[`${s.id}_${dateStr}`]) {
        totalPresencias++;
        if (dateStr === todayStr) presentHoy++;
      }
    });
  });

  const elTotal = document.getElementById('cal-total');
  const elPresent = document.getElementById('cal-present');
  const elAbsent = document.getElementById('cal-absent');
  const elPct = document.getElementById('cal-pct');
  if (elTotal) elTotal.textContent = students.length;
  if (elPresent) elPresent.textContent = presentHoy;
  if (elAbsent) elAbsent.textContent = Math.max(0, students.length - presentHoy);
  if (elPct) elPct.textContent = totalEsperadas > 0
    ? `${Math.round((totalPresencias / totalEsperadas) * 100)}%` : '—';

  const container = document.getElementById('cal-table-container');
  if (!container) return;

  if (!students.length) {
    container.innerHTML = `<div class="empty-state"><div class="big">—</div><p>No se encontraron alumnos</p></div>`;
    return;
  }

  let html = `<table class="attendance-table"><thead><tr>
    <th style="min-width:160px">Alumno</th>`;

  days.forEach(({ day, dow }) => {
    const isToday = isCurrentMonth && day === todayDay;
    const isWeekend = dow === 0 || dow === 6;
    const cls = isToday ? 'day-col today-h' : isWeekend ? 'day-col weekend-h' : 'day-col';
    html += `<th class="${cls}">${CAL_DIAS[dow]}<br>${day}</th>`;
  });
  html += `<th style="min-width:52px;border-left:1px solid var(--border);text-align:center">%</th>
    </tr></thead><tbody>`;

  students.forEach(s => {
    const schedule = CAL_SCHEDULE[s.horario] || null;
    let presentCount = 0, workdayCount = 0;
    const horarioBadge = s.horario
      ? `<span style="font-size:.65rem;font-family:var(--font-cond);letter-spacing:.1em;color:var(--gold);margin-left:.4rem">${s.horario}</span>`
      : '';

    html += `<tr>
      <td>
        <div class="student-name">${s.full_name}${horarioBadge}</div>
        ${s.sede ? `<div class="student-sede">${s.sede}</div>` : ''}
      </td>`;

    days.forEach(({ day, dow }) => {
      const isToday = isCurrentMonth && day === todayDay;
      const dateStr = `${calYear}-${mm}-${String(day).padStart(2, '0')}`;
      const isFuture = new Date(calYear, calMonth, day) > today;
      const isPresent = _calAttMap[`${s.id}_${dateStr}`];
      const todayCls = isToday ? ' day-today' : '';
      const isDomingo = dow === 0;
      const isSabado = dow === 6;
      const esDiaAlumno = schedule
        ? schedule.includes(dow)
        : (!isDomingo && !isSabado);

      if (isDomingo || (isSabado && (!schedule || !schedule.includes(6)))) {
        html += `<td><div class="day-cell day-weekend">—</div></td>`;
      } else if (!esDiaAlumno) {
        html += `<td><div class="day-cell day-weekend" style="opacity:.3">·</div></td>`;
      } else if (isFuture) {
        html += `<td><div class="day-cell day-future">·</div></td>`;
      } else {
        workdayCount++;
        if (isPresent) {
          presentCount++;
          html += `<td><div class="day-cell day-present${todayCls}" role="img" aria-label="Presente: ${dateStr}" title="${dateStr}"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#check"></use></svg></div></td>`;
        } else {
          html += `<td><div class="day-cell day-absent${todayCls}" role="img" aria-label="Ausente: ${dateStr}" title="${dateStr}"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#error"></use></svg></div></td>`;
        }
      }
    });

    const pct = workdayCount > 0 ? Math.round((presentCount / workdayCount) * 100) : 0;
    const pctClass = pct >= 80 ? 'pct-high' : pct >= 50 ? 'pct-mid' : 'pct-low';
    html += `<td style="text-align:center"><span class="pct-cell ${pctClass}">${pct}%</span></td></tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

let _bioStudents = [];
let _bioSelected = null;

function resetBioSearch() {
  const inp = document.getElementById('bio-search');
  if (inp) inp.value = '';
  document.getElementById('bio-search-results').innerHTML = '';
  document.getElementById('bio-form-card').style.display = 'none';
  _bioSelected = null;
}


async function buscarParaBio() {
  const q = document.getElementById('bio-search').value.trim().toLowerCase();
  const el = document.getElementById('bio-search-results');
  if (q.length < 2) { el.innerHTML = ''; return; }

  if (!_bioStudents.length) {
    const { data } = await window.supabaseClient.from('students').select('*').order('full_name');
    _bioStudents = data || [];
  }

  const hits = _bioStudents.filter(s =>
    s.full_name.toLowerCase().includes(q) ||
    (s.dni || '').includes(q)
  ).slice(0, 6);

  if (!hits.length) {
    el.innerHTML = '<p style="font-family:var(--font-cond);color:var(--gray);font-size:.85rem">Sin resultados.</p>';
    return;
  }

  el.innerHTML = hits.map(s => `
    <div class="alumno-card" style="cursor:pointer;margin-bottom:.5rem;padding:.6rem 1rem"
         onclick="seleccionarBioAlumno('${s.id}','${s.full_name.replace(/'/g, "\\'")}')"
         onmouseenter="this.style.borderColor='var(--gold)'"
         onmouseleave="this.style.borderColor='var(--border)'">
      <span style="font-family:var(--font-cond);font-weight:700">${s.full_name}</span>
      <span style="font-family:var(--font-mono);font-size:.72rem;color:var(--gray);margin-left:.5rem">${s.dni || ''}</span>
    </div>`).join('');
}


async function seleccionarBioAlumno(id, nombre) {
  _bioSelected = { id, nombre };
  document.getElementById('bio-student-id').value = id;
  document.getElementById('bio-alumno-label').textContent = nombre;
  document.getElementById('bio-alumno-label').insertAdjacentHTML('afterbegin', adminIcon('clipboard') + ' ');
  document.getElementById('bio-search-results').innerHTML = '';
  document.getElementById('bio-search').value = nombre;

  // Mes actual como default
  const ahora = new Date();
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  document.getElementById('bio-fecha').value = `${meses[ahora.getMonth()]} ${ahora.getFullYear()}`;

  document.getElementById('bio-form-card').style.display = 'block';
  await cargarHistorialBio(id);
}


async function cargarHistorialBio(sid) {
  const wrap = document.getElementById('bio-historial-wrap');
  wrap.innerHTML = '<p style="font-family:var(--font-cond);color:var(--gray)">Cargando historial...</p>';
  try {
    const { data, error } = await window.supabaseClient.from('biometria').select('id, fecha, talla, peso, created_at').eq('student_id', sid).order('created_at', { ascending: false }).limit(24);
    if (error) throw error;

    if (!data || !data.length) {
      wrap.innerHTML = '<p style="font-family:var(--font-cond);color:var(--gray);font-size:.85rem">Sin mediciones registradas aún.</p>';
      return;
    }

    wrap.innerHTML = `
      <div style="font-family:var(--font-cond);font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:.6rem">// HISTORIAL BIOMÉTRICO</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-family:var(--font-cond)">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:.4rem .6rem;font-size:.72rem;letter-spacing:.12em;color:var(--gray)">Mes</th>
              <th style="padding:.4rem .6rem;font-size:.72rem;letter-spacing:.12em;color:var(--gray)">Talla</th>
              <th style="padding:.4rem .6rem;font-size:.72rem;letter-spacing:.12em;color:var(--gray)">Peso</th>
              <th style="padding:.4rem .6rem"></th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr style="border-bottom:1px solid rgba(255,255,255,.04)">
                <td style="padding:.4rem .6rem;color:var(--gray);font-size:.85rem">${r.fecha}</td>
                <td style="padding:.4rem .6rem;text-align:center;font-size:1rem;font-weight:700;color:var(--white)">${r.talla != null ? r.talla + 'm' : '—'}</td>
                <td style="padding:.4rem .6rem;text-align:center;font-size:1rem;font-weight:700;color:var(--white)">${r.peso != null ? r.peso + 'kg' : '—'}</td>
                <td style="padding:.4rem .6rem;text-align:right">
                  <button aria-label="Eliminar medición" onclick="eliminarBio('${r.id}')" style="background:none;border:none;color:var(--red2);cursor:pointer;font-size:.9rem"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#close"></use></svg></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch {
    wrap.innerHTML = '<p style="color:var(--red2);font-family:var(--font-cond)">Error al cargar historial.</p>';
  }
}



async function guardarBiometria() {
  const sid = document.getElementById('bio-student-id').value;
  const fecha = document.getElementById('bio-fecha').value.trim();
  const talla = parseFloat(document.getElementById('bio-talla').value);
  const peso = parseInt(document.getElementById('bio-peso').value);

  if (!sid || !fecha) return showToast('Completa mes y alumno', 'error');

  const body = { student_id: sid, fecha };
  if (!isNaN(talla)) body.talla = talla;
  if (!isNaN(peso)) body.peso = peso;

  const { error } = await window.supabaseClient.from('biometria').insert(body);

  if (!error) {
    showToast('Medición guardada');
    document.getElementById('bio-talla').value = '';
    document.getElementById('bio-peso').value = '';
    await cargarHistorialBio(sid);
  } else {
    showToast('Error al guardar', 'error');
  }
}



async function eliminarBio(id) {
  if (!confirm('¿Eliminar esta medición?')) return;
  try {
    const { error } = await window.supabaseClient.from('biometria').delete().eq('id', id);
    if (error) throw error;
    showToast('Eliminado');
    if (_bioSelected) await cargarHistorialBio(_bioSelected.id);
  } catch (err) {
    console.error(err);
    showToast('Error al eliminar', 'error');
  }
}


function cancelarBio() {
  document.getElementById('bio-form-card').style.display = 'none';
  document.getElementById('bio-search').value = '';
  document.getElementById('bio-search-results').innerHTML = '';
  _bioSelected = null;
}

// ── RANKING ───────────────────────────────────────────

async function cargarRanking() {
  const campo = document.getElementById('rk-campo')?.value || 'talla';
  const sede = document.getElementById('rk-sede')?.value || '';
  const cat = document.getElementById('rk-cat')?.value || '';
  const wrap = document.getElementById('ranking-table-wrap');
  if (!wrap) return;

  wrap.innerHTML = '<p style="font-family:var(--font-cond);color:var(--gray)">Cargando...</p>';

  try {
    let q = window.supabaseClient.from('students').select('id, full_name, horario, sede').eq('is_active', true);
    if (sede) q = q.eq('sede', sede);
    
    const { data: students_list, error: err1 } = await q;
    if (err1) throw err1;

    let filtered_students = students_list || [];
    if (cat) {
        filtered_students = filtered_students.filter(s => (s.horario || "") === cat);
    }
    
    if (filtered_students.length === 0) {
        wrap.innerHTML = '<p style="font-family:var(--font-cond);color:var(--gray)">Sin datos aún. Registra mediciones en la sección Rendimiento.</p>';
        return;
    }

    const ids = filtered_students.map(s => s.id);
    const { data: bio_res, error: err2 } = await window.supabaseClient.from('biometria').select('student_id, talla, peso, fecha, created_at').in('student_id', ids).order('created_at', {ascending: false});
    if (err2) throw err2;

    const last_bio = {};
    (bio_res || []).forEach(r => {
        if (!last_bio[r.student_id]) last_bio[r.student_id] = r;
    });

    const result = [];
    filtered_students.forEach(st => {
        const bio = last_bio[st.id];
        if (!bio) return;
        const val = bio[campo];
        if (val === null || val === undefined) return;
        
        result.push({
            student_id: st.id,
            full_name: st.full_name,
            sede: st.sede || "",
            horario: st.horario || "",
            fecha: bio.fecha,
            valor: parseFloat(val)
        });
    });

    result.sort((a, b) => b.valor - a.valor);
    const data = result.slice(0, 20);

    if (!data.length) {
      wrap.innerHTML = '<p style="font-family:var(--font-cond);color:var(--gray)">Sin datos aún. Registra mediciones en la sección Rendimiento.</p>';
      return;
    }

    const label = campo === 'talla' ? 'Talla' : 'Peso';
    const unit = campo === 'talla' ? 'm' : 'kg';
    const measurementIcon = adminIcon(campo === 'talla' ? 'ruler' : 'scale');

    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-family:var(--font-cond)">
          <thead>
            <tr style="border-bottom:2px solid var(--border)">
              <th style="padding:.5rem .7rem;text-align:center;font-size:.72rem;letter-spacing:.12em;color:var(--gray)">#</th>
              <th style="padding:.5rem .7rem;text-align:left;font-size:.72rem;letter-spacing:.12em;color:var(--gray)">Atleta</th>
              <th style="padding:.5rem .7rem;text-align:center;font-size:.72rem;letter-spacing:.12em;color:var(--gray)">Sede</th>
              <th style="padding:.5rem .7rem;text-align:center;font-size:.72rem;letter-spacing:.12em;color:var(--gray)">Horario</th>
              <th style="padding:.5rem .7rem;text-align:center;font-size:.72rem;letter-spacing:.12em;color:var(--gold)">${measurementIcon} ${label}</th>
              <th style="padding:.5rem .7rem;text-align:center;font-size:.72rem;letter-spacing:.12em;color:var(--gray)">Mes</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((r, i) => `
              <tr style="border-bottom:1px solid rgba(255,255,255,.04);${i === 0 ? 'background:rgba(212,160,23,.07)' : ''}"
                  onmouseenter="this.style.background='rgba(255,255,255,.04)'"
                  onmouseleave="this.style.background='${i === 0 ? 'rgba(212,160,23,.07)' : ''}'"
              >
                <td style="padding:.5rem .7rem;text-align:center;font-family:var(--font-display);font-size:${i === 0 ? '1.4rem' : '1.1rem'};color:${i === 0 ? 'var(--gold)' : 'var(--gray)'}">${i + 1}</td>
                <td style="padding:.5rem .7rem;font-weight:700;color:var(--white)">${r.full_name}</td>
                <td style="padding:.5rem .7rem;text-align:center;color:var(--gray);font-size:.88rem">${r.sede || '—'}</td>
                <td style="padding:.5rem .7rem;text-align:center;color:var(--gray);font-size:.88rem">${r.horario || '—'}</td>
                <td style="padding:.5rem .7rem;text-align:center;font-size:1.1rem;font-weight:700;color:var(--white)">${r.valor}${unit}</td>
                <td style="padding:.5rem .7rem;text-align:center;color:var(--gray);font-size:.82rem">${r.fecha || '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    wrap.innerHTML = '<p style="color:var(--red2);font-family:var(--font-cond)">Error al cargar ranking.</p>';
  }
}




// ── ENTRENADORES ──────────────────────────────────────
let _entrenadoresData = [];


async function loadEntrenadores() {
  const el = document.getElementById('entrenadores-list');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--gray);font-family:var(--font-cond)">Cargando...</p>';
  try {
    const { data, error } = await window.supabaseClient.from('entrenadores').select('id, nombre, token, is_active, created_at, last_used_at').order('nombre');
    if (error) throw error;
    _entrenadoresData = data || [];
    renderEntrenadores();
  } catch {
    el.innerHTML = '<p style="color:var(--red2);font-family:var(--font-cond)">Error al cargar.</p>';
  }
}


function renderEntrenadores() {
  const el = document.getElementById('entrenadores-list');
  if (!_entrenadoresData.length) {
    el.innerHTML = '<p style="color:var(--gray);font-family:var(--font-cond)">No hay entrenadores creados aún.</p>';
    return;
  }
  el.innerHTML = _entrenadoresData.map(e => `
    <div class="alumno-card" style="opacity:${e.is_active ? '1' : '0.5'};flex-direction:column;align-items:stretch;gap:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="alumno-card-name"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#activity"></use></svg> ${e.nombre}</div>
          <div style="font-family:var(--font-mono);font-size:.72rem;color:var(--gray)">${e.is_active ? '<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#check"></use></svg> Acceso habilitado' : '<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#ban"></use></svg> Acceso revocado'}</div>
        </div>
        <div class="alumno-card-actions">
          ${e.is_active
      ? `<button class="btn btn-red" style="font-size:.75rem;padding:.3rem .9rem"
                 onclick="toggleEntrenador('${e.id}', '${e.nombre.replace(/'/g, "\\'")}', false)">Revocar</button>`
      : `<button class="btn btn-outline" style="font-size:.75rem;padding:.3rem .9rem;border-color:#00ff88;color:#00ff88"
                 onclick="toggleEntrenador('${e.id}', '${e.nombre.replace(/'/g, "\\'")}', true)">Reactivar</button>`
    }
        </div>
      </div>
      ${e.is_active ? `
      <div style="background:var(--dark);padding:10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--gold);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-right:10px;">
          /entrenador/login?token=${e.token.substring(0, 8)}...
        </div>
        <button class="btn btn-gold" style="font-size:0.75rem;padding:0.4rem 0.8rem;" onclick="copyMagicLink('${e.token}')"><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#clipboard"></use></svg> Copiar Enlace</button>
      </div>` : ''}
    </div>`).join('');
}

function copyMagicLink(token) {
  const url = window.location.origin + '/entrenador/login.html?token=' + token;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Enlace copiado. Envíalo por WhatsApp.');
  }).catch(err => {
    showToast('Error al copiar enlace', 'error');
  });
}


async function crearEntrenador() {
  const nombre = document.getElementById('ent-nombre')?.value.trim();
  if (!nombre) return showToast('Completa el nombre', 'error');

  const token = btoa(Math.random().toString()).substring(0, 24);
  const { data, error } = await window.supabaseClient.from('entrenadores').insert({ nombre, token, is_active: true }).select();
  
  if (error || !data) return showToast('Error al crear', 'error');

  document.getElementById('ent-nombre').value = '';
  showToast('Entrenador creado.');
  copyMagicLink(data[0].token);
  loadEntrenadores();
}



async function toggleEntrenador(id, nombre, reactivar) {
  if (!confirm(`¿${reactivar ? 'Reactivar' : 'Desactivar'} a ${nombre}?`)) return;
  await window.supabaseClient.from('entrenadores').update({is_active: reactivar}).eq('id', id);
  showToast('Actualizado');
  loadEntrenadores();
}


// ── MANUFACTURA: PLANCHA DE PRODUCCIÓN QR ─────────────────────────

async function imprimirPlanchaQRs() {
  let datos = alumnosData;
  if (!datos || datos.length === 0) {
    try {
      const { data, error } = await window.supabaseClient.from('students').select('*').order('full_name');
      if (error) throw error;
      datos = data || [];
      alumnosData = datos;
    } catch {
      showToast('Error al obtener alumnos. Verifica tu conexión.', 'error');
      return;
    }
  }

  const activos = datos.filter(a => a.is_active);
  if (activos.length === 0) {
    showToast('No hay alumnos activos para imprimir.', 'error');
    return;
  }

  const win = window.open('', '_blank');
  if (!win) {
    showToast('Popup bloqueado. Permite popups en la barra de tu navegador.', 'error');
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Generando Plancha...</title>
    <style>body{font-family:'Segoe UI',sans-serif;background:#fff;display:flex;flex-direction:column;
    align-items:center;justify-content:center;height:100vh;margin:0;color:#333}
    .spinner{border:4px solid #eee;border-top:4px solid #d4a017;border-radius:50%;width:40px;height:40px;
    animation:spin 1s linear infinite;margin-bottom:1rem}
    @keyframes spin{to{transform:rotate(360deg)}}
    h2{font-size:1.3rem;margin:0}</style></head>
    <body><div class="spinner"></div><h2><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#clock"></use></svg> Cargando ${activos.length} QRs...</h2></body></html>`);

  showToast(`Generando plancha para ${activos.length} alumnos...`, 'ok');

  const items = [];
  for (const a of activos) {
    try {
      let codeStr = '';
      const { data } = await window.supabaseClient.from('credentials').select('code').eq('student_id', a.id).eq('is_active', true).limit(1);
      if (data && data.length > 0) {
        codeStr = data[0].code;
      } else {
        codeStr = await generate_jrs_code(a.id, a.full_name, a.valid_until);
        await window.supabaseClient.from('credentials').insert({student_id: a.id, code: codeStr, is_active: true});
      }
      items.push({
        name: a.full_name,
        code: codeStr,
        dni: a.dni || ''
      });
    } catch (e) {
      console.warn(`Error procesando a ${a.full_name}:`, e);
    }
  }

  if (items.length === 0) {
    win.document.open();
    win.document.write('<html><body><h2><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#error"></use></svg> No se pudo obtener ningún QR.</h2></body></html>');
    win.document.close();
    return;
  }

  const CIRCLE = 48;
  const GAP = 2;
  const QR_SIZE = 28;

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Plancha QR — JR Stars (${items.length} stickers)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #fff; color: #000;
      padding: 0;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 100;
      background: #111; color: #fff; padding: 12px 20px;
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    }
    .toolbar h2 { font-size: 1rem; color: #d4a017; margin-right: auto; }
    .toolbar label { font-size: .85rem; color: #aaa; }
    .toolbar select {
      background: #222; color: #fff; border: 1px solid #444;
      padding: 6px 10px; border-radius: 6px; font-size: .85rem; cursor: pointer;
    }
    .toolbar button {
      background: #d4a017; color: #000; border: none;
      padding: 8px 20px; border-radius: 6px; font-weight: bold;
      cursor: pointer; font-size: .9rem;
    }
    .toolbar button:hover { background: #e8b420; }
    .page-sheet {
      padding: ${GAP}mm;
    }
    .grid {
      display: flex; flex-wrap: wrap;
      gap: ${GAP}mm;
      justify-content: flex-start;
      align-content: flex-start;
    }
    .sticker {
      width: ${CIRCLE}mm; height: ${CIRCLE}mm;
      border-radius: 50%;
      border: 0.4mm dashed #bbb;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .qr-img { width: ${QR_SIZE}mm; height: ${QR_SIZE}mm; margin-bottom: 2mm; }
    .name {
      font-size: 9pt; font-weight: bold; text-align: center;
      width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .dni { font-size: 7.5pt; color: #555; }
    @media print {
      .toolbar { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 0; }
      .page-sheet { padding: 5mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h2><svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="../img/admin-icons.svg#printer"></use></svg> Plancha QR (${items.length})</h2>
    <button onclick="window.print()">Imprimir Ahora</button>
  </div>
  <div class="page-sheet">
    <div class="grid">
      ${items.map(item => `
        <div class="sticker">
          <img class="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(item.code)}" />
          <div class="name">${item.name}</div>
          <div class="dni">${item.dni || ''}</div>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
