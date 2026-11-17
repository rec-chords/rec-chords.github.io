-- Fredon : à coller dans Supabase > SQL Editor > New query, puis "Run".
-- Crée les tables, l'espace de stockage des vocaux, et les règles d'accès
-- (chaque utilisateur ne voit que ses propres données).

create table if not exists public.ideas (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null default '',
  tags        text[] not null default '{}',
  starred     boolean not null default false,
  notes       text not null default '',
  color       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.takes (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  idea_id     uuid references public.ideas on delete set null,
  title       text not null default '',
  notes       text not null default '',
  duration    real not null default 0,
  mime        text not null default '',
  peaks       smallint[] not null default '{}',
  path        text not null default '',
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);

-- Droits d'accès pour les utilisateurs connectés (les règles ci-dessous limitent chacun à ses données)
grant select, insert, update, delete on public.ideas, public.takes to authenticated;

alter table public.ideas enable row level security;
alter table public.takes enable row level security;

drop policy if exists "ideas: mes données" on public.ideas;
create policy "ideas: mes données" on public.ideas
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "takes: mes données" on public.takes;
create policy "takes: mes données" on public.takes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Espace privé pour les fichiers audio
insert into storage.buckets (id, name, public)
values ('takes', 'takes', false)
on conflict (id) do nothing;

drop policy if exists "takes: mes fichiers" on storage.objects;
create policy "takes: mes fichiers" on storage.objects
  for all to authenticated
  using (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text);
