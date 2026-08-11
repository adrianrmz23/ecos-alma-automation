-- BLOCK 2 — Biblioteca visual de Ecos del Alma
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 001_block_1_base.sql.
--
-- IMPORTANTE:
-- 1) Esta migración crea tablas y políticas RLS.
-- 2) El bucket de Storage NO se crea desde SQL. Créalo desde Supabase Dashboard:
--    Storage > New bucket
--      name: style-references
--      Public: OFF (private)
--      Max file size: 8 MB
--      Allowed MIME types: image/jpeg, image/png, image/webp

create table if not exists public.visual_styles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default 'General',
  mood text not null default '',
  color_notes text not null default '',
  layout_notes text not null default '',
  usage_rules text not null default '',
  suggested_topics text[] not null default '{}',
  suggested_figures text[] not null default '{}',
  auto_select_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, name)
);

create table if not exists public.style_references (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  style_id uuid not null references public.visual_styles(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null default 0,
  notes text not null default '',
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists visual_styles_owner_page_idx
  on public.visual_styles(owner_id, page_id);

create index if not exists visual_styles_auto_idx
  on public.visual_styles(page_id, active, auto_select_enabled);

create index if not exists style_references_style_idx
  on public.style_references(style_id, sort_order, created_at);

alter table public.visual_styles enable row level security;
alter table public.style_references enable row level security;

drop policy if exists "visual_styles_select_own" on public.visual_styles;
drop policy if exists "visual_styles_insert_own" on public.visual_styles;
drop policy if exists "visual_styles_update_own" on public.visual_styles;
drop policy if exists "visual_styles_delete_own" on public.visual_styles;

create policy "visual_styles_select_own"
on public.visual_styles for select
to authenticated
using (auth.uid() = owner_id);

create policy "visual_styles_insert_own"
on public.visual_styles for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.pages p
    where p.id = page_id
      and p.owner_id = auth.uid()
  )
);

create policy "visual_styles_update_own"
on public.visual_styles for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.pages p
    where p.id = page_id
      and p.owner_id = auth.uid()
  )
);

create policy "visual_styles_delete_own"
on public.visual_styles for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "style_references_select_own" on public.style_references;
drop policy if exists "style_references_insert_own" on public.style_references;
drop policy if exists "style_references_update_own" on public.style_references;
drop policy if exists "style_references_delete_own" on public.style_references;

create policy "style_references_select_own"
on public.style_references for select
to authenticated
using (auth.uid() = owner_id);

create policy "style_references_insert_own"
on public.style_references for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.visual_styles s
    where s.id = style_id
      and s.owner_id = auth.uid()
  )
);

create policy "style_references_update_own"
on public.style_references for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.visual_styles s
    where s.id = style_id
      and s.owner_id = auth.uid()
  )
);

create policy "style_references_delete_own"
on public.style_references for delete
to authenticated
using (auth.uid() = owner_id);

-- Trigger updated_at reutilizando la función creada en Bloque 1.
drop trigger if exists visual_styles_set_updated_at on public.visual_styles;
create trigger visual_styles_set_updated_at
before update on public.visual_styles
for each row execute function public.set_updated_at();

-- Políticas del bucket privado style-references.
-- Los archivos se guardan como: <user-id>/<style-id>/<uuid>.<ext>
drop policy if exists "style_refs_storage_select_own" on storage.objects;
drop policy if exists "style_refs_storage_insert_own" on storage.objects;
drop policy if exists "style_refs_storage_delete_own" on storage.objects;

create policy "style_refs_storage_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'style-references'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "style_refs_storage_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'style-references'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

create policy "style_refs_storage_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'style-references'
  and (storage.foldername(name))[1] = auth.uid()::text
);
