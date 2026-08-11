-- BLOCK 1 — Base de Ecos del Alma
-- Ejecutar en Supabase > SQL Editor.

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Ecos del Alma',
  slug text not null,
  platform text not null default 'facebook' check (platform in ('facebook')),
  status text not null default 'active' check (status in ('active', 'paused')),
  timezone text not null default 'America/Mexico_City',
  publish_interval_minutes integer not null default 60 check (publish_interval_minutes between 15 and 1440),
  publish_window_start time not null default '07:00',
  publish_window_end time not null default '23:00',
  default_workflow_mode text not null default 'supervised' check (default_workflow_mode in ('supervised', 'automatic')),
  default_reference_mode text not null default 'automatic' check (default_reference_mode in ('automatic', 'manual')),
  brand_tone text not null default 'Devocional, cálido, esperanzador, elegante y cercano.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

alter table public.pages enable row level security;

-- Re-crear las políticas de forma segura si vuelves a ejecutar la migración manualmente.
drop policy if exists "pages_select_own" on public.pages;
drop policy if exists "pages_insert_own" on public.pages;
drop policy if exists "pages_update_own" on public.pages;
drop policy if exists "pages_delete_own" on public.pages;

create policy "pages_select_own"
on public.pages for select
to authenticated
using (auth.uid() = owner_id);

create policy "pages_insert_own"
on public.pages for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "pages_update_own"
on public.pages for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "pages_delete_own"
on public.pages for delete
to authenticated
using (auth.uid() = owner_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at
before update on public.pages
for each row execute function public.set_updated_at();
