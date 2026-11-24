-- Rec. : le book du groupe (photos de la page publique).
-- À exécuter une fois dans Supabase, SQL Editor, après supabase-page-publique.sql. Peut être relancé sans risque.
-- La biographie, la vidéo, les dates et le modèle vivent dans la fiche du groupe (profile.page) : rien à créer pour eux.

create table if not exists public.group_photos (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  position   int not null default 0,
  data       text not null check (char_length(data) <= 600000 and data ~ '^data:image/(jpeg|png|webp);base64,'),
  created_at timestamptz not null default now()
);
create index if not exists group_photos_group on public.group_photos (group_id, position);
alter table public.group_photos enable row level security;

-- Huit photos par groupe au plus.
create or replace function public.photo_room(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from group_photos where group_id = g) < 8;
$$;
revoke execute on function public.photo_room(uuid) from public, anon;
grant execute on function public.photo_room(uuid) to authenticated;

-- Les membres du groupe gèrent les photos.
drop policy if exists "photos: voir" on public.group_photos;
create policy "photos: voir" on public.group_photos for select to authenticated using (public.is_member(group_id));
drop policy if exists "photos: ajouter" on public.group_photos;
create policy "photos: ajouter" on public.group_photos for insert to authenticated with check (public.is_member(group_id) and public.photo_room(group_id));
drop policy if exists "photos: ranger" on public.group_photos;
create policy "photos: ranger" on public.group_photos for update to authenticated using (public.is_member(group_id)) with check (public.is_member(group_id));
drop policy if exists "photos: retirer" on public.group_photos;
create policy "photos: retirer" on public.group_photos for delete to authenticated using (public.is_member(group_id));

-- Le public ne lit les photos que d'un groupe dont la page est ouverte.
create or replace function public.public_photos(slug text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(p.data order by p.position, p.created_at), '[]'::json)
  from group_photos p join groups g on g.id = p.group_id
  where slug is not null and trim(slug) <> '' and g.public_slug = lower(trim(slug));
$$;
revoke execute on function public.public_photos(text) from public;
grant execute on function public.public_photos(text) to anon, authenticated;
