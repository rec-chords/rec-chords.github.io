-- Rec. : setlists. Une liste ordonnée de morceaux pour un concert ou une répète.
-- À exécuter une fois dans Supabase, SQL Editor. Peut être relancé sans risque.

create table if not exists public.setlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id    uuid references public.groups (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  note        text not null default '' check (char_length(note) <= 200),
  -- Les identifiants des morceaux, dans l'ordre. Un morceau supprimé est simplement ignoré par l'appli.
  items       jsonb not null default '[]'::jsonb
              check (case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) <= 200 else false end),
  created_at  timestamptz not null default now()
);
create index if not exists setlists_group_idx on public.setlists (group_id);

drop trigger if exists keep_owner on public.setlists;
create trigger keep_owner before update on public.setlists for each row execute function public.keep_owner();

grant select, insert, update, delete on public.setlists to authenticated;
alter table public.setlists enable row level security;

drop policy if exists "setlists: voir" on public.setlists;
create policy "setlists: voir" on public.setlists for select to authenticated
  using ((group_id is null and user_id = auth.uid()) or public.is_member(group_id));
drop policy if exists "setlists: créer" on public.setlists;
create policy "setlists: créer" on public.setlists for insert to authenticated
  with check (user_id = auth.uid() and (group_id is null or public.is_member(group_id)));
-- Tout membre peut modifier une setlist du groupe ; elle ne change pas de groupe.
drop policy if exists "setlists: modifier" on public.setlists;
create policy "setlists: modifier" on public.setlists for update to authenticated
  using ((group_id is null and user_id = auth.uid()) or public.is_member(group_id))
  with check ((group_id is null and user_id = auth.uid()) or public.is_member(group_id));
drop policy if exists "setlists: supprimer" on public.setlists;
create policy "setlists: supprimer" on public.setlists for delete to authenticated
  using ((group_id is null and user_id = auth.uid()) or (group_id is not null and (user_id = auth.uid() and public.is_member(group_id) or public.is_admin(group_id))));
