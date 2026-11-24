-- Rec. : page publique d'un groupe (présentation visible sans compte).
-- À exécuter une fois dans Supabase, SQL Editor, après supabase-fiche-groupe.sql. Peut être relancé sans risque.

-- L'adresse de la page. Vide = pas de page publique (c'est le cas par défaut).
alter table public.groups add column if not exists public_slug text;
create unique index if not exists groups_public_slug_key on public.groups (public_slug) where public_slug is not null;
alter table public.groups drop constraint if exists groups_public_slug_form;
alter table public.groups add constraint groups_public_slug_form check (public_slug is null or public_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

-- Seul l'admin du groupe ouvre ou ferme la page. Une adresse vide la ferme.
create or replace function public.set_group_public(gid uuid, slug text) returns text
language plpgsql security definer set search_path = public as $$
declare s text := nullif(lower(trim(coalesce(slug, ''))), '');
begin
  if not public.is_admin(gid) then raise exception 'Réservé à l''admin du groupe'; end if;
  if s is not null and s !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'Adresse invalide : 3 à 40 lettres, chiffres ou tirets'; end if;
  if s is not null and exists (select 1 from groups where public_slug = s and id <> gid) then raise exception 'Cette adresse est déjà prise'; end if;
  update public.groups set public_slug = s where id = gid;
  return s;
end;
$$;
revoke all on function public.set_group_public(uuid, text) from public, anon;
grant execute on function public.set_group_public(uuid, text) to authenticated;

-- Ce que tout le monde peut lire, et seulement pour un groupe qui a ouvert sa page :
-- nom, image, description, style, ville, line-up (prénom et instrument), liens, réglages de la page.
-- Jamais le téléphone, l'e-mail, le contact, la technique, ni aucun enregistrement.
create or replace function public.public_band(slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', g.name, 'cover', g.cover, 'memo', g.memo,
    'style', g.profile->>'style', 'city', g.profile->>'city', 'links', g.profile->>'links',
    'page', coalesce(g.profile->'page', '{}'::jsonb),
    'lineup', (select coalesce(json_agg(json_build_object('name', m->>'name', 'inst', m->>'inst')), '[]'::json)
               from jsonb_array_elements(case when jsonb_typeof(g.profile->'lineup') = 'array' then g.profile->'lineup' else '[]'::jsonb end) m))
  from groups g
  where slug is not null and trim(slug) <> '' and g.public_slug = lower(trim(slug));
$$;
revoke execute on function public.public_band(text) from public;
grant execute on function public.public_band(text) to anon, authenticated;
