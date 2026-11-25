-- Rec. : morceaux à écouter sur la page publique d'un groupe.
-- À exécuter une fois dans Supabase, SQL Editor, après supabase-book.sql. Peut être relancé sans risque.
--
-- Le groupe choisit quelques prises dans son book : profile.page.tracks = [{ "take": "<id>", "title": "…" }, …].
-- Rien d'autre ne devient public. Une prise n'est écoutable par tous que si les trois conditions sont réunies :
--   1. le groupe a ouvert sa page publique ;
--   2. la prise est dans la liste du book ;
--   3. la prise appartient bien à un morceau de ce groupe.
-- Retirer la prise de la liste, ou fermer la page, coupe l'accès aussitôt.

create or replace function public.is_public_take(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from takes t
    join ideas i on i.id = t.idea_id
    join groups g on g.id = i.group_id
    where t.path = obj and t.path <> '' and split_part(t.path, '/', 1) = t.user_id::text and g.public_slug is not null
      and exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(g.profile->'page'->'tracks') = 'array' then g.profile->'page'->'tracks' else '[]'::jsonb end) x
        where x->>'take' = t.id::text));
$$;
revoke execute on function public.is_public_take(text) from public;
grant execute on function public.is_public_take(text) to anon, authenticated;

-- Le fichier audio lui-même : lecture seule, et seulement pour ces prises-là.
drop policy if exists "takes: écoute publique" on storage.objects;
create policy "takes: écoute publique" on storage.objects for select to anon, authenticated
  using (bucket_id = 'takes' and public.is_public_take(name));

-- La liste d'écoute, dans l'ordre choisi par le groupe : titre, durée, forme d'onde, coupe, et le fichier à lire.
create or replace function public.public_tracks(slug text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
      'id', t.id,
      'title', coalesce(nullif(trim(x.item->>'title'), ''), nullif(trim(i.title), ''), nullif(trim(t.title), ''), 'Sans titre'),
      'duration', t.duration, 'peaks', t.peaks, 'trim_a', t.trim_a, 'trim_b', t.trim_b, 'path', t.path, 'mime', t.mime,
      'date', t.created_at, 'stage', i.stage)
    order by x.n), '[]'::json)
  from groups g
  cross join lateral jsonb_array_elements(case when jsonb_typeof(g.profile->'page'->'tracks') = 'array' then g.profile->'page'->'tracks' else '[]'::jsonb end) with ordinality as x(item, n)
  join takes t on t.id::text = x.item->>'take'
  join ideas i on i.id = t.idea_id and i.group_id = g.id
  where slug is not null and trim(slug) <> '' and g.public_slug = lower(trim(slug)) and t.path <> '' and x.n <= 6;
$$;
revoke execute on function public.public_tracks(text) from public;
grant execute on function public.public_tracks(text) to anon, authenticated;
