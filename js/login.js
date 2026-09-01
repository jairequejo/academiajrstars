// entrenador/login.js — Verificación de acceso del entrenador
// Extraído del <script> inline de login.html

const TOKEN_KEY = 'jr_entrenador_token';

async function init() {
    const urlToken = new URLSearchParams(location.search).get('token');

    // Si llegó un token nuevo en la URL, guardarlo y limpiar la URL
    if (urlToken) {
        localStorage.setItem(TOKEN_KEY, urlToken);
        history.replaceState({}, '', '/entrenador/login.html');
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return showNoAccess();

    // Verificar el token consultando a Supabase
    try {
        const { data, error } = await window.supabaseClient
            .from('entrenadores')
            .select('nombre, is_active')
            .eq('token', token)
            .single();

        if (error || !data || !data.is_active) {
            // Token inválido o revocado
            localStorage.removeItem(TOKEN_KEY);
            return showNoAccess();
        }

        // Acceso permitido
        sessionStorage.setItem('jr_nombre', data.nombre || '');
        document.getElementById('status-msg').textContent = `¡Hola, ${data.nombre}! Abriendo scanner...`;
        setTimeout(() => { window.location.href = '/entrenador/index.html'; }, 600);
        
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
