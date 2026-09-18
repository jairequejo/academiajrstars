-- Nombres estructurados y observaciones para la ficha del alumno.
-- Mantiene full_name para que el portal, scanner y módulos existentes sigan funcionando.
begin;

alter table public.students
  add column if not exists first_names text,
  add column if not exists last_names text,
  add column if not exists notes text,
  add column if not exists parent_phone_secondary text,
  add column if not exists enrollment_amount numeric(10, 2);

-- Los archivos históricos no indican LMV/MJS. Permitir NULL evita inventar un horario.
alter table public.students
  alter column horario drop not null;

-- Los registros anteriores conservan su nombre completo hasta que se editen.
update public.students
set first_names = nullif(btrim(full_name), '')
where nullif(btrim(first_names), '') is null
  and nullif(btrim(full_name), '') is not null;

create or replace function public.sync_student_full_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_names := nullif(btrim(new.first_names), '');
  new.last_names := nullif(btrim(new.last_names), '');

  if new.first_names is not null or new.last_names is not null then
    new.full_name := concat_ws(' ', new.first_names, new.last_names);
  end if;

  return new;
end;
$$;

drop trigger if exists students_sync_full_name on public.students;
create trigger students_sync_full_name
before insert or update of first_names, last_names on public.students
for each row execute function public.sync_student_full_name();

comment on column public.students.first_names is
  'Nombres del alumno en el orden habitual de lectura.';
comment on column public.students.last_names is
  'Apellidos del alumno, separados para ordenar y buscar correctamente.';
comment on column public.students.notes is
  'Observaciones administrativas visibles en la ficha del alumno.';
comment on column public.students.parent_phone_secondary is
  'Segundo teléfono de contacto cuando el padrón contiene más de un número.';
comment on column public.students.enrollment_amount is
  'Monto de inscripción o matrícula asociado al registro del alumno.';

commit;
