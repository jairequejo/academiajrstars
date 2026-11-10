# SEO del sitio público — JR Stars

**Última revisión:** 9 de noviembre de 2026.

Sitio estático servido en GitHub Pages: `https://academiajrstars.com/`. La raíz del repositorio es la raíz pública del sitio.

## Qué se hizo (19/10/2026)

- **Metadatos por página:** `title`, `description`, `canonical`, `robots`, Open Graph y Twitter Card en el inicio y en la guía nueva.
- **Datos estructurados JSON-LD:** `SportsOrganization`, `WebSite` y `WebPage` en el inicio; `Article` y `BreadcrumbList` en la guía. Validar el JSON con `python3` o con el validador de Schema.org.
- **Imagen social:** `img/og-jr-stars-1200x630.jpg` (1200×630) para Facebook, WhatsApp y X.
- **Rendimiento de imágenes:** convertí los héroes de PNG (~2 MB) a AVIF y WebP con variantes responsivas. El LCP móvil bajó de **13,2 s a 2,3 s** en Lighthouse (simulado). El escudo del sitio usa `escudo-128.webp`; el estado actual de los iconos se detalla en la revisión del 9/11/2026.
- **Fuentes autohospedadas:** `fonts/bebas-neue-latin.woff2` e `fonts/inter-latin-var.woff2`. Se eliminaron las llamadas a Google Fonts, que bloqueaban el render.
- **Contenido nuevo:** página `guia-academia-futbol-cajamarca/` con criterios para elegir academia, checklist y preguntas frecuentes; se ampliaron las FAQ del inicio y se añadió una sección de criterios.
- **Rastreo:** `robots.txt` con `Sitemap:` y exclusión de paneles privados; `sitemap.xml` con las dos páginas públicas; `llms.txt` para motores de IA.
- **NAP:** nombre, ciudad y teléfono verificados en el pie de ambas páginas.

## Escudo e iconos (03/11/2026)

- Se exportó el escudo oficial transparente desde `Curva.png` (803 × 1050), facilitado por Jair en su carpeta de diseño y conservado en los activos de la guía de marca. Se mantienen sus proporciones y colores, con un margen transparente del 4 % en un lienzo cuadrado; no se añade un disco ni fondo blanco.
- PNG públicos: `img/escudo-192.png` y `img/escudo-512.png`; icono pequeño: `img/favicons/jr-stars-48.png`; Apple: `img/favicons/apple-touch-icon.png` (180 × 180). `favicon.ico` incluye 16, 32, 48, 64, 128 y 256 px. Las variantes WebP y `img/escudo.png` se exportaron con el mismo escudo.
- Inicio y guía declaran los mismos iconos. El `logo` de los datos estructurados apunta al PNG de 512 × 512 y declara sus dimensiones reales.
- Google decide la presentación del resultado. El PNG transparente no elimina un posible contenedor circular del buscador. Tras publicar, el nuevo rastreo puede tardar días o semanas; se puede solicitar la indexación del inicio en Search Console. No se garantiza la fecha ni la aparición del icono.
- Referencia: https://developers.google.com/search/docs/appearance/favicon-in-search

## Revisión 9/11/2026: logo, imagen social y móvil

Diagnóstico verificado en el sitio publicado y en la ficha de Google:

- **El `favicon.ico` no era el escudo.** Contenía el logotipo antiguo (la «R» con estrella y degradado rojo), aunque `img/favicons/jr-stars-48.png` y el icono de Apple ya usaban el escudo. Google y las pestañas podían mostrar el logo viejo. Se regeneró `favicon.ico` con el escudo oficial en 16, 32, 48, 64, 128 y 256 px, fondo azul noche `#06142d`, y se regeneraron `jr-stars-48.png` y `apple-touch-icon.png` con el mismo tratamiento.
- **La imagen al compartir no mostraba la marca.** `img/og-jr-stars-1200x630.jpg` era una foto de un jugador sin escudo ni nombre. Se rehízo a 1200 × 630 con escudo, «JR STARS», «Sangre de Campeón», el texto «Academia de fútbol · Cajamarca» y el teléfono verificado. Fuente editable: `IDENTIDAD_VISUAL/REDES_SOCIALES_2026/og-1200x630.html`.
- **El titular se salía de la pantalla en móvil.** La regla `.hero h1` usaba `20.5vw` con el texto nuevo «ACADEMIA DE FÚTBOL EN CAJAMARCA», más largo que el anterior. Se ajustó a `clamp(2.95rem, 14.2vw, 5rem)` y se comprobó a 360, 390 y 1440 px sin desbordamiento horizontal (`scrollWidth === innerWidth`).
- **Faltaba un manifiesto raíz.** Se añadió `site.webmanifest` con los iconos 192, 512 y una variante *maskable* de 512; inicio y guía lo declaran.
- **Datos estructurados:** el inicio declara `SportsOrganization` + `LocalBusiness`, `WebSite`, `WebPage` y `FAQPage` (preguntas visibles); la guía mantiene `Article` y `BreadcrumbList`. `FAQPage` es marcado válido, pero no se usa como apuesta de resultado enriquecido.
- **Ficha de Google:** la foto principal visible no corresponde al escudo (parece una mascota o disfraz) y no se ve el logotipo del escudo. Archivos correctos listos para subir:
  - Logotipo: `IDENTIDAD_VISUAL/REDES_SOCIALES_2026/PERFIL_GOOGLE_BUSINESS_720.png` (720 × 720).
  - Portada: `IDENTIDAD_VISUAL/REDES_SOCIALES_2026/PORTADA_GOOGLE_BUSINESS_1024x576.png` (también `.jpg`), nueva y sin menores identificables.
- **Caché:** Facebook, WhatsApp, X y Google pueden conservar la imagen anterior. Tras publicar hay que volver a extraer la vista previa en Facebook Sharing Debugger y solicitar indexación en Search Console. WhatsApp no tiene depurador público: suele refrescar al compartir una URL con un parámetro nuevo o al pasar unos días.

## Qué falta para aparecer primero en «academia de fútbol en Cajamarca»

No existe una acción web que garantice el primer lugar. El resultado se decide en tres capas: pack local de Maps, resultados orgánicos y respuestas de IA. Estado observado el 9/11/2026:

- **Marca:** al buscar «academia de futbol jr stars», el sitio aparece después de la página de Facebook de la propia academia. Es normal mientras el dominio es nuevo; no es un error de la web.
- **Genérico:** en una consulta como «academia de fútbol en Cajamarca», en DuckDuckGo los directorios de terceros (localgymsandfitness, findglocal, planetaperu, infoISinfo) ocupan los primeros puestos. Bing no tenía indexado `academiajrstars.com` (`site:` sin resultados), aunque Google sí muestra el sitio para la marca.
- **Ficha local:** 5,0 con 4 reseñas. La categoría visible es «Práctica de fútbol». La portada y el logo deben corregirse en el Panel de Empresa de Google, no en el código.
- **Base técnica:** Lighthouse (9/11/2026) dio SEO 100, accesibilidad 100 y buenas prácticas 100 en el inicio. El bloqueo no es técnico: es de prominencia local, contenido y reseñas.

Prioridad realista:

1. **Corregir la ficha de Google** (logo, portada, categoría principal, servicios, descripción, sitio web ya cargado). Es lo que más mueve el pack local.
2. **Search Console:** verificar propiedad, enviar `sitemap.xml`, pedir indexación del inicio y la guía y revisar consultas reales.
3. **Reseñas éticas:** pedir a todas las familias, sin incentivos ni filtro, y responder en 48 h. Pasar de 4 a 20–30 reseñas en 90 días es más útil que cualquier cambio de título.
4. **Directorios y menciones:** reclamar y homogeneizar NAP en planetaperu.pe, infoISinfo, findglocal, localgymsandfitness y universidadperu; buscar enlaces de colegios, IPD, municipalidad, torneos y prensa local.
5. **Publicar lo verificado:** sedes, horarios y costo cuando dirección los confirme, con páginas por sede o categoría. Sin datos confirmados no se inventan.
6. **Medir:** GBP (impresiones, llamadas, mensajes, cómo llegar), Search Console (impresiones, CTR, posición) y contacto real por WhatsApp. Un clic no es una matrícula.

No se promete posición, tráfico ni matrículas. La mejora se demuestra con el antes/después de Search Console y del perfil, no con una captura aislada.


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

1. **Corregir logo y portada en el Perfil de Empresa de Google.** El sitio web ya aparece en la ficha (verificado 9/11/2026). Queda subir el logotipo y la portada correctos y retirar la foto de mascota que hoy se muestra como imagen principal. Archivos en `IDENTIDAD_VISUAL/REDES_SOCIALES_2026/`.
2. **Verificar el sitio en Google Search Console.** Requiere la cuenta de Google del propietario; se puede verificar con etiqueta HTML, archivo o DNS. Sin esto no se ven consultas, impresiones ni errores de indexación.
3. **Decidir el dominio definitivo.** Si se migra a un dominio propio (por ejemplo `jrstars.pe`), actualizar en los dos HTML: `canonical`, `og:url`, `og:image`, `twitter:image`, `@id` y `url` del JSON-LD; además `sitemap.xml`, `robots.txt` y `llms.txt`.
4. **Publicar sede, horario y costo total reales** cuando dirección los confirme. Hoy no se publican porque siguen por verificar según `AGENTS.md`. Al confirmarlos, conviene abrir páginas por categoría o sede.
5. **Pedir reseñas éticas** a todas las familias, sin incentivos, y responderlas en un plazo definido.
6. **Medir el embudo real**, no clics. El inicio ya emite el evento `jrstars:whatsapp-click` con la ubicación del botón; falta conectarlo a una analítica (Search Console, GA4 o similar) y cruzar los contactos con el registro interno.
7. **Conseguir menciones locales** (colegios, IPD, municipalidad, prensa) para reforzar la prominencia local sin comprar enlaces. Reclamar y homogeneizar el NAP en planetaperu.pe, infoISinfo, findglocal, localgymsandfitness y universidadperu: hoy esos directorios superan al sitio en búsquedas genéricas.

## Reglas que se respetaron

- No se publicaron precios, horarios, sedes, edades ni número de alumnos como hechos: siguen por verificar.
- No se declara superioridad frente a otras academias.
- No se usan imágenes de menores: las del inicio son ilustrativas.
- La guía no promete formación de futbolistas profesionales.

Véase también `AGENTS.md`, `INVESTIGACION/INVESTIGACIONES_2026-10/04-seo-local-google-business.md`, `docs/ACCIONES_GOOGLE_BUSINESS_2026-11-09.md` y `PLAN_ACCION_30_60_90_JR_STARS.md`.
