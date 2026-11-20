-- Rec. : albums (album, EP, maquette…). Un morceau est rangé dans un seul album, ou dans aucun.
-- À exécuter une fois dans Supabase, SQL Editor. Peut être relancé sans risque.

create table if not exists public.albums (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id    uuid references public.groups (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  kind        text not null default 'Album' check (char_length(kind) <= 24),
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists albums_group_idx on public.albums (group_id);

-- Supprimer un album ne supprime pas ses morceaux : ils redeviennent « sans album ».
alter table public.ideas add column if not exists album_id uuid references public.albums (id) on delete set null;
alter table public.ideas add column if not exists track double precision not null default 0;

drop trigger if exists keep_owner on public.albums;
create trigger keep_owner before update on public.albums for each row execute function public.keep_owner();

grant select, insert, update, delete on public.albums to authenticated;
alter table public.albums enable row level security;

drop policy if exists "albums: voir" on public.albums;
create policy "albums: voir" on public.albums for select to authenticated
  using ((group_id is null and user_id = auth.uid()) or public.is_member(group_id));
drop policy if exists "albums: créer" on public.albums;
create policy "albums: créer" on public.albums for insert to authenticated
  with check (user_id = auth.uid() and (group_id is null or public.is_member(group_id)));
-- Tout membre peut renommer ou réordonner un album du groupe ; il ne change pas de groupe.
drop policy if exists "albums: modifier" on public.albums;
create policy "albums: modifier" on public.albums for update to authenticated
  using ((group_id is null and user_id = auth.uid()) or public.is_member(group_id))
  with check ((group_id is null and user_id = auth.uid()) or public.is_member(group_id));
drop policy if exists "albums: supprimer" on public.albums;
create policy "albums: supprimer" on public.albums for delete to authenticated
  using ((group_id is null and user_id = auth.uid()) or (group_id is not null and (user_id = auth.uid() and public.is_member(group_id) or public.is_admin(group_id))));

-- Image de l'album : une petite vignette (réduite par l'appli), gardée dans la ligne elle-même.
alter table public.albums add column if not exists cover text not null default '';
alter table public.albums drop constraint if exists albums_cover_size;
alter table public.albums add constraint albums_cover_size check (char_length(cover) <= 200000);
