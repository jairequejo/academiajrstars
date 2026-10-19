-- ═══════════════════════════════════════════════════════════════════════════
-- CIERRE DEFINITIVO DEL RIESGO C1/C2: revocar el acceso anónimo directo a las
-- tablas con datos de menores y mover el portal y el scanner a funciones
-- SECURITY DEFINER estrechas.
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ CAMBIA
--   · students, credentials, attendance, biometria, mensualidades y sedes dejan
--     de ser legibles/escribibles por el rol `anon`.
--   · El panel admin (rol `authenticated` + private.is_admin()) conserva acceso.
--   · El portal público y el scanner/entrenador siguen funcionando, pero a
--     través de estas funciones, que devuelven SOLO lo que cada flujo necesita.
--
-- ORDEN DE DESPLIEGUE (importante)
--   1. Ejecuta esta migración en Supabase → SQL Editor.
--   2. Publica el frontend ya adaptado (home.js, entrenador.js, scanner.js usan
--      las RPC). Si ejecutas la migración sin publicar el frontend, el portal y
--      el scanner fallarán hasta que el nuevo JS esté en línea.
--   3. Ejecuta `scripts/audit-supabase.sql` para confirmar que anon ya no lee.
--
-- Es idempotente: se puede volver a ejecutar.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPERS INTERNOS (esquema private, no expuestos a anon)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function private.entrenador_id_from_token(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.id::text
  from public.entrenadores e
  where e.is_active is true
    and p_token is not null
    and length(p_token) >= 20
    and e.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  limit 1;
$$;
revoke all on function private.entrenador_id_from_token(text) from public, anon, authenticated;

-- Resuelve un código/UUID/DNI parcial al alumno y su credencial.
create or replace function private.resolve_credential(p_code text)
returns table (student_id uuid, credential_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_code is null or length(btrim(p_code)) = 0 then
    return;
  end if;

  if p_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return query
      select s.id, null::uuid
      from public.students s
      where s.id = p_code::uuid
      limit 1;
    if found then return; end if;
  end if;

  if p_code ~* '^[0-9a-f]{8}$' then
    return query
      select s.id, null::uuid
      from public.students s
      where s.id::text ilike (p_code || '%')
      limit 1;
    if found then return; end if;
  end if;

  if p_code like 'JRS:%' then
    return query
      select c.student_id, c.id
      from public.credentials c
      where c.is_active is true
        and c.code like ('JRS:' || split_part(p_code, ':', 2) || ':%')
      limit 1;
    if found then return; end if;
  end if;

  return query
    select c.student_id, c.id
    from public.credentials c
    where c.is_active is true
      and c.code = p_code
    limit 1;
end;
$$;
revoke all on function private.resolve_credential(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PORTAL PÚBLICO (padres): una sola consulta, sólo el alumno buscado
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.portal_lookup(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sid uuid;
  v_student jsonb;
  v_att jsonb;
  v_bio jsonb;
begin
  if p_query is null or length(btrim(p_query)) < 8 then
    return jsonb_build_object('found', false);
  end if;

  select c.student_id into v_sid
  from public.credentials c
  where c.is_active is true and c.code = p_query
  limit 1;

  if v_sid is null and p_query like 'JRS:%' then
    select c.student_id into v_sid
    from public.credentials c
    where c.is_active is true
      and c.code like ('JRS:' || split_part(p_query, ':', 2) || ':%')
    limit 1;
  end if;

  if v_sid is null then
    if p_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select s.id into v_sid
      from public.students s
      where s.id = p_query::uuid and s.is_active is true
      limit 1;
    else
      select s.id into v_sid
      from public.students s
      where s.dni = p_query and s.is_active is true
      limit 1;
    end if;
  end if;

  if v_sid is null then
    return jsonb_build_object('found', false);
  end if;

  select jsonb_build_object(
    'id', s.id,
    'full_name', s.full_name,
    'valid_until', s.valid_until,
    'horario', s.horario,
    'sede', s.sede,
    'batido_credits', coalesce(s.batido_credits, 0),
    'grupo', s.grupo,
    'categoria', s.categoria,
    'turno', s.turno,
    'is_active', s.is_active
  ) into v_student
  from public.students s
  where s.id = v_sid and s.is_active is true;

  if v_student is null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('created_at', a.created_at) order by a.created_at desc),
    '[]'::jsonb
  )
  into v_att
  from public.attendance a
  where a.student_id = v_sid
    and a.created_at >= date_trunc('year', now());

  -- Se devuelve la fila completa en jsonb (menos id y student_id) para no
  -- depender de columnas de medición que puedan variar entre entornos.
  select coalesce(
    jsonb_agg((to_jsonb(b) - 'id' - 'student_id') order by b.created_at desc),
    '[]'::jsonb
  )
  into v_bio
  from (
    select *
    from public.biometria
    where student_id = v_sid
    order by created_at desc
    limit 12
  ) b;

  return jsonb_build_object(
    'found', true,
    'student', v_student,
    'attendance', v_att,
    'biometria', v_bio
  );
end;
$$;

-- Ranking público: sólo el top 5, con el nombre enmascarado (nombre + inicial).
create or replace function public.portal_ranking()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with counts as (
    select a.student_id, count(*)::int as score
    from public.attendance a
    join public.students s on s.id = a.student_id and s.is_active is true
    group by a.student_id
    order by score desc
    limit 5
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_id', c.student_id,
        'name', case
          when s.full_name is null or btrim(s.full_name) = '' then c.student_id::text
          else split_part(btrim(s.full_name), ' ', 1) ||
               case
                 when array_length(string_to_array(btrim(s.full_name), ' '), 1) > 1
                 then ' ' || left(split_part(btrim(s.full_name), ' ', 2), 1) || '.'
                 else ''
               end
        end,
        'score', c.score
      )
      order by c.score desc
    ),
    '[]'::jsonb
  )
  from counts c
  left join public.students s on s.id = c.student_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SCANNER / ENTRENADOR (token): resolver alumno, marcar asistencia, guardar ficha
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.entrenador_lookup(p_token text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entrenador text;
  v_sid uuid;
  v_cid uuid;
  v_student jsonb;
begin
  v_entrenador := private.entrenador_id_from_token(p_token);
  if v_entrenador is null then
    raise exception 'Token de entrenador inválido' using errcode = '42501';
  end if;

  if p_code is null or length(btrim(p_code)) = 0 then
    return jsonb_build_object('found', false);
  end if;

  select r.student_id, r.credential_id into v_sid, v_cid
  from private.resolve_credential(btrim(p_code)) r
  limit 1;

  if v_sid is null then
    return jsonb_build_object('found', false);
  end if;

  select jsonb_build_object(
    'id', s.id,
    'full_name', s.full_name,
    'valid_until', s.valid_until,
    'is_active', s.is_active
  ) into v_student
  from public.students s
  where s.id = v_sid;

  return jsonb_build_object(
    'found', true,
    'student', v_student,
    'credential_id', v_cid
  );
end;
$$;

create or replace function public.entrenador_asistencia_hoy(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entrenador text;
  v_result jsonb;
begin
  v_entrenador := private.entrenador_id_from_token(p_token);
  if v_entrenador is null then
    raise exception 'Token de entrenador inválido' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'full_name', s.full_name,
        'first_names', s.first_names,
        'last_names', s.last_names,
        'codigo_legacy', s.codigo_legacy,
        'dni', s.dni,
        'horario', s.horario,
        'sede', s.sede,
        'grupo', s.grupo,
        'valid_until', s.valid_until,
        'present', (a.created_at is not null),
        'time', a.created_at
      ) order by s.full_name
    ),
    '[]'::jsonb
  )
  into v_result
  from public.students s
  left join lateral (
    select att.created_at
    from public.attendance att
    where att.student_id = s.id
      and att.created_at >= date_trunc('day', now())
    order by att.created_at desc
    limit 1
  ) a on true
  where s.is_active is true;

  return v_result;
end;
$$;

create or replace function public.entrenador_marcar_asistencia(
  p_token text,
  p_student_id uuid,
  p_credential_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entrenador text;
  v_exists boolean;
begin
  v_entrenador := private.entrenador_id_from_token(p_token);
  if v_entrenador is null then
    raise exception 'Token de entrenador inválido' using errcode = '42501';
  end if;

  if p_student_id is null then
    raise exception 'Alumno requerido' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.attendance a
    where a.student_id = p_student_id
      and a.created_at >= date_trunc('day', now())
  ) into v_exists;

  if v_exists then
    return jsonb_build_object('status', 'duplicado');
  end if;

  insert into public.attendance (student_id, credential_id, created_at, source)
  values (p_student_id, p_credential_id, now(), 'scanner');

  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.entrenador_guardar_biometria(
  p_token text,
  p_student_id uuid,
  p_talla numeric default null,
  p_peso numeric default null,
  p_sprint numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entrenador text;
begin
  v_entrenador := private.entrenador_id_from_token(p_token);
  if v_entrenador is null then
    raise exception 'Token de entrenador inválido' using errcode = '42501';
  end if;

  if p_student_id is null then
    raise exception 'Alumno requerido' using errcode = '22023';
  end if;

  insert into public.biometria (student_id, talla, peso, tiempo_sprint)
  values (p_student_id, p_talla, p_peso, p_sprint);

  return jsonb_build_object('status', 'ok');
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PERMISOS DE LAS FUNCIONES PÚBLICAS
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.portal_lookup(text) from public;
revoke all on function public.portal_ranking() from public;
revoke all on function public.entrenador_lookup(text, text) from public;
revoke all on function public.entrenador_asistencia_hoy(text) from public;
revoke all on function public.entrenador_marcar_asistencia(text, uuid, uuid) from public;
revoke all on function public.entrenador_guardar_biometria(text, uuid, numeric, numeric, numeric) from public;

grant execute on function public.portal_lookup(text) to anon, authenticated;
grant execute on function public.portal_ranking() to anon, authenticated;
grant execute on function public.entrenador_lookup(text, text) to anon, authenticated;
grant execute on function public.entrenador_asistencia_hoy(text) to anon, authenticated;
grant execute on function public.entrenador_marcar_asistencia(text, uuid, uuid) to anon, authenticated;
grant execute on function public.entrenador_guardar_biometria(text, uuid, numeric, numeric, numeric) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUEO DE LAS TABLAS
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_table text;
  v_tables text[] := array[
    'students', 'credentials', 'attendance', 'biometria', 'mensualidades', 'sedes'
  ];
begin
  foreach v_table in array v_tables loop
    -- Sólo si la tabla existe (mensualidades/sedes podrían no existir en algún entorno).
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_table
    ) then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('revoke all on table public.%I from anon', v_table);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', v_table);

      -- El panel admin (authenticated + is_admin()) conserva acceso completo.
      execute format('drop policy if exists %I on public.%I', v_table || '_admin_all', v_table);
      execute format(
        'create policy %I on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())',
        v_table || '_admin_all', v_table
      );
    end if;
  end loop;
end;
$$;

commit;

-- ── Verificación posterior ───────────────────────────────────────────────────
-- Debe devolver 0 filas para anon en estas tablas:
--   select table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee = 'anon'
--     and table_name in ('students','credentials','attendance','biometria','mensualidades','sedes');
--
-- Prueba funcional del portal (debe devolver el alumno, sin listar a nadie más):
--   select public.portal_lookup('JRS:XXXX:YYYY');
