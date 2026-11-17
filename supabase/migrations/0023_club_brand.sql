-- Overlap: club colours. Each club picks a main colour (headers, the "next up" ticket) and an accent
-- (the most important buttons and highlights). The app works out readable text colours from them.
-- Safe to run more than once.

alter table public.clubs add column if not exists brand_primary text not null default '#17181c';
alter table public.clubs add column if not exists brand_accent text not null default '#2d5bff';
alter table public.clubs drop constraint if exists clubs_brand_primary_check;
alter table public.clubs drop constraint if exists clubs_brand_accent_check;
alter table public.clubs add constraint clubs_brand_primary_check check (brand_primary ~ '^#[0-9a-fA-F]{6}$');
alter table public.clubs add constraint clubs_brand_accent_check check (brand_accent ~ '^#[0-9a-fA-F]{6}$');

-- Southern Lakes United FC: charcoal and orange from the club badge.
update public.clubs set brand_primary = '#1d1d1f', brand_accent = '#f29130'
where name ilike '%southern lakes%' and brand_primary = '#17181c' and brand_accent = '#2d5bff';

notify pgrst, 'reload schema';
