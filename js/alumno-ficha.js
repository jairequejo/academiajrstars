// Ficha de solo consulta y cambio de estado con confirmación explícita.
(() => {
  const TZ = 'America/Lima';
  const dialog = document.getElementById('alumno-ficha');
  const content = document.getElementById('ficha-content');
  const qrButton = document.getElementById('ficha-ver-qr');
  const confirmation = document.getElementById('alumno-estado-confirmacion');
  const confirmForm = document.getElementById('estado-confirm-form');
  const confirmCheck = document.getElementById('estado-confirm-check');
  const confirmSubmit = document.getElementById('estado-confirm-submit');
  const confirmCancel = document.getElementById('estado-confirm-cancel');
  const confirmError = document.getElementById('estado-confirm-error');
  let currentStudent = null;
  let request = 0;
  let stateChange = null;
  let saving = false;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const display = (value) => value === null || value === undefined || value === '' ? 'Sin registrar' : escape(value);

  function dayKey(value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  function dateLabel(value) {
    const key = dayKey(value);
    if (!key) return 'Sin registrar';
    return new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(key + 'T12:00:00Z'));
  }

  function ageLabel(value) {
    const birth = dayKey(value), today = dayKey(new Date());
    if (!birth || birth > today) return 'Sin registrar';
    const [y, m, d] = birth.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    const years = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
    return `${years} ${years === 1 ? 'año' : 'años'}`;
  }

  function tenure(value) {
    const start = dayKey(value), today = dayKey(new Date());
    if (!start || start > today) return 'Sin registrar';
    const [y, m, d] = start.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
    const months = (ty - y) * 12 + tm - m - (td < d ? 1 : 0);
    if (months < 1) {
      const days = Math.floor((Date.parse(today) - Date.parse(start)) / 86400000);
      return days === 0 ? 'Hoy' : `${days} ${days === 1 ? 'día' : 'días'}`;
    }
    const years = Math.floor(months / 12), rest = months % 12;
    return [years ? `${years} ${years === 1 ? 'año' : 'años'}` : '', rest ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : ''].filter(Boolean).join(' y ');
  }

  function attendanceSummary(rows) {
    const today = dayKey(new Date());
    const days = new Set(rows.map(r => dayKey(r.created_at)).filter(day => day && day <= today));
    const sorted = [...days].sort();
    const [year, month] = today.split('-').map(Number);
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(Date.UTC(year, month - 6 + i, 1, 12));
      const key = date.toISOString().slice(0, 7);
      return {
        label: new Intl.DateTimeFormat('es-PE', { timeZone: TZ, month: 'short', year: '2-digit' }).format(date),
        count: sorted.filter(day => day.startsWith(key)).length
      };
    });
    return { total: days.size, month: sorted.filter(day => day.startsWith(today.slice(0, 7))).length, last: sorted.at(-1), months };
  }

  function details(title, icon, rows) {
    return `<section class="ficha-section"><h3>${adminIcon(icon)} ${title}</h3><dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${display(value)}</dd></div>`).join('')}</dl></section>`;
  }

  function renderStudent(a) {
    const active = a.is_active === true;
    const initials = (a.full_name || 'Alumno').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    const fee = a.tarifa_mensual == null ? 'S/ 80.00 · Por defecto' : Number(a.tarifa_mensual) === 0 ? 'Becado · S/ 0.00' : `S/ ${Number(a.tarifa_mensual).toFixed(2)}`;
    const expires = dayKey(a.valid_until), today = dayKey(new Date());
    const paymentStatus = !expires ? 'Sin pago registrado' : expires >= today ? 'Al día' : 'Vencido';
    content.innerHTML = `
      <div class="ficha-hero">
        <div class="ficha-avatar" aria-hidden="true">${escape(initials)}</div>
        <div class="ficha-identity"><h3>${display(a.full_name)}</h3><div class="ficha-tags">
          <span class="ficha-tag ${active ? 'is-active' : 'is-inactive'}">${active ? 'Activo' : 'Inactivo'}</span>
          <span class="ficha-tag">Categoría: ${display(a.categoria)}</span><span class="ficha-tag">${display(a.sede)}</span>
        </div></div>
      </div>
      <div class="ficha-stats">
        <div class="ficha-stat"><span class="ficha-stat-label">Tiempo en academia</span><strong class="ficha-stat-value is-date">${tenure(a.created_at)}</strong><span class="ficha-stat-note">Registro: ${dateLabel(a.created_at)}</span></div>
        <div class="ficha-stat"><span class="ficha-stat-label">Asistencias este mes</span><strong class="ficha-stat-value" id="ficha-month-count">—</strong><span class="ficha-stat-note" id="ficha-month-note">Cargando registros…</span></div>
        <div class="ficha-stat"><span class="ficha-stat-label">Días de asistencia</span><strong class="ficha-stat-value" id="ficha-total-count">—</strong><span class="ficha-stat-note">Historial completo</span></div>
        <div class="ficha-stat"><span class="ficha-stat-label">Última asistencia</span><strong class="ficha-stat-value is-date" id="ficha-last-date">—</strong><span class="ficha-stat-note">Día registrado</span></div>
      </div>
      <section class="ficha-section ficha-chart"><h3>${adminIcon('chart')} Asistencia · últimos 6 meses</h3><div id="ficha-attendance" aria-live="polite"><p class="ficha-message">Cargando asistencia…</p></div></section>
      <div class="ficha-grid">
        ${details('Entrenamiento', 'ball', [['Categoría', a.categoria], ['Sede', a.sede], ['Horario', ({ LMV: 'Lunes, miércoles y viernes', MJS: 'Martes, jueves y sábado' })[a.horario] || a.horario], ['Turno', a.turno], ['Grupo', a.grupo], ['Inscrito desde', dateLabel(a.created_at)]])}
        ${details('Datos y contacto', 'user', [['DNI', a.dni], ['Fecha de nacimiento', dateLabel(a.fecha_nacimiento)], ['Edad', ageLabel(a.fecha_nacimiento)], ['Apoderado', a.parent_name], ['Teléfono', a.parent_phone], ['Código de alumno', a.codigo_legacy]])}
        ${details('Mensualidad y créditos', 'wallet', [['Estado del pago', paymentStatus], ['Vencimiento', dateLabel(a.valid_until)], ['Tarifa mensual', fee], ['Créditos de batidos', a.batido_credits ?? 0]])}
      </div>
      <section class="ficha-section ficha-qr" id="ficha-qr-panel" hidden><h3>${adminIcon('qr')} Credencial QR</h3><p id="ficha-qr-message" class="ficha-message" role="status"></p><img id="ficha-qr-image" alt="Código QR del alumno" hidden><a id="ficha-qr-link" target="_blank" rel="noopener" hidden>Abrir imagen QR</a></section>`;
  }

  async function loadAttendance(studentId, token) {
    const rows = [];
    try {
      // Paginar evita truncar el historial de los alumnos con más registros.
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await window.supabaseClient.from('attendance').select('id, created_at')
          .eq('student_id', studentId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 999);
        if (token !== request || !dialog.open) return;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const summary = attendanceSummary(rows);
      document.getElementById('ficha-month-count').textContent = summary.month;
      document.getElementById('ficha-total-count').textContent = summary.total;
      document.getElementById('ficha-last-date').textContent = summary.last ? dateLabel(summary.last) : 'Sin registros';
      document.getElementById('ficha-month-note').textContent = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, month: 'long', year: 'numeric' }).format(new Date());
      const max = Math.max(1, ...summary.months.map(m => m.count));
      document.getElementById('ficha-attendance').innerHTML = summary.months.map(m => `<div class="ficha-chart-row"><span>${m.label}</span><div class="ficha-bar-track" aria-hidden="true"><span style="width:${m.count / max * 100}%"></span></div><strong>${m.count}</strong></div>`).join('') + '<p class="ficha-chart-note">Días con asistencia registrada. Cada día se cuenta una sola vez, según la hora de Perú.</p>';
    } catch {
      if (token !== request || !dialog.open) return;
      document.getElementById('ficha-month-note').textContent = 'No disponible';
      document.getElementById('ficha-attendance').innerHTML = '<p class="ficha-message ficha-error">No se pudo cargar la asistencia. Las cifras no están disponibles.</p><button type="button" class="ficha-retry" id="ficha-retry">Reintentar</button>';
      document.getElementById('ficha-retry').onclick = () => openStudent(studentId);
    }
  }

  function openStudent(id) {
    const student = alumnosData.find(a => a.id === id);
    if (!student) return showToast('Alumno no encontrado. Recarga el directorio.', 'error');
    currentStudent = student;
    const token = ++request;
    qrButton.disabled = false;
    qrButton.innerHTML = adminIcon('qr') + ' Ver QR';
    renderStudent(student);
    if (!dialog.open) dialog.showModal();
    content.scrollTop = 0;
    loadAttendance(id, token);
  }

  document.getElementById('alumnos-list').addEventListener('click', e => {
    const button = e.target.closest('[data-alumno-action]');
    if (!button) return;
    const id = decodeURIComponent(button.dataset.alumnoId);
    if (button.dataset.alumnoAction === 'ver') openStudent(id);
    else abrirModalEdicion(id);
  });
  document.querySelectorAll('[data-cerrar-ficha]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => { request++; currentStudent = null; });

  qrButton.addEventListener('click', async () => {
    if (!currentStudent) return;
    const token = request, id = currentStudent.id;
    const panel = document.getElementById('ficha-qr-panel');
    const message = document.getElementById('ficha-qr-message');
    const image = document.getElementById('ficha-qr-image');
    const link = document.getElementById('ficha-qr-link');
    panel.hidden = false;
    image.hidden = true;
    link.hidden = true;
    message.textContent = 'Cargando código QR…';
    qrButton.disabled = true;
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const url = await verQR(id, true);
    if (token !== request || !dialog.open) return;
    qrButton.disabled = false;
    if (!url) { message.textContent = 'No se pudo cargar el QR. Pulsa Ver QR para reintentar.'; return; }
    link.href = url;
    link.hidden = false;
    image.onload = () => {
      if (token !== request) return;
      image.hidden = false;
      message.textContent = 'Credencial del alumno';
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    image.onerror = () => { if (token !== request) return; message.textContent = 'No se pudo mostrar la imagen. Abre el QR o vuelve a intentarlo.'; };
    image.src = url;
  });

  function updateEditState(student) {
    const active = student.is_active === true;
    const button = document.getElementById('edit-estado-btn');
    button.textContent = active ? 'Desactivar alumno' : 'Reactivar alumno';
    button.dataset.action = active ? 'desactivar' : 'reactivar';
    button.onclick = () => confirmState(student.id, !active);
    document.getElementById('edit-estado-description').textContent = active
      ? 'Alumno activo. Para desactivarlo tendrás que confirmar la acción.'
      : 'Alumno inactivo. Sus datos e historial se conservan.';
  }

  function confirmState(id, active) {
    const student = alumnosData.find(a => a.id === id);
    if (!student || saving) return;
    stateChange = { id, active };
    document.getElementById('estado-confirm-title').textContent = active ? 'Reactivar alumno' : 'Desactivar alumno';
    document.getElementById('estado-confirm-name').textContent = student.full_name;
    document.getElementById('estado-confirm-description').textContent = active
      ? 'Volverá a figurar como alumno activo. Sus pagos e historial se conservarán.'
      : 'El alumno quedará inactivo y no podrá registrar asistencia. Sus datos, pagos e historial se conservarán.';
    confirmCheck.checked = false;
    confirmCheck.required = !active;
    document.getElementById('estado-confirm-check-wrap').hidden = active;
    confirmSubmit.textContent = active ? 'Sí, reactivar alumno' : 'Sí, desactivar alumno';
    confirmSubmit.disabled = !active;
    confirmSubmit.classList.toggle('btn-danger-soft', !active);
    confirmSubmit.classList.toggle('btn-gold', active);
    confirmCancel.disabled = false;
    confirmError.hidden = true;
    if (!confirmation.open) confirmation.showModal();
  }

  confirmCheck.addEventListener('change', () => {
    confirmSubmit.disabled = saving || (!stateChange?.active && !confirmCheck.checked);
  });
  confirmCancel.addEventListener('click', () => { if (!saving) confirmation.close(); });
  confirmation.addEventListener('cancel', e => { if (saving) e.preventDefault(); });
  confirmation.addEventListener('close', () => { stateChange = null; confirmForm.reset(); });

  confirmForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (saving || !stateChange || (!stateChange.active && !confirmCheck.checked)) return;
    const { id, active } = stateChange;
    saving = true;
    confirmSubmit.disabled = true;
    confirmCancel.disabled = true;
    confirmCheck.disabled = true;
    confirmSubmit.textContent = 'Guardando…';
    confirmError.hidden = true;
    try {
      const { data, error } = await window.supabaseClient.from('students').update({ is_active: active }).eq('id', id).select('id, is_active').single();
      if (error || !data || data.is_active !== active) throw error || new Error('No se actualizó el estado.');
      const student = alumnosData.find(a => a.id === id);
      if (student) { student.is_active = active; updateEditState(student); }
      confirmation.close();
      showToast(active ? 'Alumno reactivado.' : 'Alumno desactivado.');
      await loadAlumnos();
      aplicarFiltros();
    } catch {
      confirmError.textContent = 'No se pudo cambiar el estado. No se ha confirmado la actualización. Inténtalo de nuevo.';
      confirmError.hidden = false;
    } finally {
      saving = false;
      confirmCancel.disabled = false;
      confirmCheck.disabled = false;
      confirmSubmit.disabled = !active && !confirmCheck.checked;
      confirmSubmit.textContent = active ? 'Sí, reactivar alumno' : 'Sí, desactivar alumno';
    }
  });

  window.adminAlumnoUI = { abrir: openStudent, actualizarEstado: updateEditState, confirmarEstado: confirmState };
})();
