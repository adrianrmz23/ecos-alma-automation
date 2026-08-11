-- BLOCK 8 — Facebook Login for Business + publicación real
-- Ejecutar después de 007_block_7_queue_scheduler.sql.
-- Es idempotente: puede ejecutarse aunque exista una versión anterior del Bloque 8.

alter table public.publication_queue
  add column if not exists facebook_photo_id text not null default '',
  add column if not exists last_attempt_at timestamptz;

create table if not exists public.facebook_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  facebook_page_id text not null default '',
  facebook_page_name text not null default '',
  system_user_id text not null default '',
  encrypted_system_user_token text not null default '',
  encrypted_page_access_token text not null default '',
  token_type text not null default 'business_system_user',
  status text not null default 'disconnected' check (status in ('connected', 'select_page', 'reconnect_required', 'disconnected')),
  available_pages jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz,
  last_error text not null default '',
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, page_id)
);

create index if not exists facebook_connections_owner_idx
  on public.facebook_connections(owner_id, updated_at desc);

alter table public.facebook_connections enable row level security;

drop policy if exists "facebook_connections_select_own" on public.facebook_connections;
drop policy if exists "facebook_connections_insert_own" on public.facebook_connections;
drop policy if exists "facebook_connections_update_own" on public.facebook_connections;
drop policy if exists "facebook_connections_delete_own" on public.facebook_connections;

create policy "facebook_connections_select_own"
on public.facebook_connections for select
to authenticated
using (auth.uid() = owner_id);

create policy "facebook_connections_insert_own"
on public.facebook_connections for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = auth.uid()
  )
);

create policy "facebook_connections_update_own"
on public.facebook_connections for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = auth.uid()
  )
);

create policy "facebook_connections_delete_own"
on public.facebook_connections for delete
to authenticated
using (auth.uid() = owner_id);

drop trigger if exists facebook_connections_set_updated_at on public.facebook_connections;
create trigger facebook_connections_set_updated_at
before update on public.facebook_connections
for each row execute function public.set_updated_at();

create table if not exists public.facebook_publish_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  queue_id uuid references public.publication_queue(id) on delete set null,
  attempt integer not null default 1,
  success boolean not null default false,
  http_status integer,
  facebook_post_id text not null default '',
  facebook_photo_id text not null default '',
  error_code text not null default '',
  error_message text not null default '',
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists facebook_publish_logs_owner_created_idx
  on public.facebook_publish_logs(owner_id, created_at desc);

create index if not exists facebook_publish_logs_queue_idx
  on public.facebook_publish_logs(queue_id, created_at desc);

alter table public.facebook_publish_logs enable row level security;

drop policy if exists "facebook_publish_logs_select_own" on public.facebook_publish_logs;
drop policy if exists "facebook_publish_logs_insert_own" on public.facebook_publish_logs;

create policy "facebook_publish_logs_select_own"
on public.facebook_publish_logs for select
to authenticated
using (auth.uid() = owner_id);

create policy "facebook_publish_logs_insert_own"
on public.facebook_publish_logs for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = auth.uid()
  )
);
