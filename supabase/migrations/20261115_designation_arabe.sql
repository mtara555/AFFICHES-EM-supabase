-- ============================================================================
-- Migration : designation arabe des articles (الاسم العربي)
-- ----------------------------------------------------------------------------
-- A coller dans Supabase > SQL Editor > New query, puis « Run ».
-- Non destructive et relancable : aucune donnee existante n'est modifiee, la
-- nouvelle colonne vaut NULL pour tous les articles deja presents.
-- UTF-8 : une colonne `text` PostgreSQL stocke l'arabe nativement (pas de
-- NVARCHAR a prevoir, la base Supabase est en UTF-8).
-- ============================================================================

-- 1. Colonne sur la table des articles ---------------------------------------
alter table public.articles
  add column if not exists designation_arabe text;

-- Longueur maximale : 120 caracteres (la designation francaise n'est pas bornee,
-- mais l'affiche A4 ne peut pas porter davantage sur une ligne).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'articles_designation_arabe_longueur'
      and conrelid = 'public.articles'::regclass
  ) then
    alter table public.articles
      add constraint articles_designation_arabe_longueur
      check (designation_arabe is null or char_length(designation_arabe) <= 120);
  end if;
end $$;

-- Recherche multilingue (ilike '%mot%') : index trigramme, comme `designation`.
create index if not exists idx_articles_designation_arabe on public.articles
  using gin (designation_arabe gin_trgm_ops);

-- 2. Referentiel des designations arabes (alimente la liste deroulante) ------
create table if not exists public.designations_arabes (
  id         text primary key default gen_random_uuid()::text,
  libelle_ar text not null,
  libelle_fr text not null default '',   -- designation francaise associee (aide a la saisie)
  actif      boolean not null default true,
  created_at timestamptz not null default now(),
  constraint designations_arabes_longueur check (char_length(libelle_ar) <= 120)
);
create unique index if not exists idx_designations_arabes_libelle
  on public.designations_arabes (libelle_ar);
create index if not exists idx_designations_arabes_fr
  on public.designations_arabes (libelle_fr);
create index if not exists idx_designations_arabes_trgm
  on public.designations_arabes using gin (libelle_ar gin_trgm_ops);

alter table public.designations_arabes enable row level security;

-- Meme regle que `marques` et `articles` : lecture operateurs + administrateurs,
-- ecriture administrateurs.
drop policy if exists designations_arabes_lecture on public.designations_arabes;
create policy designations_arabes_lecture on public.designations_arabes
  for select to authenticated using (public.est_operateur());
drop policy if exists designations_arabes_ecriture on public.designations_arabes;
create policy designations_arabes_ecriture on public.designations_arabes
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- 3. (Facultatif) Amorcer le referentiel avec les valeurs deja saisies --------
-- Sans effet tant qu'aucun article n'a de designation arabe.
insert into public.designations_arabes (libelle_ar, libelle_fr)
select distinct on (designation_arabe) designation_arabe, designation
from public.articles
where designation_arabe is not null and designation_arabe <> ''
on conflict (libelle_ar) do nothing;
