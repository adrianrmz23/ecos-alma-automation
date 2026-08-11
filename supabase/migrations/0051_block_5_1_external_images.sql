-- BLOCK 5.1 — Imágenes externas / ChatGPT
-- Ejecutar después de 005_block_5_review_and_approval.sql.

alter table public.post_images
  add column if not exists source text not null default 'api';

alter table public.post_images
  drop constraint if exists post_images_source_check;

alter table public.post_images
  add constraint post_images_source_check
  check (source in ('api', 'upload'));

alter table public.post_images
  add column if not exists original_filename text not null default '';

alter table public.qa_reviews
  add column if not exists post_image_id uuid references public.post_images(id) on delete set null;

create index if not exists qa_reviews_post_image_idx
  on public.qa_reviews(post_id, post_image_id, version desc);
