-- Rec. : groupes, rôles et instruments.
-- À exécuter une fois dans Supabase > SQL Editor, après supabase-setup.sql.
-- Peut être relancé sans risque.
--
-- Deux rôles seulement :
--   admin  : celui qui crée le groupe. Peut retirer un membre, supprimer n'importe
--            quelle prise ou idée du groupe, renommer ou supprimer le groupe.
--   member : peut écouter, enregistrer, modifier le texte et supprimer ses propres prises.

-- ---------------------------------------------------------------- Tables
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id    uuid not null references public.groups on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  role        text not null default 'member' check (role in ('admin', 'member')),
  name        text not null default '',
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Une idée sans groupe est personnelle. Si le groupe disparaît, elle redevient personnelle.
alter table public.ideas add column if not exists group_id uuid references public.groups on delete set null;
alter table public.takes add column if not exists instrument text not null default '';
alter table public.takes add column if not exists author text not null default '';

-- ---------------------------------------------------------------- Fonctions d'aide
-- « security definer » : elles lisent les tables sans repasser par les règles,
-- ce qui évite les boucles. Elles ne répondent que pour l'utilisateur connecté.
create or replace function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select g is not null and exists (
    select 1 from group_members where group_id = g and user_id = auth.uid());
$$;

create or replace function public.is_admin(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select g is not null and exists (
    select 1 from group_members where group_id = g and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.idea_group(i uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from ideas where id = i;
$$;

create or replace function public.can_see_idea(i uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ideas where id = i and (user_id = auth.uid() or public.is_member(group_id)));
$$;

-- Fichier audio d'une prise rangée dans une idée d'un de mes groupes ?
-- Le fichier doit être dans le dossier de l'auteur de la prise : sans ça, n'importe qui pourrait déclarer une prise
-- pointant sur le fichier d'un autre et s'en ouvrir l'accès.
create or replace function public.can_read_take_file(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from takes t where t.path = obj and split_part(t.path, '/', 1) = t.user_id::text and public.is_member(public.idea_group(t.idea_id)));
$$;

create or replace function public.can_admin_take_file(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from takes t where t.path = obj and split_part(t.path, '/', 1) = t.user_id::text and public.is_admin(public.idea_group(t.idea_id)));
$$;

-- Créer un groupe : génère le code d'invitation et inscrit le créateur comme admin.
create or replace function public.create_group(group_name text, display_name text) returns json
language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  c text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if coalesce(trim(group_name), '') = '' then raise exception 'Nom du groupe manquant'; end if;
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
    into c from generate_series(1, 8);
  insert into groups (name, code, owner_id) values (trim(group_name), c, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id, role, name)
    values (g.id, auth.uid(), 'admin', coalesce(trim(display_name), ''));
  return json_build_object('id', g.id, 'code', g.code);
end;
$$;

-- Rejoindre un groupe avec son code d'invitation.
create or replace function public.join_group(invite_code text, display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into g from groups where code = upper(trim(invite_code));
  if g.id is null then raise exception 'Code inconnu'; end if;
  insert into group_members (group_id, user_id, role, name)
    values (g.id, auth.uid(), 'member', coalesce(trim(display_name), ''))
    on conflict (group_id, user_id) do update set name = excluded.name;
  return g.id;
end;
$$;

revoke execute on function public.is_member(uuid), public.is_admin(uuid), public.idea_group(uuid),
  public.can_see_idea(uuid), public.can_read_take_file(text), public.can_admin_take_file(text),
  public.create_group(text, text), public.join_group(text, text) from public, anon;
grant execute on function public.is_member(uuid), public.is_admin(uuid), public.idea_group(uuid),
  public.can_see_idea(uuid), public.can_read_take_file(text), public.can_admin_take_file(text),
  public.create_group(text, text), public.join_group(text, text) to authenticated;

-- Personne ne peut s'approprier la ligne d'un autre en changeant son propriétaire.
create or replace function public.keep_owner() returns trigger
language plpgsql as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;
drop trigger if exists keep_owner on public.ideas;
create trigger keep_owner before update on public.ideas for each row execute function public.keep_owner();
drop trigger if exists keep_owner on public.takes;
create trigger keep_owner before update on public.takes for each row execute function public.keep_owner();

-- ---------------------------------------------------------------- Droits et règles : groupes
-- On ne crée et ne rejoint un groupe que par les fonctions ci-dessus.
grant select, delete on public.groups, public.group_members to authenticated;
grant update (name) on public.groups to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "groups: voir" on public.groups;
create policy "groups: voir" on public.groups for select to authenticated
  using (public.is_member(id));
drop policy if exists "groups: renommer" on public.groups;
create policy "groups: renommer" on public.groups for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));
drop policy if exists "groups: supprimer" on public.groups;
create policy "groups: supprimer" on public.groups for delete to authenticated
  using (public.is_admin(id));

drop policy if exists "membres: voir" on public.group_members;
create policy "membres: voir" on public.group_members for select to authenticated
  using (public.is_member(group_id));
-- Un membre peut partir ; l'admin peut retirer quelqu'un.
drop policy if exists "membres: retirer" on public.group_members;
create policy "membres: retirer" on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(group_id));

-- ---------------------------------------------------------------- Règles : idées
drop policy if exists "ideas: mes données" on public.ideas;
drop policy if exists "ideas: voir" on public.ideas;
create policy "ideas: voir" on public.ideas for select to authenticated
  using (user_id = auth.uid() or public.is_member(group_id));
drop policy if exists "ideas: créer" on public.ideas;
create policy "ideas: créer" on public.ideas for insert to authenticated
  with check (user_id = auth.uid() and (group_id is null or public.is_member(group_id)));
-- Un membre peut modifier une idée du groupe, mais seul son auteur peut la sortir du groupe.
drop policy if exists "ideas: modifier" on public.ideas;
create policy "ideas: modifier" on public.ideas for update to authenticated
  using (user_id = auth.uid() or public.is_member(group_id))
  with check ((user_id = auth.uid() and group_id is null) or public.is_member(group_id));
drop policy if exists "ideas: supprimer" on public.ideas;
create policy "ideas: supprimer" on public.ideas for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(group_id));

-- ---------------------------------------------------------------- Règles : prises
drop policy if exists "takes: mes données" on public.takes;
drop policy if exists "takes: voir" on public.takes;
create policy "takes: voir" on public.takes for select to authenticated
  using (user_id = auth.uid() or public.is_member(public.idea_group(idea_id)));
drop policy if exists "takes: créer" on public.takes;
create policy "takes: créer" on public.takes for insert to authenticated
  with check (user_id = auth.uid() and (idea_id is null or public.can_see_idea(idea_id)));
drop policy if exists "takes: modifier" on public.takes;
create policy "takes: modifier" on public.takes for update to authenticated
  using (user_id = auth.uid() or public.is_member(public.idea_group(idea_id)))
  with check (user_id = auth.uid() or public.is_member(public.idea_group(idea_id)));
drop policy if exists "takes: supprimer" on public.takes;
create policy "takes: supprimer" on public.takes for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(public.idea_group(idea_id)));

-- ---------------------------------------------------------------- Règles : fichiers audio
drop policy if exists "takes: mes fichiers" on storage.objects;
drop policy if exists "takes: lire" on storage.objects;
create policy "takes: lire" on storage.objects for select to authenticated
  using (bucket_id = 'takes' and ((storage.foldername(name))[1] = auth.uid()::text or public.can_read_take_file(name)));
drop policy if exists "takes: déposer" on storage.objects;
create policy "takes: déposer" on storage.objects for insert to authenticated
  with check (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "takes: remplacer" on storage.objects;
create policy "takes: remplacer" on storage.objects for update to authenticated
  using (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "takes: effacer" on storage.objects;
create policy "takes: effacer" on storage.objects for delete to authenticated
  using (bucket_id = 'takes' and ((storage.foldername(name))[1] = auth.uid()::text or public.can_admin_take_file(name)));
