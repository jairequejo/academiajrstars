// Catálogo compartido. students.sede guarda el nombre de la sede, no su ID.
(() => {
  const selects = [...document.querySelectorAll('[data-admin-sede]')];
  const status = document.getElementById('inscripcion-sedes-status');
  const retry = document.getElementById('inscripcion-sedes-retry');
  let catalog = null;
  let pending = null;

  function setStatus(text, canRetry = false) {
    if (status) status.textContent = text;
    if (retry) retry.hidden = !canRetry;
  }

  function setValue(id, value) {
    const select = typeof id === 'string' ? document.getElementById(id) : id;
    if (!select) return;
    // Conservar las sedes de alumnos anteriores aunque ya no estén en el catálogo.
    if (value && ![...select.options].some(option => option.value === value)) {
      select.add(new Option(value, value));
    }
    select.value = value || '';
  }

  function render() {
    selects.forEach(select => {
      const selected = select.value;
      select.replaceChildren(new Option(select.dataset.sedePlaceholder, ''));
      catalog.forEach(sede => {
        const label = sede.alias ? `${sede.nombre} (${sede.alias})` : sede.nombre;
        select.add(new Option(label, sede.nombre));
      });
      setValue(select, selected);
    });
  }

  function load(refresh = false) {
    if (pending) return pending;
    if (catalog && !refresh) return Promise.resolve(true);
    selects.forEach(select => select.setAttribute('aria-busy', 'true'));
    setStatus('Cargando sedes…');
    pending = (async () => {
      try {
        if (!window.supabaseClient) throw new Error('No se pudo conectar con el catálogo de sedes.');
        const { data, error } = await window.supabaseClient.from('sedes').select('nombre, alias').order('nombre');
        if (error) throw error;
        const unique = new Map();
        (data || []).forEach(sede => {
          const nombre = sede.nombre?.trim();
          if (nombre) unique.set(nombre.toLocaleLowerCase('es'), { nombre, alias: sede.alias?.trim() || '' });
        });
        catalog = [...unique.values()];
        render();
        setStatus(catalog.length ? `${catalog.length} sedes disponibles.` : 'No hay sedes registradas.', !catalog.length);
        return true;
      } catch (error) {
        console.error('Error cargando sedes:', error);
        setStatus(catalog ? 'No se pudo actualizar la lista de sedes. Vuelve a intentarlo.' : 'No se pudieron cargar las sedes. Vuelve a intentarlo.', true);
        return false;
      }
    })();
    pending.finally(() => {
      pending = null;
      selects.forEach(select => select.removeAttribute('aria-busy'));
    });
    return pending;
  }

  window.adminSedes = { load, setValue };
  retry?.addEventListener('click', () => load(true));
  load();
})();
