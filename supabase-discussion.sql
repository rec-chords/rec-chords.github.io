-- Rec. : discussion par idée, dans les groupes.
-- À exécuter une fois dans Supabase > SQL Editor, après supabase-groupes.sql. Peut être relancé sans risque.
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.ideas on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  author      text not null default '',
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists comments_idea on public.comments (idea_id, created_at);

-- On lit, on écrit, on efface. Un message ne se modifie pas.
revoke all on public.comments from anon, authenticated;
grant select, insert, delete on public.comments to authenticated;
alter table public.comments enable row level security;

-- Voir : ceux qui voient l'idée. Écrire : pareil, et seulement en son propre nom.
-- Effacer : l'auteur du message, ou l'admin du groupe.
drop policy if exists "comments: voir" on public.comments;
create policy "comments: voir" on public.comments for select to authenticated
  using (public.can_see_idea(idea_id));
drop policy if exists "comments: écrire" on public.comments;
create policy "comments: écrire" on public.comments for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_idea(idea_id));
drop policy if exists "comments: effacer" on public.comments;
create policy "comments: effacer" on public.comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(public.idea_group(idea_id)));
