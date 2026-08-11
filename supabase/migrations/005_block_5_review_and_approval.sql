-- BLOCK 5 — Revisión / QA / aprobación
-- Ejecutar después de 001, 002, 003 y 004.

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
      'reviewed',
      'approved',
      'rejected',
      'failed'
    )
  );

create table if not exists public.qa_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  version integer not null default 1,
  review_status text not null default 'completed' check (review_status in ('running', 'completed', 'failed')),
  recommended_decision text not null default 'revise' check (recommended_decision in ('approve', 'revise')),
  final_decision text not null default 'pending' check (final_decision in ('pending', 'approved', 'rejected')),
  overall_score integer not null default 0,
  content_score integer not null default 0,
  brand_score integer not null default 0,
  visual_score integer not null default 0,
  summary text not null default '',
  strengths text[] not null default '{}',
  issues text[] not null default '{}',
  recommendations text[] not null default '{}',
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qa_reviews_post_version_idx
  on public.qa_reviews(post_id, version desc);

alter table public.qa_reviews enable row level security;

drop policy if exists "qa_reviews_select_own" on public.qa_reviews;
drop policy if exists "qa_reviews_insert_own" on public.qa_reviews;
drop policy if exists "qa_reviews_update_own" on public.qa_reviews;
drop policy if exists "qa_reviews_delete_own" on public.qa_reviews;

create policy "qa_reviews_select_own"
on public.qa_reviews for select
to authenticated
using (auth.uid() = owner_id);

create policy "qa_reviews_insert_own"
on public.qa_reviews for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.owner_id = auth.uid()
  )
);

create policy "qa_reviews_update_own"
on public.qa_reviews for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.owner_id = auth.uid()
  )
);

create policy "qa_reviews_delete_own"
on public.qa_reviews for delete
to authenticated
using (auth.uid() = owner_id);

drop trigger if exists qa_reviews_set_updated_at on public.qa_reviews;
create trigger qa_reviews_set_updated_at
before update on public.qa_reviews
for each row execute function public.set_updated_at();
