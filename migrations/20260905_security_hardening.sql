-- Endurecimiento de accesos de entrenador y caja.
-- Ejecutar desde Supabase SQL Editor antes de desplegar el frontend de este commit.
begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on table private.admin_users from public, anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.admin_users au
    where au.user_id = auth.uid()
  );
$$;
revoke all on function private.is_admin() from public, anon, authenticated;

-- El token histórico se transforma a SHA-256 y después se borra en texto plano.
alter table public.entrenadores
  add column if not exists token_hash text,
  add column if not exists last_used_at timestamptz;

alter table public.entrenadores alter column token drop not null;

update public.entrenadores
set token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
where token is not null
  and token_hash is null;

update public.entrenadores set token = null where token is not null;

create unique index if not exists entrenadores_token_hash_key
  on public.entrenadores (token_hash)
  where token_hash is not null;

revoke all on table public.entrenadores from anon;

create or replace function public.verify_entrenador_access(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
  v_nombre text;
begin
  if p_token is null or length(p_token) < 20 then
    return jsonb_build_object('valid', false);
  end if;

  select e.id::text, e.nombre
  into v_id, v_nombre
  from public.entrenadores e
  where e.is_active is true
    and e.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  limit 1;

  if v_id is null then
    return jsonb_build_object('valid', false);
  end if;

  update public.entrenadores
  set last_used_at = now()
  where id::text = v_id;

  return jsonb_build_object('valid', true, 'nombre', v_nombre);
end;
$$;

create or replace function public.admin_list_entrenadores()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item order by item->>'nombre'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', e.id,
      'nombre', e.nombre,
      'is_active', e.is_active,
      'created_at', e.created_at,
      'last_used_at', e.last_used_at
    ) as item
    from public.entrenadores e
  ) rows;

  return v_result;
end;
$$;

create or replace function public.admin_create_entrenador(p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id text;
begin
  if not private.is_admin() then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.entrenadores (nombre, token, token_hash, is_active)
  values (
    trim(p_nombre),
    null,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    true
  )
  returning id::text into v_id;

  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

create or replace function public.admin_rotate_entrenador_access(p_entrenador_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.is_admin() then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.entrenadores
  set token = null,
      token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
      is_active = true
  where id::text = p_entrenador_id;

  if not found then
    raise exception 'Entrenador no encontrado' using errcode = 'P0002';
  end if;
  return jsonb_build_object('token', v_token);
end;
$$;

create or replace function public.admin_set_entrenador_active(
  p_entrenador_id text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  update public.entrenadores
  set is_active = p_is_active
  where id::text = p_entrenador_id;

  if not found then
    raise exception 'Entrenador no encontrado' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.verify_entrenador_access(text) from public;
revoke all on function public.admin_list_entrenadores() from public;
revoke all on function public.admin_create_entrenador(text) from public;
revoke all on function public.admin_rotate_entrenador_access(text) from public;
revoke all on function public.admin_set_entrenador_active(text, boolean) from public;
grant execute on function public.verify_entrenador_access(text) to anon, authenticated;
grant execute on function public.admin_list_entrenadores() to authenticated;
grant execute on function public.admin_create_entrenador(text) to authenticated;
grant execute on function public.admin_rotate_entrenador_access(text) to authenticated;
grant execute on function public.admin_set_entrenador_active(text, boolean) to authenticated;

-- PIN de caja: se guarda con bcrypt, nunca como texto plano en el repositorio.
create table if not exists private.app_secrets (
  name text primary key,
  secret_hash text not null,
  updated_at timestamptz not null default now()
);
revoke all on table private.app_secrets from public, anon, authenticated;

create or replace function private.caja_pin_is_valid(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.app_secrets s
    where s.name = 'caja_pin'
      and s.secret_hash = extensions.crypt(p_pin, s.secret_hash)
  );
$$;
revoke all on function private.caja_pin_is_valid(text) from public, anon, authenticated;

create or replace function public.admin_configure_caja_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'El PIN debe tener 6 dígitos' using errcode = '22023';
  end if;

  insert into private.app_secrets (name, secret_hash, updated_at)
  values ('caja_pin', extensions.crypt(p_pin, extensions.gen_salt('bf', 12)), now())
  on conflict (name) do update
  set secret_hash = excluded.secret_hash,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.verify_caja_pin(p_pin text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.caja_pin_is_valid(p_pin);
$$;

create or replace function public.caja_consultar_atleta(p_pin text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_result jsonb;
  v_short_id text;
begin
  if not private.caja_pin_is_valid(p_pin) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  if p_code like 'JRS:%' then
    v_short_id := split_part(p_code, ':', 2);
    select c.student_id into v_student_id
    from public.credentials c
    where c.is_active is true
      and c.code like ('JRS:' || v_short_id || ':%')
    limit 1;
  else
    select c.student_id into v_student_id
    from public.credentials c
    where c.is_active is true
      and c.code = p_code
    limit 1;
  end if;

  select jsonb_build_object(
    'id', s.id,
    'full_name', s.full_name,
    'batido_credits', coalesce(s.batido_credits, 0)
  ) into v_result
  from public.students s
  where s.id = v_student_id
    and s.is_active is true;

  return v_result;
end;
$$;

create or replace function public.caja_canjear_batido(
  p_pin text,
  p_student_id uuid,
  p_batido_name text,
  p_credits_used integer,
  p_emoji text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.caja_pin_is_valid(p_pin) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  return public.canjear_batido(
    p_student_id,
    p_batido_name,
    p_credits_used,
    p_emoji
  );
end;
$$;

revoke all on function public.admin_configure_caja_pin(text) from public;
revoke all on function public.verify_caja_pin(text) from public;
revoke all on function public.caja_consultar_atleta(text, text) from public;
revoke all on function public.caja_canjear_batido(text, uuid, text, integer, text) from public;
grant execute on function public.admin_configure_caja_pin(text) to authenticated;
grant execute on function public.verify_caja_pin(text) to anon, authenticated;
grant execute on function public.caja_consultar_atleta(text, text) to anon, authenticated;
grant execute on function public.caja_canjear_batido(text, uuid, text, integer, text) to anon, authenticated;

-- Impide saltarse el PIN llamando la función de canje anterior directamente.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'canjear_batido'
  loop
    execute format('revoke execute on function %s from public, anon', v_function);
  end loop;
end;
$$;

commit;
