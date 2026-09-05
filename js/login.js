// entrenador/login.js — Verificación de acceso del entrenador
// Extraído del <script> inline de login.html

const TOKEN_KEY = 'jr_entrenador_token';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(error => {
        console.warn('PWA entrenador no disponible:', error.message);
    });
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

    // La función SQL compara el hash; la tabla y los tokens no quedan expuestos al navegador.
    try {
        const { data, error } = await window.supabaseClient.rpc('verify_entrenador_access', {
            p_token: token
        });

        if (error || !data?.valid) {
            // Token inválido o revocado
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem('jr_entrenador_nombre');
            return showNoAccess();
        }

        // Acceso permitido
        sessionStorage.setItem('jr_nombre', data.nombre || '');
        localStorage.setItem('jr_entrenador_nombre', data.nombre || '');
        document.getElementById('status-msg').textContent = `¡Hola, ${data.nombre}! Abriendo scanner...`;
        setTimeout(() => { window.location.href = './index.html'; }, 600);
        
    } catch (e) {
        // Sin conexión o error
        console.error(e);
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
