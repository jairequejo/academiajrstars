-- Pedidos de uniformes de los alumnos.
-- Ejecutar en Supabase SQL Editor después de 20260905_security_hardening.sql.
-- Es una migración aditiva: no modifica alumnos, pagos ni asistencias.
begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.uniform_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  dorsal_name text,
  dorsal_number smallint,
  uniform_type text not null default 'completo',
  color_variant text not null default 'salmon_granate',
  amount numeric(10, 2) not null default 60.00,
  status text not null default 'pendiente',
  is_paid boolean not null default false,
  paid_at timestamptz,
  delivered_at timestamptz,
  notes text,
  ordered_at date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniform_orders_dorsal_number_check
    check (dorsal_number is null or dorsal_number between 0 and 99),
  constraint uniform_orders_dorsal_fields_check
    check (
      (
        uniform_type in ('completo', 'polo')
        and nullif(btrim(dorsal_name), '') is not null
        and dorsal_number is not null
      )
      or (uniform_type = 'short' and dorsal_number is not null)
      or uniform_type = 'medias'
    ),
  constraint uniform_orders_type_check
    check (uniform_type in ('completo', 'polo', 'short', 'medias')),
  constraint uniform_orders_color_check
    check (color_variant in ('salmon_granate', 'rojo_azul')),
  constraint uniform_orders_amount_check
    check (amount >= 0),
  constraint uniform_orders_status_check
    check (status in ('pendiente', 'en_confeccion', 'entregado'))
);

create index if not exists uniform_orders_student_idx
  on public.uniform_orders (student_id, created_at desc);

create index if not exists uniform_orders_workflow_idx
  on public.uniform_orders (status, is_paid, created_at desc);

create or replace function public.sync_uniform_order_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.is_paid then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;
  end if;

  if new.status = 'entregado' then
    new.delivered_at := coalesce(new.delivered_at, now());
  else
    new.delivered_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists uniform_orders_sync_dates on public.uniform_orders;
create trigger uniform_orders_sync_dates
before insert or update on public.uniform_orders
for each row execute function public.sync_uniform_order_dates();

alter table public.uniform_orders enable row level security;

revoke all on table public.uniform_orders from public, anon;
revoke all on function public.sync_uniform_order_dates() from public, anon, authenticated;
grant select, insert, update on table public.uniform_orders to authenticated;

drop policy if exists uniform_orders_admin_select on public.uniform_orders;
drop policy if exists uniform_orders_admin_insert on public.uniform_orders;
drop policy if exists uniform_orders_admin_update on public.uniform_orders;

create policy uniform_orders_admin_select
  on public.uniform_orders
  for select to authenticated
  using (private.is_admin());

create policy uniform_orders_admin_insert
  on public.uniform_orders
  for insert to authenticated
  with check (private.is_admin());

create policy uniform_orders_admin_update
  on public.uniform_orders
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

comment on table public.uniform_orders is
  'Pedidos de uniformes vinculados a alumnos, con confección, entrega y pago.';
comment on column public.uniform_orders.dorsal_name is
  'Nombre que se imprimirá en el polo; puede diferir del nombre completo del alumno.';
comment on column public.uniform_orders.amount is
  'Precio acordado para este pedido. El panel propone un valor, pero permite editarlo.';

commit;
