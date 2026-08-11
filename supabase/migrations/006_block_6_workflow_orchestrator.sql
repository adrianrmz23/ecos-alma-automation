-- BLOCK 6 — Orquestador + máquina de estados
-- Ejecutar después de 0051_block_5_1_external_images.sql.

alter table public.pages
  add column if not exists default_image_source_mode text not null default 'external';

alter table public.pages
  drop constraint if exists pages_default_image_source_mode_check;

alter table public.pages
  add constraint pages_default_image_source_mode_check
  check (default_image_source_mode in ('external', 'api'));

alter table public.pages
  add column if not exists auto_approve_min_score integer not null default 90;

alter table public.pages
  drop constraint if exists pages_auto_approve_min_score_check;

alter table public.pages
  add constraint pages_auto_approve_min_score_check
  check (auto_approve_min_score between 0 and 100);

alter table public.posts
  add column if not exists image_source_mode text not null default 'external';

alter table public.posts
  drop constraint if exists posts_image_source_mode_check;

alter table public.posts
  add constraint posts_image_source_mode_check
  check (image_source_mode in ('external', 'api'));

alter table public.posts
  add column if not exists workflow_step text not null default 'strategy';

alter table public.posts
  drop constraint if exists posts_workflow_step_check;

alter table public.posts
  add constraint posts_workflow_step_check
  check (workflow_step in ('strategy', 'content', 'waiting_image', 'image', 'review', 'approval', 'completed', 'failed'));

alter table public.posts
  add column if not exists workflow_status text not null default 'idle';

alter table public.posts
  drop constraint if exists posts_workflow_status_check;

alter table public.posts
  add constraint posts_workflow_status_check
  check (workflow_status in ('idle', 'running', 'waiting', 'completed', 'failed'));

alter table public.posts
  add column if not exists workflow_error text not null default '';

alter table public.posts
  add column if not exists workflow_started_at timestamptz;

alter table public.posts
  add column if not exists workflow_completed_at timestamptz;

alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check (
    status in (
      'draft',
      'generating_strategy',
      'generating_content',
      'ready_for_image',
      'awaiting_external_image',
      'generating_image',
      'image_ready',
      'reviewed',
      'approved',
      'rejected',
      'failed'
    )
  );

create index if not exists posts_workflow_status_idx
  on public.posts(owner_id, workflow_status, workflow_step, created_at desc);
