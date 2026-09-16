// Gestión de pedidos de uniformes del panel administrativo.
const UNIFORM_TYPE_META = {
    completo: { label: 'Uniforme completo', detail: 'Polo + short + medias', price: 60, usesName: true, usesNumber: true },
    polo: { label: 'Polo', detail: 'Solo camiseta', price: 40, usesName: true, usesNumber: true },
    short: { label: 'Short', detail: 'Solo pantalón corto', price: 20, usesName: false, usesNumber: true },
    medias: { label: 'Medias', detail: 'Solo calcetines', price: 10, usesName: false, usesNumber: false }
};

const UNIFORM_COLOR_META = {
    salmon_granate: { label: 'Salmón y granate', swatch: 'is-salmon' },
    rojo_azul: { label: 'Rojo y azul', swatch: 'is-red-blue' }
};

const UNIFORM_STATUS_META = {
    pendiente: { label: 'Pendiente', short: 'Pendiente' },
    en_confeccion: { label: 'En confección', short: 'Confección' },
    entregado: { label: 'Entregado', short: 'Entregado' }
};

let uniformStudents = [];
let uniformOrders = [];
let uniformSelectedStudent = null;
let uniformEditingOrder = null;
let uniformUiInitialized = false;
let uniformIsLoading = false;
const uniformFilters = { status: 'all', payment: 'all', query: '' };

function uniformMoney(value) {
    const amount = Number(value || 0);
    return `S/ ${amount.toFixed(2)}`;
}

function uniformDate(value) {
    if (!value) return 'Sin fecha';
    return new Date(value).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getUniformStudent(studentId) {
    return uniformStudents.find(student => String(student.id) === String(studentId)) || null;
}

function setUniformFormError(message = '') {
    const element = document.getElementById('uniform-form-error');
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
}

function uniformErrorMessage(error) {
    const message = String(error?.message || 'No se pudo completar la operación.');
    if (error?.code === '42P01' || /uniform_orders|relation .* does not exist/i.test(message)) {
        return 'La sección todavía no está conectada a Supabase. Ejecuta la consulta SQL de uniformes y vuelve a intentar.';
    }
    if (error?.code === '42501' || /permission|policy|denied/i.test(message)) {
        return 'Tu usuario no tiene permiso para gestionar uniformes. Revisa las políticas de Supabase.';
    }
    return message;
}

function renderUniformStudentResults(query = '') {
    const results = document.getElementById('uniform-student-results');
    if (!results || uniformSelectedStudent) return;

    const normalized = normalizeAdminSearch(query);
    const activeStudents = uniformStudents.filter(student => student.is_active !== false);
    const matches = activeStudents.filter(student => {
        if (!normalized) return true;
        return normalizeAdminSearch(`${student.full_name || ''} ${student.dni || ''}`).includes(normalized);
    }).slice(0, 8);

    if (!activeStudents.length) {
        results.innerHTML = '<p class="uniform-inline-state">No hay alumnos activos disponibles.</p>';
        return;
    }
    if (!matches.length) {
        results.innerHTML = '<p class="uniform-inline-state is-error">No encontramos ese nombre o DNI.</p>';
        return;
    }

    results.innerHTML = matches.map(student => `
      <button class="uniform-student-option" type="button" data-uniform-student="${escapeAdminHtml(student.id)}">
        <span class="uniform-student-avatar">${escapeAdminHtml((student.full_name || '?').trim().charAt(0).toUpperCase())}</span>
        <span><strong>${escapeAdminHtml(student.full_name || 'Alumno sin nombre')}</strong><small>DNI ${escapeAdminHtml(student.dni || 'no registrado')}${student.categoria ? ` · Cat. ${escapeAdminHtml(student.categoria)}` : ''}</small></span>
        <b>Elegir</b>
      </button>`).join('');
}

function selectUniformStudent(studentId, keepDorsal = false) {
    const student = getUniformStudent(studentId);
    if (!student) return;

    uniformSelectedStudent = student;
    document.getElementById('uniform-student-id').value = student.id;
    document.getElementById('uniform-student-search').value = student.full_name || '';
    document.getElementById('uniform-student-results').innerHTML = '';
    document.getElementById('uniform-selected-name').textContent = student.full_name || 'Alumno sin nombre';
    document.getElementById('uniform-selected-meta').textContent = [
        student.dni ? `DNI ${student.dni}` : 'DNI no registrado',
        student.categoria ? `Categoría ${student.categoria}` : '',
        student.sede || ''
    ].filter(Boolean).join(' · ');
    document.getElementById('uniform-selected-student').hidden = false;

    const dorsalInput = document.getElementById('uniform-dorsal-name');
    if (!keepDorsal && !dorsalInput.value.trim()) {
        dorsalInput.value = String(student.full_name || '').trim().split(/\s+/)[0]?.toUpperCase() || '';
    }
    setUniformFormError();
}

function clearUniformStudent({ focus = false } = {}) {
    uniformSelectedStudent = null;
    document.getElementById('uniform-student-id').value = '';
    document.getElementById('uniform-student-search').value = '';
    document.getElementById('uniform-selected-student').hidden = true;
    renderUniformStudentResults('');
    if (focus) document.getElementById('uniform-student-search').focus();
}

function selectUniformType(type, updatePrice = true) {
    const meta = UNIFORM_TYPE_META[type];
    if (!meta) return;

    document.getElementById('uniform-type').value = type;
    document.querySelectorAll('[data-uniform-type]').forEach(button => {
        const selected = button.dataset.uniformType === type;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-checked', String(selected));
    });
    if (updatePrice) document.getElementById('uniform-amount').value = meta.price.toFixed(2);

    const nameInput = document.getElementById('uniform-dorsal-name');
    const numberInput = document.getElementById('uniform-dorsal-number');
    nameInput.disabled = !meta.usesName;
    nameInput.required = meta.usesName;
    numberInput.disabled = !meta.usesNumber;
    numberInput.required = meta.usesNumber;
    nameInput.closest('.uniform-field').classList.toggle('is-disabled', !meta.usesName);
    numberInput.closest('.uniform-field').classList.toggle('is-disabled', !meta.usesNumber);
    document.getElementById('uniform-dorsal-name-help').textContent = meta.usesName ? 'Se imprimirá en el polo.' : 'No se usa para esta prenda.';
    document.getElementById('uniform-dorsal-number-help').textContent = meta.usesNumber ? 'Número entre 0 y 99.' : 'No se usa para esta prenda.';
}

function selectUniformColor(color) {
    if (!UNIFORM_COLOR_META[color]) return;
    document.getElementById('uniform-color').value = color;
    document.querySelectorAll('[data-uniform-color]').forEach(button => {
        const selected = button.dataset.uniformColor === color;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-checked', String(selected));
    });
}

function updateUniformPaidUi() {
    const checkbox = document.getElementById('uniform-is-paid');
    const toggle = checkbox.closest('.uniform-paid-toggle');
    const isPaid = checkbox.checked;
    toggle.classList.toggle('is-paid', isPaid);
    document.getElementById('uniform-paid-label').textContent = isPaid ? 'Pagado' : 'Pendiente de pago';
    document.getElementById('uniform-paid-help').textContent = isPaid ? 'El pago ya fue recibido.' : 'Todavía no se recibió el dinero.';
}

function resetUniformForm({ focus = false } = {}) {
    const form = document.getElementById('uniform-form');
    if (!form) return;
    form.reset();
    uniformEditingOrder = null;
    document.getElementById('uniform-order-id').value = '';
    document.getElementById('uniform-form-title').textContent = 'Nuevo pedido';
    document.getElementById('uniform-cancel-edit').hidden = true;
    document.getElementById('uniform-save-button').innerHTML = `${adminIcon('save')} Guardar pedido`;
    document.getElementById('uniform-selected-student').hidden = true;
    document.getElementById('uniform-student-results').innerHTML = '';
    uniformSelectedStudent = null;
    selectUniformType('completo', true);
    selectUniformColor('salmon_granate');
    document.getElementById('uniform-is-paid').checked = false;
    updateUniformPaidUi();
    setUniformFormError();
    if (focus) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => document.getElementById('uniform-student-search').focus(), 250);
    }
}

function renderUniformMetrics() {
    document.getElementById('uniform-metric-pending').textContent = uniformOrders.filter(order => order.status === 'pendiente').length;
    document.getElementById('uniform-metric-making').textContent = uniformOrders.filter(order => order.status === 'en_confeccion').length;
    document.getElementById('uniform-metric-delivered').textContent = uniformOrders.filter(order => order.status === 'entregado').length;
    document.getElementById('uniform-metric-unpaid').textContent = uniformOrders.filter(order => !order.is_paid).length;
}

function setUniformMobileView(view, { scroll = false } = {}) {
    const page = document.getElementById('page-uniformes');
    if (!page || !['form', 'list'].includes(view)) return;
    page.dataset.mobileView = view;
    document.querySelectorAll('[data-uniform-mobile-view]').forEach(button => {
        const selected = button.dataset.uniformMobileView === view;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    if (scroll && window.matchMedia('(max-width: 700px)').matches) {
        document.querySelector('.uniform-mobile-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function getFilteredUniformOrders() {
    const normalized = normalizeAdminSearch(uniformFilters.query);
    return uniformOrders.filter(order => {
        const student = getUniformStudent(order.student_id) || {};
        const matchesText = !normalized || normalizeAdminSearch([
            student.full_name,
            student.dni,
            order.dorsal_name,
            order.dorsal_number,
            UNIFORM_TYPE_META[order.uniform_type]?.label
        ].filter(value => value !== null && value !== undefined).join(' ')).includes(normalized);
        const matchesStatus = uniformFilters.status === 'all' || order.status === uniformFilters.status;
        const matchesPayment = uniformFilters.payment === 'all'
            || (uniformFilters.payment === 'paid' ? order.is_paid : !order.is_paid);
        return matchesText && matchesStatus && matchesPayment;
    });
}

function uniformDorsalText(order) {
    const parts = [];
    if (order.dorsal_name) parts.push(String(order.dorsal_name).toUpperCase());
    if (order.dorsal_number !== null && order.dorsal_number !== undefined) parts.push(`#${order.dorsal_number}`);
    return parts.length ? parts.join(' · ') : 'No aplica';
}

function renderUniformOrders() {
    const list = document.getElementById('uniform-orders-list');
    const count = document.getElementById('uniform-results-count');
    if (!list || !count) return;

    const orders = getFilteredUniformOrders();
    count.textContent = `${orders.length} ${orders.length === 1 ? 'pedido visible' : 'pedidos visibles'}`;

    if (!uniformOrders.length) {
        list.innerHTML = `<div class="uniform-state"><span>${adminIcon('shirt')}</span><strong>Aún no hay pedidos</strong><p>Usa el formulario para registrar el primer uniforme.</p></div>`;
        return;
    }
    if (!orders.length) {
        list.innerHTML = '<div class="uniform-state"><strong>No hay resultados</strong><p>Prueba con otro nombre, DNI o filtro.</p></div>';
        return;
    }

    list.innerHTML = orders.map(order => {
        const student = getUniformStudent(order.student_id) || {};
        const type = UNIFORM_TYPE_META[order.uniform_type] || UNIFORM_TYPE_META.completo;
        const color = UNIFORM_COLOR_META[order.color_variant] || UNIFORM_COLOR_META.salmon_granate;
        const status = UNIFORM_STATUS_META[order.status] || UNIFORM_STATUS_META.pendiente;
        const notes = order.notes ? `<p class="uniform-order-note">${escapeAdminHtml(order.notes)}</p>` : '';

        return `<article class="uniform-order-card" data-uniform-order-card="${escapeAdminHtml(order.id)}">
          <header class="uniform-order-head">
            <div class="uniform-order-person">
              <span class="uniform-order-avatar">${escapeAdminHtml((student.full_name || '?').trim().charAt(0).toUpperCase())}</span>
              <div><h3>${escapeAdminHtml(student.full_name || 'Alumno no disponible')}</h3><p>DNI ${escapeAdminHtml(student.dni || 'no registrado')} · Pedido ${escapeAdminHtml(uniformDate(order.created_at))}</p></div>
            </div>
            <span class="uniform-order-status is-${escapeAdminHtml(order.status)}">${escapeAdminHtml(status.label)}</span>
          </header>
          <div class="uniform-order-details">
            <div><span>Prendas</span><strong>${escapeAdminHtml(type.label)}</strong><small>${escapeAdminHtml(type.detail)}</small></div>
            <div><span>Dorsal</span><strong>${escapeAdminHtml(uniformDorsalText(order))}</strong></div>
            <div><span>Colores</span><strong class="uniform-order-color"><i class="uniform-color-swatch ${color.swatch}"></i>${escapeAdminHtml(color.label)}</strong></div>
            <div><span>Total</span><strong class="uniform-order-amount">${escapeAdminHtml(uniformMoney(order.amount))}</strong></div>
          </div>
          ${notes}
          <div class="uniform-order-workflow">
            <span>Estado del pedido</span>
            <div>
              ${Object.entries(UNIFORM_STATUS_META).map(([value, item]) => `<button type="button" data-uniform-set-status="${value}" data-order-id="${escapeAdminHtml(order.id)}" class="${order.status === value ? 'is-active' : ''}" aria-pressed="${order.status === value}">${escapeAdminHtml(item.short)}</button>`).join('')}
            </div>
          </div>
          <footer class="uniform-order-actions">
            <button class="uniform-payment-action ${order.is_paid ? 'is-paid' : ''}" type="button" data-uniform-toggle-paid="${escapeAdminHtml(order.id)}">${adminIcon(order.is_paid ? 'check' : 'cash')} ${order.is_paid ? 'Pagado' : 'Marcar como pagado'}</button>
            <button class="uniform-edit-action" type="button" data-uniform-edit="${escapeAdminHtml(order.id)}">${adminIcon('edit')} Editar pedido</button>
          </footer>
        </article>`;
    }).join('');
}

function renderUniformSetupError(error) {
    const list = document.getElementById('uniform-orders-list');
    const message = uniformErrorMessage(error);
    if (list) list.innerHTML = `<div class="uniform-state is-error"><span>${adminIcon('alert')}</span><strong>No pudimos cargar Uniformes</strong><p>${escapeAdminHtml(message)}</p><button type="button" id="uniform-error-retry">Volver a intentar</button></div>`;
    document.getElementById('uniform-results-count').textContent = '';
}

async function loadUniformes() {
    if (uniformIsLoading || !document.getElementById('page-uniformes')) return;
    initUniformesUi();
    uniformIsLoading = true;
    const list = document.getElementById('uniform-orders-list');
    if (list) list.innerHTML = '<div class="uniform-state is-loading"><i></i><strong>Cargando pedidos…</strong></div>';

    try {
        const [studentsResult, ordersResult] = await Promise.all([
            window.supabaseClient.from('students').select('id, full_name, dni, categoria, sede, is_active').order('full_name'),
            window.supabaseClient.from('uniform_orders').select('*').order('created_at', { ascending: false })
        ]);
        if (studentsResult.error) throw studentsResult.error;
        if (ordersResult.error) throw ordersResult.error;
        uniformStudents = studentsResult.data || [];
        uniformOrders = ordersResult.data || [];
        renderUniformMetrics();
        renderUniformOrders();
    } catch (error) {
        console.error('Error cargando uniformes:', error);
        renderUniformSetupError(error);
    } finally {
        uniformIsLoading = false;
    }
}

function startUniformEdit(orderId) {
    const order = uniformOrders.find(item => String(item.id) === String(orderId));
    if (!order) return;
    uniformEditingOrder = order;
    document.getElementById('uniform-order-id').value = order.id;
    document.getElementById('uniform-form-title').textContent = 'Editar pedido';
    document.getElementById('uniform-cancel-edit').hidden = false;
    document.getElementById('uniform-save-button').innerHTML = `${adminIcon('save')} Guardar cambios`;
    selectUniformType(order.uniform_type, false);
    selectUniformColor(order.color_variant);
    document.getElementById('uniform-dorsal-name').value = order.dorsal_name || '';
    document.getElementById('uniform-dorsal-number').value = order.dorsal_number ?? '';
    document.getElementById('uniform-amount').value = Number(order.amount || 0).toFixed(2);
    document.getElementById('uniform-is-paid').checked = Boolean(order.is_paid);
    document.getElementById('uniform-notes').value = order.notes || '';
    updateUniformPaidUi();
    selectUniformStudent(order.student_id, true);
    setUniformMobileView('form', { scroll: true });
    setUniformFormError();
    document.getElementById('uniform-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveUniformOrder(event) {
    event.preventDefault();
    setUniformFormError();

    const type = document.getElementById('uniform-type').value;
    const typeMeta = UNIFORM_TYPE_META[type];
    const amount = Number(document.getElementById('uniform-amount').value);
    const dorsalName = document.getElementById('uniform-dorsal-name').value.trim();
    const dorsalNumberRaw = document.getElementById('uniform-dorsal-number').value;
    const dorsalNumber = dorsalNumberRaw === '' ? null : Number(dorsalNumberRaw);

    if (!uniformSelectedStudent) {
        setUniformFormError('Busca al alumno y presiona “Elegir” antes de guardar.');
        document.getElementById('uniform-student-search').focus();
        return;
    }
    if (!typeMeta) {
        setUniformFormError('Selecciona las prendas del pedido.');
        return;
    }
    if (typeMeta.usesName && !dorsalName) {
        setUniformFormError('Escribe el nombre que irá en el dorsal.');
        document.getElementById('uniform-dorsal-name').focus();
        return;
    }
    if (typeMeta.usesNumber && (!Number.isInteger(dorsalNumber) || dorsalNumber < 0 || dorsalNumber > 99)) {
        setUniformFormError('Escribe un número de dorsal entre 0 y 99.');
        document.getElementById('uniform-dorsal-number').focus();
        return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
        setUniformFormError('Revisa el precio del pedido.');
        document.getElementById('uniform-amount').focus();
        return;
    }

    const payload = {
        student_id: uniformSelectedStudent.id,
        dorsal_name: typeMeta.usesName ? dorsalName : null,
        dorsal_number: typeMeta.usesNumber ? dorsalNumber : null,
        uniform_type: type,
        color_variant: document.getElementById('uniform-color').value,
        amount,
        is_paid: document.getElementById('uniform-is-paid').checked,
        notes: document.getElementById('uniform-notes').value.trim() || null
    };

    const button = document.getElementById('uniform-save-button');
    const editingId = uniformEditingOrder?.id;
    button.disabled = true;
    button.innerHTML = `${adminIcon('clock')} Guardando…`;

    try {
        const request = editingId
            ? window.supabaseClient.from('uniform_orders').update(payload).eq('id', editingId)
            : window.supabaseClient.from('uniform_orders').insert({ ...payload, status: 'pendiente' });
        const { error } = await request;
        if (error) throw error;
        showToast(editingId ? 'Pedido de uniforme actualizado.' : 'Pedido de uniforme registrado.');
        resetUniformForm();
        await loadUniformes();
        setUniformMobileView('list', { scroll: true });
    } catch (error) {
        console.error('Error guardando uniforme:', error);
        setUniformFormError(uniformErrorMessage(error));
    } finally {
        button.disabled = false;
        if (uniformEditingOrder) button.innerHTML = `${adminIcon('save')} Guardar cambios`;
        else button.innerHTML = `${adminIcon('save')} Guardar pedido`;
    }
}

async function updateUniformOrder(orderId, changes, successMessage) {
    const card = document.querySelector(`[data-uniform-order-card="${CSS.escape(String(orderId))}"]`);
    if (card) card.classList.add('is-updating');
    try {
        const { data, error } = await window.supabaseClient
            .from('uniform_orders')
            .update(changes)
            .eq('id', orderId)
            .select()
            .single();
        if (error) throw error;
        const index = uniformOrders.findIndex(order => String(order.id) === String(orderId));
        if (index >= 0) uniformOrders[index] = data;
        renderUniformMetrics();
        renderUniformOrders();
        showToast(successMessage);
    } catch (error) {
        console.error('Error actualizando uniforme:', error);
        showToast(uniformErrorMessage(error), 'error');
        if (card) card.classList.remove('is-updating');
    }
}

function setUniformFilter(kind, value) {
    uniformFilters[kind] = value;
    const selector = kind === 'status' ? '[data-uniform-status-filter]' : '[data-uniform-payment-filter]';
    document.querySelectorAll(selector).forEach(button => {
        const selected = button.dataset[kind === 'status' ? 'uniformStatusFilter' : 'uniformPaymentFilter'] === value;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    renderUniformOrders();
}

function initUniformesUi() {
    if (uniformUiInitialized || !document.getElementById('uniform-form')) return;
    uniformUiInitialized = true;

    const form = document.getElementById('uniform-form');
    const studentSearch = document.getElementById('uniform-student-search');
    const orderList = document.getElementById('uniform-orders-list');

    form.addEventListener('submit', saveUniformOrder);
    studentSearch.addEventListener('focus', () => {
        if (!uniformSelectedStudent) renderUniformStudentResults(studentSearch.value);
    });
    studentSearch.addEventListener('input', () => {
        if (uniformSelectedStudent) {
            uniformSelectedStudent = null;
            document.getElementById('uniform-student-id').value = '';
            document.getElementById('uniform-selected-student').hidden = true;
        }
        renderUniformStudentResults(studentSearch.value);
    });
    document.getElementById('uniform-student-results').addEventListener('click', event => {
        const button = event.target.closest('[data-uniform-student]');
        if (button) selectUniformStudent(button.dataset.uniformStudent);
    });
    document.getElementById('uniform-change-student').addEventListener('click', () => clearUniformStudent({ focus: true }));
    document.querySelectorAll('[data-uniform-type]').forEach(button => button.addEventListener('click', () => selectUniformType(button.dataset.uniformType, true)));
    document.querySelectorAll('[data-uniform-color]').forEach(button => button.addEventListener('click', () => selectUniformColor(button.dataset.uniformColor)));
    document.getElementById('uniform-is-paid').addEventListener('change', updateUniformPaidUi);
    document.getElementById('uniform-cancel-edit').addEventListener('click', () => resetUniformForm());
    document.getElementById('uniform-new-button').addEventListener('click', () => {
        setUniformMobileView('form', { scroll: true });
        resetUniformForm({ focus: true });
    });
    document.getElementById('uniform-refresh').addEventListener('click', loadUniformes);
    document.getElementById('uniform-order-search').addEventListener('input', event => {
        uniformFilters.query = event.target.value;
        renderUniformOrders();
    });
    document.querySelectorAll('[data-uniform-status-filter]').forEach(button => button.addEventListener('click', () => setUniformFilter('status', button.dataset.uniformStatusFilter)));
    document.querySelectorAll('[data-uniform-payment-filter]').forEach(button => button.addEventListener('click', () => setUniformFilter('payment', button.dataset.uniformPaymentFilter)));
    document.querySelectorAll('[data-uniform-mobile-view]').forEach(button => button.addEventListener('click', () => {
        setUniformMobileView(button.dataset.uniformMobileView);
        if (button.dataset.uniformMobileView === 'form' && !uniformEditingOrder) {
            window.setTimeout(() => document.getElementById('uniform-student-search')?.focus(), 80);
        }
    }));

    orderList.addEventListener('click', event => {
        const retry = event.target.closest('#uniform-error-retry');
        if (retry) return loadUniformes();

        const statusButton = event.target.closest('[data-uniform-set-status]');
        if (statusButton) {
            const status = statusButton.dataset.uniformSetStatus;
            const order = uniformOrders.find(item => String(item.id) === String(statusButton.dataset.orderId));
            if (order && order.status !== status) {
                updateUniformOrder(order.id, { status }, `Pedido marcado como ${UNIFORM_STATUS_META[status].label.toLowerCase()}.`);
            }
            return;
        }

        const paymentButton = event.target.closest('[data-uniform-toggle-paid]');
        if (paymentButton) {
            const order = uniformOrders.find(item => String(item.id) === String(paymentButton.dataset.uniformTogglePaid));
            if (order) updateUniformOrder(order.id, { is_paid: !order.is_paid }, order.is_paid ? 'Pago marcado como pendiente.' : 'Pago confirmado.');
            return;
        }

        const editButton = event.target.closest('[data-uniform-edit]');
        if (editButton) startUniformEdit(editButton.dataset.uniformEdit);
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('.uniform-form-card') && !uniformSelectedStudent) {
            document.getElementById('uniform-student-results').innerHTML = '';
        }
    });

    resetUniformForm();
    setUniformMobileView('list');
}

window.loadUniformes = loadUniformes;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUniformesUi, { once: true });
} else {
    initUniformesUi();
}
