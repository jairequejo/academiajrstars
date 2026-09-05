# Arquitectura del frontend

JR Stars es un sitio estático multipágina. Cada carpeta pública representa un módulo y comparte los recursos de `css/`, `js/` e `img/` mediante rutas absolutas desde la raíz.

## Módulos

| Módulo | Entrada | Estilos principales | Lógica principal |
| --- | --- | --- | --- |
| Landing | `/index.html` | `css/landing-effects.css` | JavaScript integrado en la página |
| Administración | `/admin/index.html` | `css/admin*.css`, `css/inscripcion.css`, `css/alumno-ficha.css` | `js/admin*.js`, `js/inscripcion.js`, `js/alumno-ficha.js` |
| Entrenador | `/entrenador/index.html` | `css/entrenador.css` | `js/entrenador.js`, `js/sync-worker.js` |
| Caja | `/caja/index.html` | `css/caja.css` | `js/caja.js` |
| Portal | `/portal/index.html` | `css/portal.css` | `js/home.js` |
| Scanner | `/scanner/index.html` | `css/style.css` | `js/scanner.js` |

## Convenciones

- Mantener el HTML de entrada dentro de la carpeta de su módulo.
- Mantener CSS y JavaScript reutilizable en las carpetas globales `css/` y `js/`.
- Centralizar los iconos de navegador de cada módulo en `img/favicons/`.
- Usar rutas públicas absolutas (`/css/...`, `/js/...`, `/img/...`) en las PWA y rutas relativas solo cuando el módulo existente ya dependa de ellas.
- Usar `?v=AAAAMMDD` para invalidar caché después de cambios en recursos estáticos.
- No duplicar una hoja de estilos para experimentar. Los cambios definitivos deben integrarse en la hoja activa del módulo.
- No guardar secretos de servidor en el frontend. Solo se admite la clave pública `anon` de Supabase; la seguridad debe reforzarse con RLS.
- Versionar migraciones SQL en `migrations/` y documentar que deben aplicarse manualmente.
- Mantener scripts de mantenimiento fuera de la raíz pública, dentro de `scripts/`, y leer sus credenciales desde variables de entorno.

## PWA y caché

Los service workers viven dentro de su módulo para limitar su alcance. Cuando cambie el contenido del shell de una PWA, debe actualizarse tanto la lista de recursos como el nombre de la caché. El worker de sincronización del entrenador se comparte desde `/js/sync-worker.js` y no debe confundirse con su service worker. Los iconos propios de esta PWA viven en `entrenador/icons/`.

## Criterio para nuevos archivos

Antes de añadir un archivo, define qué módulo lo consume. Si ningún HTML, JavaScript, manifiesto o service worker lo referencia, debe considerarse documentación, recurso de reserva claramente identificado o código muerto que no pertenece al commit.
