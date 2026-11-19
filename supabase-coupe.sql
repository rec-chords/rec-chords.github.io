-- Rec. : coupe du début et de la fin d'une prise.
-- À exécuter une fois dans Supabase > SQL Editor. Peut être relancé sans risque.
-- Le fichier audio n'est jamais modifié : on retient seulement deux repères, en millisecondes.
alter table public.takes add column if not exists trim_a integer not null default 0; -- début gardé
alter table public.takes add column if not exists trim_b integer;                    -- fin gardée (vide = jusqu'au bout)
