import re

with open('js/admin.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace variables block
old_vars = """  const pagoMes = parseFloat(document.getElementById('a-pago-mes').value) || 0;
  const pagoMat = parseFloat(document.getElementById('a-pago-mat').value) || 0;
  const metodo = document.getElementById('a-metodo').value;"""

new_vars = """  const pagoMes = parseFloat(document.getElementById('a-pago-mes').value) || 0;
  const pagoMat = parseFloat(document.getElementById('a-pago-mat').value) || 0;
  const pagoUni = parseFloat(document.getElementById('a-pago-uni').value) || 0;
  const pagoPrimerMes = parseFloat(document.getElementById('a-pago-primer').value) || 0;
  const metodo = document.getElementById('a-metodo').value;"""

content = content.replace(old_vars, new_vars)

# Replace date calculation block
old_date = """  const hoy = new Date(baseDate);
  // Sumar exactamente 1 mes para que se conserve el mismo número de día
  hoy.setMonth(hoy.getMonth() + 1);
  const fecha_vencimiento_str = hoy.toISOString().split('T')[0];
  const fecha_inicio_str = baseDate.toISOString().split('T')[0];"""

new_date = """  // Regla del Mes Calendario: Vencimiento siempre es el último día del mes actual.
  const valid_until_date = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0); 
  const fecha_vencimiento_str = valid_until_date.toISOString().split('T')[0];
  const fecha_inicio_str = baseDate.toISOString().split('T')[0];"""

content = content.replace(old_date, new_date)

# Replace insert data and whatsapp logic
old_insert = """      if (pagoMes > 0) {
          const { error: pagoErr } = await window.supabaseClient.from('mensualidades').insert({
              student_id: nuevo_alumno.id,
              monto: pagoMes,
              metodo_pago: metodo,
              fecha_inicio: fecha_inicio_str,
              fecha_vencimiento: fecha_vencimiento_str
          });
          if (pagoErr) throw pagoErr;
      }

      document.getElementById('a-nombres').value = '';"""

new_insert = """      // Insertar el total pagado en la inscripción (Matrícula + Primer Mes) en mensualidades
      const totalPagado = pagoPrimerMes + pagoMat;
      if (totalPagado > 0) {
          const { error: pagoErr } = await window.supabaseClient.from('mensualidades').insert({
              student_id: nuevo_alumno.id,
              monto: totalPagado,
              metodo_pago: metodo,
              fecha_inicio: fecha_inicio_str,
              fecha_vencimiento: fecha_vencimiento_str
          });
          if (pagoErr) throw pagoErr;
      }
      
      // Si hay cobro de uniforme, registrarlo en uniform_orders si existe, o solo como nota.
      if (pagoUni > 0) {
          try {
             await window.supabaseClient.from('uniform_orders').insert({
                 student_id: nuevo_alumno.id,
                 kit_type: 'Completo',
                 size: 'Por definir',
                 name_on_shirt: firstNames.split(' ')[0],
                 is_paid: true,
                 total_price: pagoUni,
                 is_delivered: false
             });
          } catch(e) { console.error('No se pudo guardar orden de uniforme', e); }
      }

      // Enviar WhatsApp al apoderado
      if (telefono) {
          const phoneParam = (telefono.length === 9) ? '51' + telefono : telefono;
          let msg = `Hola! ⚽ Bienvenidos a la familia *JR Stars*.\n\n`;
          msg += `👦 *Alumno:* ${nombre}\n\n`;
          msg += `🧾 *Boleta de Inscripción:*\n`;
          if (pagoMat > 0) msg += `✅ Matrícula: S/ ${pagoMat.toFixed(2)}\n`;
          if (pagoUni > 0) msg += `✅ Uniforme: S/ ${pagoUni.toFixed(2)}\n`;
          if (pagoPrimerMes > 0) msg += `✅ Entrenamiento (Mes actual): S/ ${pagoPrimerMes.toFixed(2)}\n`;
          const sumaTotal = pagoMat + pagoUni + pagoPrimerMes;
          msg += `*Total Abonado:* S/ ${sumaTotal.toFixed(2)} (${metodo})\n\n`;
          
          const formatterStr = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' });
          let mesSiguiente = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
          let mesSiguienteStr = formatterStr.format(mesSiguiente);
          mesSiguienteStr = mesSiguienteStr.charAt(0).toUpperCase() + mesSiguienteStr.slice(1);
          
          msg += `🗓️ Su próxima mensualidad regular (S/ ${pagoMes.toFixed(2)}) corresponde al mes de *${mesSiguienteStr}* (tienen hasta el 15 de cada mes para cancelar).\n\n`;
          msg += `¡A darle con todo en los entrenamientos! 🌟`;
          
          const whatsappUrl = `https://wa.me/${phoneParam}?text=${encodeURIComponent(msg)}`;
          window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }

      document.getElementById('a-nombres').value = '';"""

content = content.replace(old_insert, new_insert)

with open('js/admin.js', 'w', encoding='utf-8') as f:
    f.write(content)

