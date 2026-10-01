-- Perfil privado del alumno y datos opcionales de Lichess
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  apoderado text,
  whatsapp_apoderado text,
  lichess_usuario text,
  lichess_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.perfiles enable row level security;

create policy "alumno_ve_su_perfil"
on public.perfiles for select
to authenticated
using (auth.uid() = id);

create policy "alumno_crea_su_perfil"
on public.perfiles for insert
to authenticated
with check (auth.uid() = id);

create policy "alumno_actualiza_su_perfil"
on public.perfiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
