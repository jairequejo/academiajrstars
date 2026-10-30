// entrenador/login.js — Verificación de acceso del entrenador
// Extraído del <script> inline de login.html

const TOKEN_KEY = 'jr_entrenador_token';
const NAME_KEY = 'jr_entrenador_nombre';

// ── PWA: registrar y mantener actualizado el service worker ────────────────
if ('serviceWorker' in navigator) {
    let recargandoPorVersion = false;

    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
        .then(reg => {
            reg.update().catch(() => {});

            reg.addEventListener('updatefound', () => {
                const nuevo = reg.installing;
                if (!nuevo) return;
                nuevo.addEventListener('statechange', () => {
                    if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
                        nuevo.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') reg.update().catch(() => {});
            });
        })
        .catch(error => {
            console.warn('PWA entrenador no disponible:', error.message);
        });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recargandoPorVersion) return;
        recargandoPorVersion = true;
        if (document.visibilityState === 'visible') location.reload();
    });
}

// Entrada sin conexión: el profe ya validó su acceso antes en este dispositivo.
// Se permite entrar para que pueda seguir registrando asistencia en cola; la
// validación real se repite en cuanto vuelve la red.
function entrarSinConexion(nombre) {
    sessionStorage.setItem('jr_nombre', nombre || '');
    const msg = document.getElementById('status-msg');
    if (msg) msg.textContent = 'Sin conexión. Entrando con el acceso guardado…';
    setTimeout(() => { window.location.href = './index.html'; }, 600);
}

async function init() {
    const hashToken = new URLSearchParams(location.hash.slice(1)).get('token');
    const legacyQueryToken = new URLSearchParams(location.search).get('token');
    const urlToken = hashToken || legacyQueryToken;

    // Si llegó un token nuevo en la URL, guardarlo y limpiar la URL
    if (urlToken) {
        localStorage.setItem(TOKEN_KEY, urlToken);
        history.replaceState({}, '', './login.html');
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return showNoAccess();

    const nombreGuardado = localStorage.getItem(NAME_KEY) || '';

    // Sin red no se puede verificar: se usa el acceso ya guardado.
    if (navigator.onLine === false) {
        return entrarSinConexion(nombreGuardado);
    }

    // La función SQL compara el hash; la tabla y los tokens no quedan expuestos al navegador.
    try {
        const { data, error } = await window.supabaseClient.rpc('verify_entrenador_access', {
            p_token: token
        });

        if (error) throw error;

        if (!data?.valid) {
            // Token inválido o revocado
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(NAME_KEY);
            return showNoAccess();
        }

        // Acceso permitido
        sessionStorage.setItem('jr_nombre', data.nombre || '');
        localStorage.setItem(NAME_KEY, data.nombre || '');
        document.getElementById('status-msg').textContent = `¡Hola, ${data.nombre}! Abriendo scanner...`;
        setTimeout(() => { window.location.href = './index.html'; }, 600);

    } catch (e) {
        console.error(e);
        // Falla de red con acceso ya guardado: dejar trabajar y reintentar luego.
        if (nombreGuardado) return entrarSinConexion(nombreGuardado);

        document.getElementById('status-msg').textContent = 'Sin conexión. Reintenta en un momento.';
        document.getElementById('status-msg').classList.add('error');
        document.getElementById('spinner').style.display = 'none';
    }
}

function showNoAccess() {
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('status-msg').style.display = 'none';
    document.getElementById('no-access').style.display = 'block';
}

// Ejecutar al cargar la página
init();
