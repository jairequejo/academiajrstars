# JR Stars — Plataforma web

Sitio público y paneles operativos de la academia JR Stars, desarrollados con HTML, CSS y JavaScript. La raíz del repositorio también es la raíz pública del sitio; no requiere compilación ni instalación de paquetes para ejecutarse.

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
| `/entrenador/` | PWA del entrenador: escaneo, asistencia y biometría |
| `/entrenador/login.html` | Acceso del entrenador |
| `/caja/` | Caja |
| `/portal/` | Consulta del jugador mediante DNI o QR |
| `/scanner/` | Lectura de credenciales |

## Estructura

- `admin/`, `entrenador/`, `caja/`, `portal/`, `scanner/`: entradas de cada módulo.
- `css/`: estilos compartidos y hojas específicas por módulo.
- `js/`: interfaz, acceso a Supabase y workers compartidos.
- `img/`: identidad y recursos visuales; los iconos de navegador viven en `img/favicons/`.
- `migrations/`: cambios SQL versionados para Supabase.
- `scripts/`: utilidades manuales de mantenimiento y datos de prueba.
- `docs/`: documentación técnica y convenciones del repositorio.

`js/supabaseClient.js` contiene la URL y la clave pública del proyecto Supabase. La autorización de datos depende de las políticas del servicio. No se deben incluir claves privadas o `service_role` en el frontend.

`scripts/seed.mjs` es una utilidad manual que escribe datos de prueba en Supabase; no forma parte del arranque del sitio y no debe ejecutarse contra producción. Sus variables requeridas se documentan en `.env.example`.

La ficha consulta la fecha de registro de `students.created_at` y cuenta días distintos de asistencia en `attendance.created_at`, según la zona horaria de Perú. Un día con varios escaneos cuenta una sola vez. Si falla la consulta, se muestra que la asistencia no está disponible.

`migrations/20260903_datos_alumno.sql` prepara los campos de nacimiento, apoderado, grupo, categoría, tarifa y código del alumno que faltan en el esquema actual. Debe aplicarse en el SQL Editor de Supabase para guardar esos campos; añadir el archivo al repositorio no ejecuta la migración. Mientras no haya datos, la ficha muestra «Sin registrar».

## Publicación

Configura el alojamiento estático para servir esta carpeta como raíz y conservar las rutas de sus subdirectorios. Los paneles requieren acceso al proyecto Supabase configurado; algunas páginas cargan fuentes y bibliotecas por CDN.

## Verificación antes de un commit

```sh
git diff --check
git status --short
```

Además, comprueba las rutas principales con un servidor local y valida la sintaxis de los archivos JavaScript modificados con `node --check`. Consulta [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) antes de añadir un módulo o un recurso global.
