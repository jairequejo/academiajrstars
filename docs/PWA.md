# PWA: actualización, modo offline y notificaciones

Estado verificado el 29/10/2026 sobre las tres apps instalables: `entrenador/`,
`scanner/` y `admin/`.

## Cómo se actualiza

1. Cada app registra su propio service worker con `updateViaCache: 'none'`.
2. Al cargar, y cada 5 minutos, se llama a `registration.update()`.
3. Si aparece una versión nueva, se envía `SKIP_WAITING` y la página se recarga
   una sola vez (`controllerchange`, con bandera para no entrar en bucle).
4. Cada service worker borra **solo sus** cachés (prefijo propio). Antes, el del
   scanner borraba los cachés del entrenador y del admin en el mismo dispositivo.

### Para publicar una versión nueva

Sube estos valores a la vez; si se olvida uno, el cliente puede quedar con
mezcla de versiones:

| Archivo | Qué cambiar |
|---|---|
| `entrenador/sw.js` | `SW_VERSION` |
| `scanner/sw.js` | `SW_VERSION` |
| `admin/sw.js` | `ADMIN_VERSION` |
| `entrenador/index.html` | `../js/entrenador.js?v=...` |
| `entrenador/login.html` | `../js/login.js?v=...` |
| `scanner/index.html` | `../js/scanner.js?v=...` |

## Modo offline

- El shell (HTML, CSS, JS, iconos, librerías) se precarga en la instalación.
- Sólo se guardan respuestas `2xx`. Antes se guardaba cualquier respuesta,
  incluido un `502`, y la app quedaba servida con una página de error hasta
  limpiar el caché. Ese era el origen de la "desactualización".
- Navegación: red primero, caché como respaldo.
- Scripts, estilos, imágenes y fuentes: caché primero con revalidación en
  segundo plano, para que el arranque sin red sea inmediato.
- Si `navigator.onLine` es `false`, se sirve de caché sin esperar timeout.
- Las librerías de terceros ya no se cargan desde CDN: están en `js/lib/`
  (`supabase-2.115.0.js`, `html5-qrcode-2.3.8.min.js`). Con CDN, un arranque
  sin red dejaba `supabase` sin definir.
- El login del entrenador permite entrar sin conexión si ya hay un acceso
  guardado en el dispositivo; la validación se repite al volver la red.

## Notificaciones

Lo que existe hoy:

- `admin/sw.js`, `entrenador/sw.js` y `scanner/sw.js` tienen handler `push` y
  `notificationclick`: si llega una notificación del servidor, se muestra.
- El panel de admin muestra notificaciones **locales** mientras la pestaña está
  abierta (permiso + `registration.showNotification`).

Lo que falta para que lleguen con la app cerrada:

1. Generar claves VAPID (`npx web-push generate-vapid-keys`).
2. Guardar la suscripción del dispositivo (`pushManager.subscribe`) y enviarla a
   una tabla de Supabase.
3. Una Edge Function que firme y envíe el push cuando ocurra el evento
   (pago por vencer, asistencia pendiente, aviso del entrenador).
4. Guardar la clave pública VAPID en la configuración del frontend.

Sin esos cuatro pasos, ninguna notificación puede llegar con la app cerrada:
no es un ajuste de CSS, es infraestructura de envío.

## Pendiente detectado (no resuelto aquí)

- `js/scanner.js` envía la cola offline a `/attendance/sync-batch`, una ruta que
  no existe en GitHub Pages. El registro offline se guarda en el dispositivo,
  pero no se sincroniza por esa vía. Debe pasar por las RPC de Supabase
  (`entrenador_marcar_asistencia`), que además aún no están creadas en
  producción.
