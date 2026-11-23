-- Le stade d'un morceau : 'idea' (par défaut), 'compo' ou 'rehearsal'.
alter table public.ideas add column if not exists stage text;
