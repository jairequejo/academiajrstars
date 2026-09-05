async function loadCobranzas() {
    const tbody = document.getElementById('cobranzas-tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>';
    
    const limite = new Date();
    limite.setDate(limite.getDate() + 2);
    const limiteStr = limite.toISOString().split('T')[0];
    
    const { data, error } = await window.supabaseClient
        .from('students')
        .select('id, full_name, valid_until, parent_name, parent_phone, last_notified_at')
        .eq('is_active', true)
        .lte('valid_until', limiteStr)
        .order('valid_until', { ascending: true });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger); text-align:center;">Error cargando datos</td></tr>`;
        return;
    }
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No hay pagos pendientes ni próximos a vencer en los próximos 2 días.</td></tr>`;
        return;
    }
    
    const hoy = new Date();
    let html = '';
    
    data.forEach(st => {
        let puedeNotificar = true;
        let lastNotifText = 'Nunca';
        
        if (st.last_notified_at) {
            const lastNotif = new Date(st.last_notified_at);
            const diffHours = (hoy - lastNotif) / (1000 * 60 * 60);
            if (diffHours < 24) puedeNotificar = false;
            lastNotifText = lastNotif.toLocaleDateString('es-PE') + ' ' + lastNotif.toLocaleTimeString('es-PE', {hour:'2-digit', minute:'2-digit'});
        }
        
        const fechaVenc = new Date(st.valid_until + "T12:00:00").toLocaleDateString('es-PE');
        const vencido = (new Date(st.valid_until + "T23:59:59") < hoy);
        const colorVenc = vencido ? 'color:var(--danger); font-weight:bold;' : 'color:var(--warning);';
        
        const telStr = st.parent_phone ? st.parent_phone.replace(/\D/g, '') : '';
        const phoneDisplay = telStr ? telStr : 'Sin teléfono';
        
        let notifBtn = `<button class="btn" style="background:var(--success); color:white; width:100%; margin-bottom:5px;" onclick="notificarWhatsApp('${st.id}', '${st.full_name}', '${st.parent_name}', '${telStr}', '${fechaVenc}')">
            <svg style="vertical-align:middle;" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.061-.3-.15-1.265-.462-2.406-1.477-.883-.788-1.48-1.761-1.653-2.059-.173-.295-.018-.458.13-.606.134-.133.3-.343.45-.514.149-.171.2-.295.3-.492.099-.195.05-.368-.025-.515-.075-.15-.672-1.62-.922-2.206-.24-.579-.481-.501-.672-.51l-.573-.008c-.198 0-.52.074-.792.369-.271.295-1.04 1.01-1.04 2.459 0 1.449 1.063 2.848 1.213 3.046.149.195 2.079 3.178 5.039 4.458.704.305 1.253.488 1.68.625.707.227 1.35.195 1.851.119.567-.085 1.767-.722 2.016-1.42.249-.697.249-1.294.175-1.42-.074-.125-.274-.2-.574-.35zM12 21.942A9.914 9.914 0 017 20.6l-.36-.214-3.53.926.945-3.441-.235-.373A9.91 9.91 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.12 1.545 5.864L0 24l6.284-1.646A11.91 11.91 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg> Notificar (Hoy)
        </button>`;
        
        if (!puedeNotificar) {
            notifBtn = `<button class="btn" style="background:#555; color:white; width:100%; margin-bottom:5px; cursor:not-allowed;" disabled>Ya notificado hoy</button>`;
        }
        if (!telStr) {
            notifBtn = `<button class="btn" style="background:#555; color:white; width:100%; margin-bottom:5px; cursor:not-allowed;" disabled>Sin Teléfono</button>`;
        }
        
        html += `
        <tr>
            <td>
                <strong>${st.full_name}</strong><br>
                <span style="font-size:0.8rem; color:var(--text-gray);">Notificado: ${lastNotifText}</span>
            </td>
            <td style="${colorVenc}">${vencido ? 'VENCIDO' : 'Vence'}<br>${fechaVenc}</td>
            <td>${st.parent_name || 'Desconocido'}<br><span style="font-size:0.8rem;">${phoneDisplay}</span></td>
            <td>
                ${notifBtn}
                <button class="btn" style="width:100%;" onclick="renovarPago('${st.id}')">Registrar Pago</button>
            </td>
        </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

async function notificarWhatsApp(studentId, fullName, parentName, parentPhone, fechaVencimiento) {
    if (!parentPhone || parentPhone.length < 9) {
        showToast('El teléfono no parece válido', 'error');
        return;
    }
    
    // Sanear el número (Si ya empieza con 51, no lo duplicamos. Si no, se lo ponemos)
    let finalPhone = parentPhone.replace(/\D/g, '');
    if (finalPhone.length === 9) {
        finalPhone = '51' + finalPhone;
    } else if (finalPhone.startsWith('51') && finalPhone.length === 11) {
        // Ya tiene el código de Perú, lo dejamos tal cual
    } else {
        // En caso de números internacionales u otros formatos
    }
    
    const { error } = await window.supabaseClient

        .from('students')
        .update({ last_notified_at: new Date().toISOString() })
        .eq('id', studentId);
        
    if (error) {
        showToast('Error al registrar notificación en BD', 'error');
        return;
    }
    
    const apoderado = parentName && parentName !== 'null' ? parentName : 'Apoderado';
    const text = `¡Hola ${apoderado}! 👋\nLe escribimos de la Academia *JR Stars*. Le recordamos que la mensualidad del jugador *${fullName}* vence el *${fechaVencimiento}*.\n\nPuede regularizar el pago presencialmente o mediante Yape al 955515693 (Envíe la captura por este medio). ¡Gracias por su compromiso! ⚽`;
    
    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
    
    window.open(url, '_blank');
    loadCobranzas();
    showToast('Notificación enviada y registrada.');
}

function renovarPago(studentId) {
    if (typeof abrirPago === 'function') {
        abrirPago(studentId);
    } else {
        showToast('Función de pago no encontrada. Renueva desde Ficha.', 'error');
    }
}
