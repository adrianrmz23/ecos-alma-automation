-- BLOCK 9 — Operación automática + recuperación segura
-- Ejecutar después de 008_block_8_facebook_publisher.sql.

-- 1) Estados de recuperación de la cola.
alter table public.publication_queue drop constraint if exists publication_queue_status_check;
alter table public.publication_queue
  add constraint publication_queue_status_check
  check (status in (
    'scheduled',
    'ready_to_publish',
    'publishing',
    'retry_wait',
    'needs_review',
    'published',
    'failed',
    'cancelled'
  ));

alter table public.publication_queue
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists failure_kind text not null default '',
  add column if not exists last_http_status integer,
  add column if not exists last_error_code text not null default '',
  add column if not exists publishing_started_at timestamptz,
  add column if not exists manual_resolution text not null default '';

alter table public.publication_queue drop constraint if exists publication_queue_failure_kind_check;
alter table public.publication_queue
  add constraint publication_queue_failure_kind_check
  check (failure_kind in ('', 'transient', 'permanent', 'connection', 'ambiguous'));

create index if not exists publication_queue_retry_due_idx
  on public.publication_queue(next_retry_at asc)
  where status = 'retry_wait';

create index if not exists publication_queue_publishing_started_idx
  on public.publication_queue(publishing_started_at asc)
  where status = 'publishing';

-- 2) Scheduler runs más detallados.
alter table public.scheduler_runs drop constraint if exists scheduler_runs_trigger_source_check;
alter table public.scheduler_runs
  add constraint scheduler_runs_trigger_source_check
  check (trigger_source in ('manual', 'api', 'cron'));

alter table public.scheduler_runs
  add column if not exists status text not null default 'completed',
  add column if not exists published_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists retry_count integer not null default 0,
  add column if not exists review_count integer not null default 0,
  add column if not exists duration_ms integer not null default 0,
  add column if not exists error_message text not null default '';

alter table public.scheduler_runs drop constraint if exists scheduler_runs_status_check;
alter table public.scheduler_runs
  add constraint scheduler_runs_status_check
  check (status in ('completed', 'partial', 'failed'));

-- 3) Estado operativo resumido del scheduler por página.
create table if not exists public.scheduler_health (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'healthy', 'warning', 'error')),
  last_tick_at timestamptz,
  last_success_at timestamptz,
  last_published_at timestamptz,
  consecutive_failures integer not null default 0,
  last_duration_ms integer not null default 0,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, page_id)
);

create index if not exists scheduler_health_owner_idx
  on public.scheduler_health(owner_id, updated_at desc);

alter table public.scheduler_health enable row level security;

drop policy if exists "scheduler_health_select_own" on public.scheduler_health;
drop policy if exists "scheduler_health_insert_own" on public.scheduler_health;
drop policy if exists "scheduler_health_update_own" on public.scheduler_health;

create policy "scheduler_health_select_own"
on public.scheduler_health for select
to authenticated
using (auth.uid() = owner_id);

create policy "scheduler_health_insert_own"
on public.scheduler_health for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = auth.uid()
  )
);

create policy "scheduler_health_update_own"
on public.scheduler_health for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop trigger if exists scheduler_health_set_updated_at on public.scheduler_health;
create trigger scheduler_health_set_updated_at
before update on public.scheduler_health
for each row execute function public.set_updated_at();

-- 4) Un publishing que quedó abandonado NO se reintenta automáticamente.
-- Puede haber llegado a Facebook antes de que el proceso muriera; el Bloque 9
-- lo enviará a needs_review para evitar duplicados.
