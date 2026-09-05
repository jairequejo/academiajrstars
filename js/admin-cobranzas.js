async function loadCobranzas() {
    const grid = document.getElementById('cobranzas-grid');
    grid.innerHTML = '<div class="text-center text-gray-500 py-6">Cargando data...</div>';
    
    const limite = new Date();
    limite.setDate(limite.getDate() + 2);
    const limiteStr = limite.toISOString().split('T')[0];
    
    const { data, error } = await window.supabaseClient
        .from('students')
        .select('id, full_name, valid_until, parent_name, parent_phone, last_notified_at, tarifa_mensual')
        .eq('is_active', true)
        .lte('valid_until', limiteStr)
        .order('valid_until', { ascending: true });
        
    if (error) {
        grid.innerHTML = '<div class="text-center text-red-500 py-6 font-bold">Error cargando datos</div>';
        return;
    }
    
    if (!data || data.length === 0) {
        grid.innerHTML = '<div class="text-center text-gray-500 py-8 bg-gray-50 rounded-xl border border-gray-200">✅ No hay pagos pendientes ni próximos a vencer.</div>';
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
        
        const telStr = st.parent_phone ? st.parent_phone.replace(/\D/g, '') : '';
        const phoneDisplay = telStr ? telStr : 'Sin teléfono';
        const tarifaStr = st.tarifa_mensual ? parseFloat(st.tarifa_mensual).toFixed(2) : '---';
        
        let notifClass = "w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg transition-colors flex justify-center items-center gap-2";
        let notifText = "📱 Notificar (S/ " + tarifaStr + ")";
        let notifAction = `onclick="notificarWhatsApp('${st.id}', '${st.full_name}', '${st.parent_name}', '${telStr}', '${fechaVenc}', '${tarifaStr}')"`;

        if (!puedeNotificar) {
            notifClass = "w-full bg-gray-300 text-gray-500 font-bold py-2 rounded-lg cursor-not-allowed flex justify-center items-center";
            notifText = "✓ Ya notificado hoy";
            notifAction = "disabled";
        } else if (!telStr) {
            notifClass = "w-full bg-gray-300 text-gray-500 font-bold py-2 rounded-lg cursor-not-allowed flex justify-center items-center";
            notifText = "⚠️ Sin teléfono";
            notifAction = "disabled";
        }

        const badgeClass = vencido ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200';
        const statusText = vencido ? 'VENCIDO' : 'VENCE PRONTO';

        html += `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col mb-3">
            <div class="p-4 flex justify-between items-start border-b border-gray-100">
                <div>
                    <h3 class="font-bold text-gray-900 text-lg leading-tight">${st.full_name}</h3>
                    <p class="text-sm text-gray-600 mt-1">Padre: <span class="font-semibold text-gray-800">${st.parent_name || 'Desconocido'}</span></p>
                    <p class="text-sm text-gray-600">Tel: <span class="font-mono text-gray-800">${phoneDisplay}</span></p>
                </div>
                <div class="flex flex-col items-end text-right">
                    <span class="px-2 py-1 text-[0.65rem] font-bold rounded-full uppercase tracking-wide ${badgeClass}">
                        ${statusText}
                    </span>
                    <p class="text-sm font-black mt-2 ${vencido ? 'text-red-600' : 'text-amber-600'}">${fechaVenc}</p>
                </div>
            </div>
            
            <div class="bg-gray-50 px-4 py-2 flex justify-between items-center text-xs text-gray-500 border-b border-gray-100">
                <span>⏱️ Última: <span class="font-semibold text-gray-700">${lastNotifText}</span></span>
            </div>

            <div class="p-3 grid grid-cols-2 gap-2 bg-gray-50">
                <button class="${notifClass}" ${notifAction}>
                    ${notifText}
                </button>
                <button onclick="inhabilitarMoroso('${st.id}', '${st.full_name}')" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors shadow-sm">
                    🚫 Inhabilitar
                </button>
            </div>
        </div>
        `;
    });
    
    grid.innerHTML = html;
}

async function notificarWhatsApp(studentId, fullName, parentName, parentPhone, fechaVencimiento, tarifa) {
    if (!parentPhone || parentPhone.length < 9) {
        showToast('El teléfono no parece válido', 'error');
        return;
    }
    
    let finalPhone = parentPhone.replace(/\D/g, '');
    if (finalPhone.length === 9) {
        finalPhone = '51' + finalPhone;
    } else if (finalPhone.startsWith('51') && finalPhone.length === 11) {
        // ok
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
    const text = `Hola ${apoderado}.\nLe escribimos de la Academia *JR Stars*. Le recordamos que la mensualidad del jugador *${fullName}* por el monto de *S/ ${tarifa}* vence el *${fechaVencimiento}*.\n\nPuede regularizar el pago presencialmente o mediante Yape al 955515693 (Envíe la captura por este medio). Gracias por su compromiso.`;
    
    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
    
    window.open(url, '_blank');
    loadCobranzas();
    showToast('Notificación enviada y registrada.');
}

async function inhabilitarMoroso(studentId, fullName) {
    if (!confirm(`¿Estás seguro de inhabilitar al alumno ${fullName}? No podrá registrar asistencia hasta que regularice su pago.`)) {
        return;
    }
    
    const { error } = await window.supabaseClient
        .from('students')
        .update({ is_active: false })
        .eq('id', studentId);
        
    if (error) {
        showToast('Error al inhabilitar alumno.', 'error');
        return;
    }
    
    showToast(`${fullName} inhabilitado correctamente.`);
    loadCobranzas(); 
}
