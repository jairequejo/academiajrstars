-- ═══════════════════════════════════════════════════════════════════════════
-- CORRECCIÓN URGENTE (C4): privilegios de administrador regalados a toda cuenta
-- ═══════════════════════════════════════════════════════════════════════════
-- La migración 20260915_uniform_orders.sql ejecutó:
--     insert into private.admin_users (user_id) select id from auth.users;
-- Eso registró como ADMIN a TODOS los usuarios de auth.users del proyecto.
-- Consecuencia: cualquier cuenta con sesión tenía panel administrativo completo
-- (leer/editar alumnos, pagos, asistencias y biometría de menores).
--
-- Esta migración es SEGURA y NO rompe el portal público ni el scanner:
-- solo limpia la tabla de administradores y vuelve a exigir registro explícito.
--
-- ANTES DE EJECUTAR: reemplaza 'ADMIN@EJEMPLO.COM' por el correo real del
-- único administrador de JR Stars. Sin ese cambio, el panel queda sin ningún
-- administrador (estado seguro, pero bloquea el acceso hasta registrarlo).
--
-- Ejecutar en Supabase → SQL Editor. Es idempotente: se puede correr varias veces.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1. Barre el registro automático: nadie es administrador por existir en auth.users.
delete from private.admin_users;

-- 2. Registro explícito y único del administrador.
do $$
declare
  v_email text := 'ADMIN@EJEMPLO.COM';   -- ← reemplazar por el correo real
  v_count integer;
begin
  if lower(trim(v_email)) = 'admin@ejemplo.com' then
    raise notice 'Aviso: edita v_email con el correo real y vuelve a ejecutar. No se registró ningún administrador todavía.';
    return;
  end if;

  insert into private.admin_users (user_id)
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(v_email))
  on conflict (user_id) do nothing;

  select count(*) into v_count from private.admin_users;
  if v_count = 0 then
    raise notice 'No se encontró una cuenta con el correo %. Verifica el correo en Authentication → Users.', v_email;
  else
    raise notice 'Administradores registrados ahora: %', v_count;
  end if;
end;
$$;

commit;

-- ── Verificación posterior (ejecutar aparte, como administrador logueado) ─────
-- Debe devolver exactamente los administradores que quieres, y nada más:
--
--   select au.user_id, u.email
--   from private.admin_users au
--   left join auth.users u on u.id = au.user_id;
--
-- Alternativa manual (si el bloque DO no encuentra la cuenta), desde el SQL Editor:
--   insert into private.admin_users (user_id)
--   select id from auth.users where email = 'correo-real@dominio.com'
--   on conflict (user_id) do nothing;
