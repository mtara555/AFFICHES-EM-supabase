-- ============================================================================
-- AFFICHES-EM v1.0 — Schema Supabase
-- ----------------------------------------------------------------------------
-- A coller dans Supabase > SQL Editor > New query, puis « Run ».
-- Le script est relancable : il ne detruit rien.
--
-- Les identifiants sont des textes (et non des uuid) pour que la migration
-- depuis Appwrite puisse conserver les anciens identifiants : un logo reste
-- « logo_<idMarque> » et les affiches gardent leur lien avec leur campagne.
--
-- Roles : table `profiles` (administrateur / operateur / aucun). La securite
-- est appliquee par PostgreSQL (RLS), jamais par l'interface.
-- ============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Profils et roles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nom        text not null default '',
  role       text not null default 'aucun'
             check (role in ('administrateur', 'operateur', 'aucun')),
  created_at timestamptz not null default now()
);

-- Cree le profil automatiquement a l'inscription d'un compte (role « aucun » :
-- un administrateur doit attribuer le role).
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nom)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists sur_creation_compte on auth.users;
create trigger sur_creation_compte
  after insert on auth.users
  for each row execute function public.creer_profil();

-- Fonctions de role. SECURITY DEFINER : elles lisent `profiles` sans declencher
-- recursivement les regles de cette table.
create or replace function public.est_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'administrateur');
$$;

create or replace function public.est_operateur()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('administrateur', 'operateur')
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.marques (
  id           text primary key default gen_random_uuid()::text,
  nom          text not null unique,
  logo_file_id text,
  actif        boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.articles (
  id                         text primary key default gen_random_uuid()::text,
  ean                        text not null unique,
  marque_id                  text not null,
  designation                text not null,
  reference                  text not null default '',
  categorie                  text not null,
  photo_file_id              text,
  picto1                     text not null default '',
  picto2                     text not null default '',
  picto3                     text not null default '',
  picto4                     text not null default '',
  picto5                     text not null default '',
  picto6                     text not null default '',
  livraison_gratuite_exclue  boolean not null default false,
  actif                      boolean not null default true,
  created_at                 timestamptz not null default now()
);
create index if not exists idx_articles_marque on public.articles (marque_id);
create index if not exists idx_articles_categorie on public.articles (categorie);
create index if not exists idx_articles_designation on public.articles
  using gin (designation gin_trgm_ops);

create table if not exists public.campagnes (
  id         text primary key default gen_random_uuid()::text,
  nom        text not null,
  statut     text not null default 'brouillon'
             check (statut in ('brouillon', 'validee', 'imprimee', 'archivee')),
  gabarit    text,
  date_debut timestamptz,
  date_fin   timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_campagnes_auteur on public.campagnes (created_by);

-- La suppression d'une campagne emporte ses affiches (cascade assuree par la base).
create table if not exists public.affiches (
  id                   text primary key default gen_random_uuid()::text,
  campagne_id          text not null references public.campagnes (id) on delete cascade,
  ean                  text not null,
  prix_barre           numeric(12, 2) not null default 0,
  prix_principal       numeric(12, 2) not null,
  format               text not null default 'A4',
  stock_limite         boolean not null default false,
  nouveaute            boolean not null default false,
  promotion            boolean not null default false,
  mentions             text not null default '',
  visuel_fond_file_id  text,
  ordre                integer not null default 0,
  created_by           uuid not null default auth.uid(),
  created_at           timestamptz not null default now()
);
create index if not exists idx_affiches_campagne on public.affiches (campagne_id, ordre);
create index if not exists idx_affiches_creation on public.affiches (created_at);

create table if not exists public.parametres (
  id          text primary key default gen_random_uuid()::text,
  cle         text not null unique,
  valeur      text not null,
  description text
);

create table if not exists public.journal (
  id          text primary key default gen_random_uuid()::text,
  action      text not null,
  ressource   text not null,
  user_id     uuid not null default auth.uid(),
  utilisateur text,
  appareil    text,
  avant       text,
  apres       text,
  date        timestamptz not null default now()
);
create index if not exists idx_journal_date on public.journal (date desc);

create table if not exists public.demandes_article (
  id          text primary key default gen_random_uuid()::text,
  ean         text not null,
  demandeur   uuid not null default auth.uid(),
  commentaire text,
  statut      text not null default 'en_attente'
              check (statut in ('en_attente', 'traitee', 'rejetee')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_demandes_statut on public.demandes_article (statut);

-- ---------------------------------------------------------------------------
-- Securite par ligne (RLS)
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.marques           enable row level security;
alter table public.articles          enable row level security;
alter table public.campagnes         enable row level security;
alter table public.affiches          enable row level security;
alter table public.parametres        enable row level security;
alter table public.journal           enable row level security;
alter table public.demandes_article  enable row level security;

-- Profils : chacun lit le sien, les administrateurs lisent et modifient tout.
drop policy if exists profiles_lecture on public.profiles;
create policy profiles_lecture on public.profiles
  for select to authenticated using (id = auth.uid() or public.est_admin());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles
  for update to authenticated using (public.est_admin()) with check (public.est_admin());

-- Tables de reference : lecture operateurs + administrateurs, ecriture administrateurs.
do $$
declare t text;
begin
  foreach t in array array['marques', 'articles', 'parametres'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.est_operateur())',
      t || '_lecture', t);
    execute format('drop policy if exists %I on public.%I', t || '_ecriture', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.est_admin()) with check (public.est_admin())',
      t || '_ecriture', t);
  end loop;
end $$;

-- Campagnes : chacun voit et modifie les siennes ; les administrateurs voient tout.
drop policy if exists campagnes_acces on public.campagnes;
create policy campagnes_acces on public.campagnes
  for select to authenticated using (created_by = auth.uid() or public.est_admin());
drop policy if exists campagnes_creation on public.campagnes;
create policy campagnes_creation on public.campagnes
  for insert to authenticated with check (public.est_operateur() and created_by = auth.uid());
drop policy if exists campagnes_modif on public.campagnes;
create policy campagnes_modif on public.campagnes
  for update to authenticated
  using (created_by = auth.uid() or public.est_admin())
  with check (created_by = auth.uid() or public.est_admin());
drop policy if exists campagnes_suppr on public.campagnes;
create policy campagnes_suppr on public.campagnes
  for delete to authenticated using (created_by = auth.uid() or public.est_admin());

-- Affiches : meme regle que les campagnes.
drop policy if exists affiches_acces on public.affiches;
create policy affiches_acces on public.affiches
  for select to authenticated using (created_by = auth.uid() or public.est_admin());
drop policy if exists affiches_creation on public.affiches;
create policy affiches_creation on public.affiches
  for insert to authenticated with check (public.est_operateur() and created_by = auth.uid());
drop policy if exists affiches_modif on public.affiches;
create policy affiches_modif on public.affiches
  for update to authenticated
  using (created_by = auth.uid() or public.est_admin())
  with check (created_by = auth.uid() or public.est_admin());
drop policy if exists affiches_suppr on public.affiches;
create policy affiches_suppr on public.affiches
  for delete to authenticated using (created_by = auth.uid() or public.est_admin());

-- Journal : ajout par tous les roles (sous son propre identifiant), lecture admin.
-- Aucune politique update/delete : personne ne peut modifier ni effacer une trace.
drop policy if exists journal_ajout on public.journal;
create policy journal_ajout on public.journal
  for insert to authenticated with check (public.est_operateur() and user_id = auth.uid());
drop policy if exists journal_lecture on public.journal;
create policy journal_lecture on public.journal
  for select to authenticated using (public.est_admin());

-- Demandes d'article : creation par tous les roles, lecture de ses demandes
-- (administrateurs : toutes), modification administrateurs.
drop policy if exists demandes_creation on public.demandes_article;
create policy demandes_creation on public.demandes_article
  for insert to authenticated with check (public.est_operateur() and demandeur = auth.uid());
drop policy if exists demandes_lecture on public.demandes_article;
create policy demandes_lecture on public.demandes_article
  for select to authenticated using (demandeur = auth.uid() or public.est_admin());
drop policy if exists demandes_modif on public.demandes_article;
create policy demandes_modif on public.demandes_article
  for update to authenticated using (public.est_admin()) with check (public.est_admin());

-- ---------------------------------------------------------------------------
-- Stockage des visuels : bucket prive « medias »
-- Lecture operateurs + administrateurs, ecriture administrateurs.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medias', 'medias', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists medias_lecture on storage.objects;
create policy medias_lecture on storage.objects
  for select to authenticated using (bucket_id = 'medias' and public.est_operateur());
drop policy if exists medias_ajout on storage.objects;
create policy medias_ajout on storage.objects
  for insert to authenticated with check (bucket_id = 'medias' and public.est_admin());
drop policy if exists medias_modif on storage.objects;
create policy medias_modif on storage.objects
  for update to authenticated
  using (bucket_id = 'medias' and public.est_admin())
  with check (bucket_id = 'medias' and public.est_admin());
drop policy if exists medias_suppr on storage.objects;
create policy medias_suppr on storage.objects
  for delete to authenticated using (bucket_id = 'medias' and public.est_admin());

-- ---------------------------------------------------------------------------
-- Premier administrateur
-- ---------------------------------------------------------------------------
-- 1. Authentication > Users > Add user (e-mail + mot de passe, « Auto confirm »).
-- 2. Puis, en remplacant l'adresse :
--
--    update public.profiles set role = 'administrateur'
--    where id = (select id from auth.users where email = 'vous@exemple.com');
