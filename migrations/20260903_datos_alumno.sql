-- Campos que utiliza el formulario y la ficha del alumno.
-- Ejecutar en el SQL Editor del proyecto Supabase correspondiente.
-- Es una migración aditiva: conserva los alumnos, pagos y asistencias existentes.
begin;

alter table public.students
  add column if not exists fecha_nacimiento date,
  add column if not exists parent_name text,
  add column if not exists parent_phone text,
  add column if not exists grupo text,
  add column if not exists categoria text,
  add column if not exists tarifa_mensual numeric(10, 2),
  add column if not exists codigo_legacy text;

commit;
