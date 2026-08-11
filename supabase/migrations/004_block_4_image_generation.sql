-- BLOCK 4 — Generación de imagen basada en estilo y referencias
-- Ejecutar después de 001, 002 y 003.

alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check (
    status in (
      'draft',
      'generating_strategy',
      'generating_content',
      'ready_for_image',
      'generating_image',
      'image_ready',
      'failed'
    )
  );

create table if not exists public.post_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  version integer not null default 1,
  is_selected boolean not null default true,
  status text not null default 'ready' check (status in ('generating', 'ready', 'failed')),
  prompt text not null default '',
  revised_prompt text not null default '',
  storage_path text unique,
  mime_type text not null default 'image/png',
  byte_size bigint,
  width integer,
  height integer,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_images_post_idx
  on public.post_images(post_id, version desc);

alter table public.post_images enable row level security;

drop policy if exists "post_images_select_own" on public.post_images;
drop policy if exists "post_images_insert_own" on public.post_images;
drop policy if exists "post_images_update_own" on public.post_images;
drop policy if exists "post_images_delete_own" on public.post_images;

create policy "post_images_select_own"
on public.post_images for select
to authenticated
using (auth.uid() = owner_id);

create policy "post_images_insert_own"
on public.post_images for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.owner_id = auth.uid()
  )
);

create policy "post_images_update_own"
on public.post_images for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.owner_id = auth.uid()
  )
);

create policy "post_images_delete_own"
on public.post_images for delete
to authenticated
using (auth.uid() = owner_id);

drop trigger if exists post_images_set_updated_at on public.post_images;
create trigger post_images_set_updated_at
before update on public.post_images
for each row execute function public.set_updated_at();

-- Bucket recomendado: generated-post-images (privado)
-- Archivos guardados como: <user-id>/<post-id>/<uuid>.png

drop policy if exists "generated_images_storage_select_own" on storage.objects;
drop policy if exists "generated_images_storage_insert_own" on storage.objects;
drop policy if exists "generated_images_storage_delete_own" on storage.objects;

create policy "generated_images_storage_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'generated-post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "generated_images_storage_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'generated-post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
);

create policy "generated_images_storage_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'generated-post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
