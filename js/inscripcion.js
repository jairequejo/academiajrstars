// Interfaz de inscripción: usa crearAlumno() para conservar el guardado del admin.
(() => {
  const dialog = document.getElementById('inscripcion-dialog');
  const form = document.getElementById('inscripcion-form');
  const launch = document.getElementById('abrir-inscripcion');
  if (!dialog || !form || !launch) return;

  const panels = [...form.querySelectorAll('[data-inscripcion-step]')];
  const indicators = [...form.querySelectorAll('.inscripcion-progress li')];
  const previous = document.getElementById('inscripcion-anterior');
  const next = document.getElementById('inscripcion-siguiente');
  const submit = document.getElementById('inscripcion-crear');
  const close = document.getElementById('inscripcion-cerrar');
  const message = document.getElementById('inscripcion-message');
  const content = form.querySelector('.inscripcion-content');
  let step = 0;
  let saving = false;

  const today = new Date();
  const birthInput = document.getElementById('a-fecha-nacimiento');
  const birthHint = document.getElementById('inscripcion-edad');
  birthInput.max = [
    today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')
  ].join('-');

  function birthDetails() {
    if (!birthInput.value || !birthInput.validity.valid) return null;
    const [year, month, day] = birthInput.value.split('-').map(Number);
    let age = today.getFullYear() - year;
    if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
    const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    return { date, age: age === 1 ? '1 año' : `${age} años` };
  }

  function updateBirthHint() {
    const birth = birthDetails();
    birthHint.textContent = birth ? `Edad actual: ${birth.age}.` : 'Selecciona el día, mes y año de nacimiento del niño.';
  }
  birthInput.addEventListener('input', updateBirthHint);
  birthInput.addEventListener('change', updateBirthHint);

  
  const fechaInicioInput = document.getElementById('a-fecha-inicio');
  const pagoPrimerMesInput = document.getElementById('a-pago-primer');
  const pagoMesFijoInput = document.getElementById('a-pago-mes');
  
  function recalculatePrimerMes() {
      if(!fechaInicioInput || !pagoPrimerMesInput || !pagoMesFijoInput) return;
      if(!fechaInicioInput.value) return;
      const baseDate = new Date(fechaInicioInput.value + 'T12:00:00Z');
      const month = baseDate.getMonth();
      const year = baseDate.getFullYear();
      const lastDay = new Date(year, month + 1, 0).getDate();
      const currentDay = baseDate.getDate();
      const remainingDays = lastDay - currentDay + 1;
      
      const tarifaFija = parseFloat(pagoMesFijoInput.value) || 80.00;
      let costo = (tarifaFija / lastDay) * remainingDays;
      pagoPrimerMesInput.value = costo.toFixed(2);
  }

  if(fechaInicioInput && pagoPrimerMesInput && pagoMesFijoInput) {
      fechaInicioInput.addEventListener('change', recalculatePrimerMes);
      pagoMesFijoInput.addEventListener('input', recalculatePrimerMes);
  }

  // ── Uniforme: se pregunta si lo quiere, y recién ahí se pide tipo, nombre y número ──
  const uniformeQuiere = document.getElementById('a-uniforme-quiere');
  const uniformeDetalle = document.getElementById('inscripcion-uniforme-detalle');
  const uniformeTipo = document.getElementById('a-uniforme-tipo');
  const uniformeNombre = document.getElementById('a-uniforme-nombre');
  const uniformeNumero = document.getElementById('a-uniforme-numero');
  const uniformePago = document.getElementById('a-pago-uni');
  const UNIFORM_PRECIO = { completo: 60, polo: 40, short: 20, medias: 10 };
  const UNIFORM_LABEL = { completo: 'Completo', polo: 'Polo', short: 'Short', medias: 'Medias' };
  const UNIFORM_NECESITA = {
      completo: { nombre: true,  numero: true },
      polo:     { nombre: true,  numero: true },
      short:    { nombre: false, numero: true },
      medias:   { nombre: false, numero: false }
  };

  function updateUniformeUI() {
      const quiere = uniformeQuiere?.value === 'si';
      if (uniformeDetalle) uniformeDetalle.hidden = !quiere;

      const tipo = uniformeTipo?.value || 'completo';
      const necesita = UNIFORM_NECESITA[tipo] || { nombre: false, numero: false };
      if (uniformeNombre) uniformeNombre.required = quiere && necesita.nombre;
      if (uniformeNumero) uniformeNumero.required = quiere && necesita.numero;
  }

  if (uniformeQuiere) {
      uniformeQuiere.addEventListener('change', updateUniformeUI);
      uniformeTipo?.addEventListener('change', () => {
          const precio = UNIFORM_PRECIO[uniformeTipo.value] ?? 60;
          if (uniformePago) uniformePago.value = precio.toFixed(2);
          updateUniformeUI();
      });
      updateUniformeUI();
  }

  function setMessage(text = '') {
    message.textContent = text;
    message.hidden = !text;
  }

  function summary() {
    const value = (id) => document.getElementById(id).value.trim();
    const choice = (id) => {
      const select = document.getElementById(id);
      return select.value ? select.selectedOptions[0].textContent.trim() : '';
    };
    document.getElementById('inscripcion-resumen-alumno').textContent =
      [[value('a-nombres'), value('a-apellidos')].filter(Boolean).join(' '), value('a-dni') && 'DNI ' + value('a-dni')].filter(Boolean).join(' · ');
    const birth = birthDetails();
    document.getElementById('inscripcion-resumen-nacimiento').textContent = birth ? `${birth.date} · ${birth.age}` : 'Sin completar';
    document.getElementById('inscripcion-resumen-apoderado').textContent =
      [value('a-apoderado'), value('a-telefono'), value('a-telefono-alternativo') && 'Alt. ' + value('a-telefono-alternativo')].filter(Boolean).join(' · ') || 'Sin completar';
    document.getElementById('inscripcion-resumen-observacion').textContent = value('a-observacion') || 'Sin completar';
    document.getElementById('inscripcion-resumen-deporte').textContent = [
      choice('a-sede'), choice('a-categoria') && 'Categoría ' + choice('a-categoria'),
      choice('a-horario'), choice('a-turno'), choice('a-grupo') && 'Grupo ' + choice('a-grupo')
    ].filter(Boolean).join(' · ');
    const quiereUniforme = document.getElementById('a-uniforme-quiere')?.value === 'si';
    document.getElementById('inscripcion-resumen-uniforme').textContent = quiereUniforme
      ? [
          UNIFORM_LABEL[document.getElementById('a-uniforme-tipo')?.value] || 'Uniforme',
          document.getElementById('a-uniforme-numero')?.value && '#' + document.getElementById('a-uniforme-numero').value,
          document.getElementById('a-uniforme-nombre')?.value
        ].filter(Boolean).join(' · ')
      : 'No';
  }

  function renderStep(focus = true) {
    panels.forEach((panel, index) => { panel.hidden = index !== step; });
    indicators.forEach((indicator, index) => {
      if (index === step) indicator.setAttribute('aria-current', 'step');
      else indicator.removeAttribute('aria-current');
      indicator.classList.toggle('is-complete', index < step);
    });
    previous.hidden = step === 0;
    next.hidden = step === panels.length - 1;
    submit.hidden = step !== panels.length - 1;
    document.getElementById('inscripcion-step-count').textContent = `Paso ${step + 1} de ${panels.length}`;
    if (step === panels.length - 1) summary();
    content.scrollTop = 0;
    if (focus) panels[step].querySelector('.inscripcion-step-title').focus({ preventScroll: true });
  }

  function validate(index) {
    const fields = [...panels[index].querySelectorAll('input, select')];
    for (const field of fields) {
      field.setCustomValidity('');
      if (field.id === 'a-nombres' && !field.value.trim()) field.setCustomValidity('Escribe los nombres del alumno.');
      if (!field.checkValidity()) {
        step = index;
        renderStep(false);
        field.setAttribute('aria-invalid', 'true');
        field.reportValidity();
        field.focus();
        return false;
      }
      field.removeAttribute('aria-invalid');
    }
    return true;
  }

  function advance() {
    if (saving || !validate(step)) return;
    setMessage();
    step = Math.min(step + 1, panels.length - 1);
    renderStep();
  }

  launch.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.showModal();
    document.body.classList.add('inscripcion-open');
    window.adminSedes.load(true);
    updateBirthHint();
    renderStep();
  });
  close.addEventListener('click', () => { if (!saving) dialog.close(); });
  dialog.addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('inscripcion-open');
    launch.focus({ preventScroll: true });
  });
  previous.addEventListener('click', () => {
    if (saving) return;
    setMessage();
    step = Math.max(0, step - 1);
    renderStep();
  });
  next.addEventListener('click', advance);
  form.addEventListener('input', (event) => {
    if (event.target.matches('input, select')) {
      event.target.setCustomValidity('');
      event.target.removeAttribute('aria-invalid');
      setMessage();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    if (step < panels.length - 1) { advance(); return; }
    for (let index = 0; index < panels.length; index++) if (!validate(index)) return;

    saving = true;
    setMessage();
    form.setAttribute('aria-busy', 'true');
    const controls = [...form.querySelectorAll('input, select, button'), close];
    controls.forEach((control) => { control.disabled = true; });
    submit.textContent = 'Creando inscripción…';
    try {
      const created = await window.crearAlumno();
      if (created === true) {
        form.reset();
        updateBirthHint();
        step = 0;
        renderStep(false);
        dialog.close();
      } else {
        setMessage(document.getElementById('toast')?.textContent || 'No se pudo completar la inscripción. Tus datos se conservan.');
      }
    } catch (error) {
      console.error(error);
      setMessage('No se pudo completar la inscripción. Tus datos se conservan.');
    } finally {
      saving = false;
      controls.forEach((control) => { control.disabled = false; });
      form.removeAttribute('aria-busy');
      submit.textContent = 'Crear inscripción';
    }
  });
})();
document.addEventListener('DOMContentLoaded', () => { const f_i = document.getElementById('a-fecha-inicio'); if (f_i) { const offset = new Date().getTimezoneOffset(); const myDate = new Date(new Date().getTime() - (offset*60*1000)); f_i.value = myDate.toISOString().split('T')[0]; } });
