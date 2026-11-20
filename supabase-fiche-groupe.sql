-- Rec. : fiche du groupe (une image et un mémo de présentation).
-- À exécuter une fois dans Supabase, SQL Editor. Peut être relancé sans risque.

alter table public.groups add column if not exists memo text not null default '';
alter table public.groups add column if not exists cover text not null default '';
alter table public.groups drop constraint if exists groups_memo_size;
alter table public.groups add constraint groups_memo_size check (char_length(memo) <= 4000);
alter table public.groups drop constraint if exists groups_cover_size;
alter table public.groups add constraint groups_cover_size check (char_length(cover) <= 200000);

-- Le reste de la fiche (style, ville, line-up, besoins sur scène, contact) : un objet libre, que l'appli remplit.
alter table public.groups add column if not exists profile jsonb not null default '{}'::jsonb;
alter table public.groups drop constraint if exists groups_profile_size;
alter table public.groups add constraint groups_profile_size check (jsonb_typeof(profile) = 'object' and char_length(profile::text) <= 20000);

-- Seul l'admin peut renommer le groupe, mais tout membre peut tenir la fiche à jour : on passe par une fonction.
drop function if exists public.set_group_profile(uuid, text, text);
create or replace function public.set_group_profile(gid uuid, new_memo text, new_cover text, new_profile jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(gid) then raise exception 'Réservé aux membres du groupe'; end if;
  update public.groups set memo = coalesce(new_memo, ''), cover = coalesce(new_cover, ''), profile = coalesce(new_profile, '{}'::jsonb) where id = gid;
end;
$$;
revoke all on function public.set_group_profile(uuid, text, text, jsonb) from public, anon;
grant execute on function public.set_group_profile(uuid, text, text, jsonb) to authenticated;
