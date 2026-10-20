# SEO del sitio público — JR Stars

**Última revisión:** 19 de octubre de 2026.

Sitio estático servido en GitHub Pages: `https://jairequejo.github.io/academiajrstars/`. La raíz del repositorio es la raíz pública del sitio.

## Qué se hizo (19/10/2026)

- **Metadatos por página:** `title`, `description`, `canonical`, `robots`, Open Graph y Twitter Card en el inicio y en la guía nueva.
- **Datos estructurados JSON-LD:** `SportsOrganization`, `WebSite` y `WebPage` en el inicio; `Article` y `BreadcrumbList` en la guía. Validar el JSON con `python3` o con el validador de Schema.org.
- **Imagen social:** `img/og-jr-stars-1200x630.jpg` (1200×630) para Facebook, WhatsApp y X.
- **Rendimiento de imágenes:** convertí los héroes de PNG (~2 MB) a AVIF y WebP con variantes responsivas. El LCP móvil bajó de **13,2 s a 2,3 s** en Lighthouse (simulado). El escudo del sitio usa `escudo-128.webp`; el favicon es `escudo-192.png` + `favicon.ico`.
- **Fuentes autohospedadas:** `fonts/bebas-neue-latin.woff2` e `fonts/inter-latin-var.woff2`. Se eliminaron las llamadas a Google Fonts, que bloqueaban el render.
- **Contenido nuevo:** página `guia-academia-futbol-cajamarca/` con criterios para elegir academia, checklist y preguntas frecuentes; se ampliaron las FAQ del inicio y se añadió una sección de criterios.
- **Rastreo:** `robots.txt` con `Sitemap:` y exclusión de paneles privados; `sitemap.xml` con las dos páginas públicas; `llms.txt` para motores de IA.
- **NAP:** nombre, ciudad y teléfono verificados en el pie de ambas páginas.

## Cómo verificar en local

```sh
python -m http.server 5501 --bind 127.0.0.1
```

- `http://127.0.0.1:5501/` y `http://127.0.0.1:5501/guia-academia-futbol-cajamarca/`
- `http://127.0.0.1:5501/robots.txt` y `http://127.0.0.1:5501/sitemap.xml`

Comprobaciones útiles:

```sh
npx html-validate index.html guia-academia-futbol-cajamarca/index.html
npx lighthouse http://127.0.0.1:5501/ --view
```

## Pendientes (no ejecutados aquí)

1. **Añadir la URL al Perfil de Empresa de Google.** Sigue mostrando «Agregar sitio web». Es la acción de mayor impacto y menor esfuerzo (acción 0.5 del `PLAN_ACCION_30_60_90`).
2. **Verificar el sitio en Google Search Console.** Requiere la cuenta de Google del propietario; se puede verificar con etiqueta HTML, archivo o DNS. Sin esto no se ven consultas, impresiones ni errores de indexación.
3. **Decidir el dominio definitivo.** Si se migra a un dominio propio (por ejemplo `jrstars.pe`), actualizar en los dos HTML: `canonical`, `og:url`, `og:image`, `twitter:image`, `@id` y `url` del JSON-LD; además `sitemap.xml`, `robots.txt` y `llms.txt`.
4. **Publicar sede, horario y costo total reales** cuando dirección los confirme. Hoy no se publican porque siguen por verificar según `AGENTS.md`. Al confirmarlos, conviene abrir páginas por categoría o sede.
5. **Pedir reseñas éticas** a todas las familias, sin incentivos, y responderlas en un plazo definido.
6. **Medir el embudo real**, no clics. El inicio ya emite el evento `jrstars:whatsapp-click` con la ubicación del botón; falta conectarlo a una analítica (Search Console, GA4 o similar) y cruzar los contactos con el registro interno.
7. **Conseguir menciones locales** (colegios, IPD, municipalidad, prensa) para reforzar la prominencia local sin comprar enlaces.

## Reglas que se respetaron

- No se publicaron precios, horarios, sedes, edades ni número de alumnos como hechos: siguen por verificar.
- No se declara superioridad frente a otras academias.
- No se usan imágenes de menores: las del inicio son ilustrativas.
- La guía no promete formación de futbolistas profesionales.

Véase también `AGENTS.md`, `INVESTIGACION/INVESTIGACIONES_2026-10/04-seo-local-google-business.md` y `PLAN_ACCION_30_60_90_JR_STARS.md`.
