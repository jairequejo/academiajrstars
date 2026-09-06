-- Historial y cola de recordatorios de cobranza.
-- Aditiva: conserva las notificaciones existentes y mantiene compatibilidad
-- con js/admin-cobranzas.js (alumno_id, tipo_aviso, mensaje, fecha_envio).
begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.historial_notificaciones (
  id uuid primary key default extensions.gen_random_uuid(),
  alumno_id uuid not null references public.students(id) on delete cascade,
  tipo_aviso text not null default 'WhatsApp',
  mensaje text,
  fecha_envio timestamptz not null default now()
);

alter table public.historial_notificaciones
  add column if not exists estado text not null default 'enviada',
  add column if not exists programada_para timestamptz,
  add column if not exists resuelta_at timestamptz,
  add column if not exists intentos integer not null default 1,
  add column if not exists obligacion_clave text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid default auth.uid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'historial_notificaciones_estado_check'
      and conrelid = 'public.historial_notificaciones'::regclass
  ) then
    alter table public.historial_notificaciones
      add constraint historial_notificaciones_estado_check
      check (estado in ('pendiente', 'enviada', 'fallida', 'cancelada', 'resuelta'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'historial_notificaciones_intentos_check'
      and conrelid = 'public.historial_notificaciones'::regclass
  ) then
    alter table public.historial_notificaciones
      add constraint historial_notificaciones_intentos_check
      check (intentos >= 0);
  end if;
end;
$$;

create index if not exists historial_notificaciones_alumno_fecha_idx
  on public.historial_notificaciones (alumno_id, fecha_envio desc);

create index if not exists historial_notificaciones_cola_idx
  on public.historial_notificaciones (estado, programada_para)
  where estado = 'pendiente';

alter table public.historial_notificaciones enable row level security;

revoke all on table public.historial_notificaciones from public, anon;
revoke delete on table public.historial_notificaciones from authenticated;
grant select, insert, update on table public.historial_notificaciones to authenticated;

-- Las políticas permisivas se combinan con OR. Para garantizar que no quede
-- una política pública antigua, se sustituyen todas las de esta tabla.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'historial_notificaciones'
  loop
    execute format(
      'drop policy if exists %I on public.historial_notificaciones',
      existing_policy.policyname
    );
  end loop;
end;
$$;

create policy historial_notificaciones_admin_select
  on public.historial_notificaciones
  for select to authenticated
  using (private.is_admin());

create policy historial_notificaciones_admin_insert
  on public.historial_notificaciones
  for insert to authenticated
  with check (private.is_admin());

create policy historial_notificaciones_admin_update
  on public.historial_notificaciones
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

comment on table public.historial_notificaciones is
  'Eventos y cola de recordatorios. El historial enviado no se elimina al registrar un pago.';
comment on column public.historial_notificaciones.obligacion_clave is
  'Identificador estable del cobro relacionado, por ejemplo mensualidad:2026-09.';

commit;
