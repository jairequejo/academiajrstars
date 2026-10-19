# Seguridad del proyecto

## Antes del próximo despliegue

1. Ejecuta `migrations/20260905_security_hardening.sql` en Supabase SQL Editor.
2. Registra explícitamente el usuario administrador (reemplaza el correo):

   ```sql
   insert into private.admin_users (user_id)
   select id from auth.users where email = 'ADMIN@EJEMPLO.COM'
   on conflict (user_id) do nothing;
   ```

3. Desde SQL Editor configura un PIN nuevo de caja de seis dígitos. Cambia `v_pin` antes de ejecutar; el bloque se niega a guardar el valor de ejemplo:

   ```sql
   do $$
   declare
     v_pin text := 'CAMBIAR';
   begin
     if v_pin !~ '^[0-9]{6}$' then
       raise exception 'Reemplaza v_pin por seis dígitos';
     end if;
     insert into private.app_secrets (name, secret_hash, updated_at)
     values ('caja_pin', crypt(v_pin, gen_salt('bf', 12)), now())
     on conflict (name) do update
     set secret_hash = excluded.secret_hash,
         updated_at = excluded.updated_at;
   end;
   $$;
   ```

4. Rota todos los enlaces de entrenador desde el panel. Los tokens estuvieron expuestos por permisos anónimos y deben considerarse comprometidos.
5. Rota cualquier QR con formato `JRS:`. La versión anterior se firmaba con una clave embebida en el navegador. Los nuevos códigos `STU-` son identificadores aleatorios opacos.

## Estado del riesgo de acceso anónimo (actualizado 18/10/2026)

Se implementó la corrección. Las tablas `students`, `credentials`, `attendance`, `biometria`, `mensualidades` y `sedes` quedan con RLS activo y **sin acceso directo para `anon`**; el portal público, el entrenador y el scanner pasan a usar funciones `SECURITY DEFINER` estrechas.

Orden de despliegue (no alterar):

1. Ejecuta `migrations/20261018_fix_admin_registration.sql` (corrige el fallo C4: la migración `20260915` había registrado como administrador a **toda** cuenta `auth.users`). Cambia el correo antes de correrla.
2. Publica el frontend con el JS adaptado (`home.js`, `entrenador.js`, `scanner.js` llaman a `portal_lookup`, `portal_ranking`, `entrenador_lookup`, `entrenador_asistencia_hoy`, `entrenador_marcar_asistencia`, `entrenador_guardar_biometria`). Se subió el cache-buster a `?v=20261018_rpc` en `portal/index.html` y `entrenador/index.html`; `scanner` ya usa `?_=Date.now()`.
3. Ejecuta `migrations/20261018_lockdown_anon_rls.sql` para activar RLS y revocar `anon`.
4. Ejecuta `scripts/audit-supabase.sql` y revisa que `anon` no conserve privilegios en esas tablas.

Si se ejecuta el paso 3 **sin** haber publicado el paso 2, el portal y el scanner fallarán hasta que el nuevo JS esté en línea.

### Riesgo residual honesto

- El portal sigue permitiendo buscar por **DNI**. Quien conozca o adivine un DNI puede ver nombre, categoría y biometría de ese alumno. Es mucho menos grave que la lectura masiva anterior, pero para producción conviene exigir el **código del medallón** (`JRS:...`) en lugar del DNI, y añadir límite de intentos.
- Caja y Scanner comparten llave pública. Un PIN o un token por sí solos no sustituyen identidad fuerte: la siguiente etapa es autenticarlos como dispositivo o usuario real en una Edge Function con rate limiting y auditoría.

Ejecuta `scripts/audit-supabase.sql` después de cada migración para revisar RLS, políticas, permisos de tablas y permisos de funciones sin leer datos personales.

## Reglas para llaves

- La llave `anon`/publishable puede estar en el frontend únicamente con RLS y privilegios mínimos.
- `service_role`, `sb_secret_...`, contraseñas, PIN y llaves de firma nunca deben entrar en HTML/JS ni en Git.
- Si una llave privada entra a Git, eliminarla del último commit no basta: hay que rotarla y luego limpiar el historial si corresponde.
