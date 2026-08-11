-- BLOCK 6 (simplificado) — Programación masiva
-- Este bloque sustituye el flujo multiagente como experiencia principal.
-- Puede ejecutarse aunque existan las migraciones 0051/006 anteriores.

create table if not exists public.bulk_schedule_batches (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  item_count integer not null default 0 check (item_count between 1 and 10),
  status text not null default 'scheduled' check (status in ('scheduled', 'partial', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.publication_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  batch_id uuid references public.bulk_schedule_batches(id) on delete set null,
  source text not null default 'bulk_upload' check (source in ('bulk_upload')),
  storage_path text not null,
  original_filename text not null default '',
  mime_type text not null default 'image/png',
  caption text not null default '',
  sort_order integer not null default 0,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  facebook_post_id text not null default '',
  attempts integer not null default 0,
  last_error text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bulk_schedule_batches_owner_idx
  on public.bulk_schedule_batches(owner_id, created_at desc);

create index if not exists publication_queue_owner_schedule_idx
  on public.publication_queue(owner_id, scheduled_for asc);

create index if not exists publication_queue_status_idx
  on public.publication_queue(owner_id, status, scheduled_for asc);

alter table public.bulk_schedule_batches enable row level security;
alter table public.publication_queue enable row level security;

drop policy if exists "bulk_batches_select_own" on public.bulk_schedule_batches;
drop policy if exists "bulk_batches_insert_own" on public.bulk_schedule_batches;
drop policy if exists "bulk_batches_update_own" on public.bulk_schedule_batches;
drop policy if exists "bulk_batches_delete_own" on public.bulk_schedule_batches;

create policy "bulk_batches_select_own"
on public.bulk_schedule_batches for select
to authenticated
using (auth.uid() = owner_id);

create policy "bulk_batches_insert_own"
on public.bulk_schedule_batches for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = auth.uid()
  )
);

create policy "bulk_batches_update_own"
on public.bulk_schedule_batches for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "bulk_batches_delete_own"
on public.bulk_schedule_batches for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "publication_queue_select_own" on public.publication_queue;
drop policy if exists "publication_queue_insert_own" on public.publication_queue;
drop policy if exists "publication_queue_update_own" on public.publication_queue;
drop policy if exists "publication_queue_delete_own" on public.publication_queue;

create policy "publication_queue_select_own"
on public.publication_queue for select
to authenticated
using (auth.uid() = owner_id);

create policy "publication_queue_insert_own"
on public.publication_queue for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = auth.uid()
  )
);

create policy "publication_queue_update_own"
on public.publication_queue for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "publication_queue_delete_own"
on public.publication_queue for delete
to authenticated
using (auth.uid() = owner_id);

drop trigger if exists bulk_schedule_batches_set_updated_at on public.bulk_schedule_batches;
create trigger bulk_schedule_batches_set_updated_at
before update on public.bulk_schedule_batches
for each row execute function public.set_updated_at();

drop trigger if exists publication_queue_set_updated_at on public.publication_queue;
create trigger publication_queue_set_updated_at
before update on public.publication_queue
for each row execute function public.set_updated_at();

-- Reutilizamos el bucket privado generado en el Bloque 4: generated-post-images.
-- Las cargas masivas se guardan como: <user-id>/bulk/<batch-id>/<archivo>
-- Estas políticas también permiten una instalación simplificada sin depender de las migraciones antiguas de IA.
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
