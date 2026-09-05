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

## Riesgo pendiente antes de producción

El portal público, el PWA de entrenador y el scanner todavía hacen consultas directas con el rol `anon` a `students`, `credentials`, `attendance` y `biometria`. No publiques datos reales mientras esas tablas permitan lecturas/escrituras anónimas.

La corrección definitiva es mover esas operaciones a funciones SQL o Edge Functions estrechas que validen la identidad del padre/entrenador/scanner, habilitar RLS en todas las tablas expuestas y revocar el acceso directo de `anon`. El frontend no puede convertir una llave pública en un secreto.

La función de PIN incluida evita que la interfaz de Caja y el canje nuevo funcionen sin PIN, pero un PIN por sí solo no sustituye identidad, rate limiting ni auditoría. Para producción, Caja y Scanner deben autenticarse como dispositivos o usuarios reales en una Edge Function.

Ejecuta `scripts/audit-supabase.sql` después de cada migración para revisar RLS, políticas, permisos de tablas y permisos de funciones sin leer datos personales.

## Reglas para llaves

- La llave `anon`/publishable puede estar en el frontend únicamente con RLS y privilegios mínimos.
- `service_role`, `sb_secret_...`, contraseñas, PIN y llaves de firma nunca deben entrar en HTML/JS ni en Git.
- El script `scripts/seed.mjs` usa `SUPABASE_SERVICE_ROLE_KEY` solo desde un `.env` local ignorado por Git.
- Si una llave privada entra a Git, eliminarla del último commit no basta: hay que rotarla y luego limpiar el historial si corresponde.
