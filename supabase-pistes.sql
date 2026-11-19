-- Rec. : pistes enregistrées par-dessus une prise.
-- À exécuter une fois dans Supabase > SQL Editor. Peut être relancé sans risque.
alter table public.takes add column if not exists layer_of uuid references public.takes on delete set null;
alter table public.takes add column if not exists offset_ms integer not null default 0;
