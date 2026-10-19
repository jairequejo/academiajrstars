import re

with open('js/inscripcion.js', 'r', encoding='utf-8') as f:
    content = f.read()

# I want to add an event listener to `a-fecha-inicio` to recalculate `a-pago-primer`.
# The logic: 
# Let month_days = days in current month.
# Let remaining = month_days - start_date.getDate() + 1
# Proportion = remaining / month_days
# primer = 80 * Proportion

new_logic = """
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
"""

# Insert this before "function setMessage(text = '') {"
content = content.replace("function setMessage(text = '') {", new_logic + "\n  function setMessage(text = '') {")

with open('js/inscripcion.js', 'w', encoding='utf-8') as f:
    f.write(content)

