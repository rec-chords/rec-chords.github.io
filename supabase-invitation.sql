-- Rec. : page d'accueil d'une invitation.
-- À exécuter une fois dans Supabase > SQL Editor, après supabase-groupes.sql. Peut être relancé sans risque.
-- Avec un code d'invitation valable, on peut lire le nom du groupe et le prénom de son admin,
-- même sans être connecté. Rien d'autre n'est visible, et sans le code on n'obtient rien.
create or replace function public.invite_info(invite_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', g.name,
    'admin', (select m.name from group_members m where m.group_id = g.id and m.role = 'admin' order by m.joined_at limit 1))
  from groups g where g.code = upper(trim(invite_code));
$$;
revoke execute on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;
