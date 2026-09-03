# JR Stars — Frontend

Sitio y paneles de la academia JR Stars, desarrollados con HTML, CSS y JavaScript. La carpeta `academiajrstars` es la raíz del repositorio y del sitio: no requiere compilación ni instalación de paquetes para servir las páginas.

## Desarrollo local

Abre esta carpeta con Live Server (puerto configurado: `5501`) o ejecuta desde ella:

```sh
python -m http.server 5501 --bind 127.0.0.1
```

En Windows también puedes usar `py -m http.server 5501 --bind 127.0.0.1`.

Abre `http://127.0.0.1:5501/`. Utiliza HTTP; los iconos SVG y algunas funciones del navegador no funcionan al abrir el HTML con `file://`.

## Páginas

| Ruta | Uso |
| --- | --- |
| `/` | Landing de la academia |
| `/admin/` | Administración de alumnos, inscripciones, pagos y asistencia |
| `/admin/login.html` | Acceso de administración |
| `/entrenador/` | Panel del entrenador |
| `/caja/` | Caja |
| `/portal/` | Portal del alumno |
| `/scanner/` | Lectura de credenciales |

## Archivos principales

- `css/`: estilos del sitio y de cada panel.
- `js/`: lógica de interfaz e integración con Supabase.
- `img/`: recursos visuales, incluido `admin-icons.svg`, el conjunto local de iconos del admin.
- `admin/icons/` y `admin/manifest.webmanifest`: iconos de instalación y configuración de la aplicación de administración.

`js/supabaseClient.js` contiene la URL y la clave pública del proyecto Supabase. La autorización de datos depende de las políticas del servicio. No se deben incluir claves privadas o `service_role` en el frontend.

Los scripts `seed.mjs` y `transform.js` son utilidades de mantenimiento existentes; no forman parte del arranque del sitio. `seed.mjs` escribe datos de prueba en Supabase.

La ficha consulta la fecha de registro de `students.created_at` y cuenta días distintos de asistencia en `attendance.created_at`, según la zona horaria de Perú. Un día con varios escaneos cuenta una sola vez. Si falla la consulta, se muestra que la asistencia no está disponible.

`migrations/20260903_datos_alumno.sql` prepara los campos de nacimiento, apoderado, grupo, categoría, tarifa y código del alumno que faltan en el esquema actual. Debe aplicarse en el SQL Editor de Supabase para guardar esos campos; añadir el archivo al repositorio no ejecuta la migración. Mientras no haya datos, la ficha muestra «Sin registrar».

## Publicación

Configura el alojamiento estático para servir esta carpeta como raíz y conservar las rutas de sus subdirectorios. Los paneles requieren acceso al proyecto Supabase configurado; algunas páginas cargan fuentes y bibliotecas por CDN.

Antes del commit, revisa `git status` y `git diff --check`. El destino del push se configura con el remoto del repositorio elegido.
