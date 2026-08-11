-- BLOCK 7 — Cola editable + Scheduler
-- Ejecutar después de 0061_block_6_bulk_scheduling.sql.

-- 1) Ampliamos los estados de la cola para separar "programada" de
--    "lista para publicar". Facebook se conectará en el Bloque 8.
alter table public.publication_queue drop constraint if exists publication_queue_status_check;
alter table public.publication_queue
  add constraint publication_queue_status_check
  check (status in ('scheduled', 'ready_to_publish', 'publishing', 'published', 'failed', 'cancelled'));

alter table public.publication_queue
  add column if not exists ready_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists schedule_source text not null default 'bulk' check (schedule_source in ('bulk', 'manual', 'publish_now'));

-- Índice para acelerar validación de horarios activos. La app impide colisiones
-- exactas al editar, sin romper instalaciones que ya tengan datos históricos.
create index if not exists publication_queue_active_slot_idx
  on public.publication_queue(page_id, scheduled_for)
  where status in ('scheduled', 'ready_to_publish', 'publishing');

-- 2) Registro liviano de ejecuciones del scheduler.
create table if not exists public.scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  trigger_source text not null default 'manual' check (trigger_source in ('manual', 'api')),
  processed_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

create index if not exists scheduler_runs_owner_created_idx
  on public.scheduler_runs(owner_id, started_at desc);

alter table public.scheduler_runs enable row level security;

drop policy if exists "scheduler_runs_select_own" on public.scheduler_runs;
drop policy if exists "scheduler_runs_insert_own" on public.scheduler_runs;

create policy "scheduler_runs_select_own"
on public.scheduler_runs for select
to authenticated
using (auth.uid() = owner_id);

create policy "scheduler_runs_insert_own"
on public.scheduler_runs for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = auth.uid()
  )
);
