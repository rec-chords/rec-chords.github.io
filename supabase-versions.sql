-- Rec. : versions d'une prise (un nouveau mixage qui reprend le précédent et ajoute un instrument).
-- À exécuter une fois dans Supabase > SQL Editor. Peut être relancé sans risque.
alter table public.takes add column if not exists version_of uuid references public.takes on delete set null;
