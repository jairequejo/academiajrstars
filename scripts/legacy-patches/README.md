# Parches históricos (one-off)

Estos scripts ya se aplicaron al código y se conservan solo como historial de los
cambios que hicieron. **No forman parte del flujo de build.**

- `patch_admin.py` — modificó `js/admin.js` (campos de pago: uniforme, primer mes).
- `patch_inscripcion.py` — modificó `js/inscripcion.js` (recálculo del primer mes).

Notas:

- Usan rutas **relativas** (`js/admin.js`, `js/inscripcion.js`), así que si algún día
  se vuelven a ejecutar deben correrse desde la raíz `WEB/academiajrstars/`, no desde
  esta carpeta.
- Fueron reemplazos de texto sobre archivos vivos. Ejecutarlos de nuevo sobre el
  código actual puede no encontrar coincidencias (no son idempotentes ni tienen
  control de versión propio).
- La fuente de verdad es el propio `js/`; este historial es solo referencia.
