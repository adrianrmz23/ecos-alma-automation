-- BLOCK 3 — Estrategia + redactor para Ecos del Alma
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 001 y 002.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  type text not null default 'prayer' check (type in ('prayer')),
  topic text not null default '',
  figure_name text not null default '',
  intention text not null default '',
  length_preference text not null default 'medium' check (length_preference in ('short', 'medium', 'long')),
  workflow_mode text not null default 'supervised' check (workflow_mode in ('supervised', 'automatic')),
  style_mode text not null default 'automatic' check (style_mode in ('automatic', 'manual')),
  selected_style_id uuid references public.visual_styles(id) on delete set null,
  selected_style_reason text not null default '',
  selected_style_confidence numeric(4,3),
  additional_instructions text not null default '',
  strategy_payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'generating_strategy', 'generating_content', 'ready_for_image', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_content (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  version integer not null default 1,
  is_selected boolean not null default true,
  eyebrow text not null default 'Oración a',
  title text not null default '',
  subtitle text not null default '',
  prayer_text text not null default '',
  caption text not null default '',
  cta text not null default '',
  hashtags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  provider text not null default 'openai-compatible',
  model text not null default '',
  current_step text not null default 'strategy',
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  error_message text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.generation_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.generation_runs(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  step text not null,
  message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists posts_owner_page_created_idx
  on public.posts(owner_id, page_id, created_at desc);

create index if not exists posts_status_idx
  on public.posts(owner_id, status, created_at desc);

create index if not exists post_content_post_version_idx
  on public.post_content(post_id, version desc);

create index if not exists generation_runs_post_idx
  on public.generation_runs(post_id, started_at desc);

create index if not exists generation_logs_run_idx
  on public.generation_logs(run_id, created_at asc);

alter table public.posts enable row level security;
alter table public.post_content enable row level security;
alter table public.generation_runs enable row level security;
alter table public.generation_logs enable row level security;

drop policy if exists "posts_select_own" on public.posts;
drop policy if exists "posts_insert_own" on public.posts;
drop policy if exists "posts_update_own" on public.posts;
drop policy if exists "posts_delete_own" on public.posts;

create policy "posts_select_own"
on public.posts for select
to authenticated
using (auth.uid() = owner_id);

create policy "posts_insert_own"
on public.posts for insert
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

create policy "posts_update_own"
on public.posts for update
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

create policy "posts_delete_own"
on public.posts for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "post_content_select_own" on public.post_content;
drop policy if exists "post_content_insert_own" on public.post_content;
drop policy if exists "post_content_update_own" on public.post_content;
drop policy if exists "post_content_delete_own" on public.post_content;

create policy "post_content_select_own"
on public.post_content for select
to authenticated
using (auth.uid() = owner_id);

create policy "post_content_insert_own"
on public.post_content for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.owner_id = auth.uid()
  )
);

create policy "post_content_update_own"
on public.post_content for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.owner_id = auth.uid()
  )
);

create policy "post_content_delete_own"
on public.post_content for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "generation_runs_select_own" on public.generation_runs;
drop policy if exists "generation_runs_insert_own" on public.generation_runs;
drop policy if exists "generation_runs_update_own" on public.generation_runs;
drop policy if exists "generation_runs_delete_own" on public.generation_runs;

create policy "generation_runs_select_own"
on public.generation_runs for select
to authenticated
using (auth.uid() = owner_id);

create policy "generation_runs_insert_own"
on public.generation_runs for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.owner_id = auth.uid()
  )
);

create policy "generation_runs_update_own"
on public.generation_runs for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.owner_id = auth.uid()
  )
);

create policy "generation_runs_delete_own"
on public.generation_runs for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "generation_logs_select_own" on public.generation_logs;
drop policy if exists "generation_logs_insert_own" on public.generation_logs;
drop policy if exists "generation_logs_update_own" on public.generation_logs;
drop policy if exists "generation_logs_delete_own" on public.generation_logs;

create policy "generation_logs_select_own"
on public.generation_logs for select
to authenticated
using (auth.uid() = owner_id);

create policy "generation_logs_insert_own"
on public.generation_logs for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.owner_id = auth.uid()
  )
);

create policy "generation_logs_update_own"
on public.generation_logs for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.owner_id = auth.uid()
  )
);

create policy "generation_logs_delete_own"
on public.generation_logs for delete
to authenticated
using (auth.uid() = owner_id);

-- Triggers updated_at reutilizando la función del Bloque 1.
drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();
