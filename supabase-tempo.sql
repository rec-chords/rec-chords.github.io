-- Rec. : tempo, tonalité et accords sur une idée.
-- À exécuter une fois dans Supabase > SQL Editor. Peut être relancé sans risque.
alter table public.ideas add column if not exists bpm smallint;
alter table public.ideas add column if not exists tona text not null default '';
alter table public.ideas add column if not exists chords text not null default '';
