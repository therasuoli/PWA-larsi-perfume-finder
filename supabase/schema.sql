-- Larsi Perfume Finder: catalogue storage. Run in Supabase SQL Editor.
create table if not exists public.perfumes (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists perfumes_payload_gin_idx on public.perfumes using gin (payload);
alter table public.perfumes enable row level security;
drop policy if exists "Public can read perfume catalog" on public.perfumes;
create policy "Public can read perfume catalog" on public.perfumes for select to anon, authenticated using (true);
-- No public insert/update/delete policies: writes require service-role key in GitHub Actions.
