/**
 * AFFICHES-EM v1.0 — Connexion Supabase
 *
 * Le client est configure a partir des variables d'environnement Vite.
 * L'URL du projet et la cle « anon » sont publiques par conception : elles
 * figurent dans tout code client Supabase. La securite repose sur les regles
 * RLS declarees dans la base (supabase/schema.sql), jamais sur leur
 * confidentialite.
 *
 * LA CLE « service_role » NE DOIT JAMAIS FIGURER DANS CE DEPOT NI DANS LE CODE
 * DE L'APPLICATION : elle contourne toutes les regles de securite. Elle ne sert
 * qu'au script de migration, depuis un fichier .env.local non versionne.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const cleAnon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Indique si les variables d'environnement Supabase sont renseignees. */
export const estConfigure = url.length > 0 && cleAnon.length > 0;

// createClient refuse une URL vide : valeurs de remplacement quand non configure.
export const supabase = createClient(
  estConfigure ? url : 'http://localhost:54321',
  estConfigure ? cleAnon : 'non-configure',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

/**
 * Identifiants des tables, regroupes pour eviter les chaines de caracteres
 * disseminees dans le code.
 */
export const TABLES = {
  MARQUES: 'marques',
  ARTICLES: 'articles',
  CAMPAGNES: 'campagnes',
  AFFICHES: 'affiches',
  PARAMETRES: 'parametres',
  JOURNAL: 'journal',
  DEMANDES_ARTICLE: 'demandes_article',
  PROFILS: 'profiles',
} as const;

/**
 * Bucket unique regroupant tous les visuels (logos, pictogrammes, photos,
 * gabarits). La distinction se fait par un prefixe dans le nom du fichier, ce
 * qui permet de retrouver un visuel a partir de la donnee qui le porte.
 */
export const BUCKET_MEDIAS = 'medias';

/** Construit l'identifiant du logo d'une marque. */
export const idLogo = (marqueId: string) => `logo_${marqueId}`;

/** Construit l'identifiant de la photo d'un article, a partir de son EAN. */
export const idPhotoProduit = (ean: string) => `photo_${ean}`;

/**
 * Construit l'identifiant d'un pictogramme de la bibliotheque :
 * « SMART TV » devient `picto_SMART_TV`.
 */
export const idPictogramme = (code: string) =>
  `picto_${code.trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '_')}`.slice(0, 60);

/** Construit l'identifiant du visuel de fond d'une affiche. */
export const idVisuelFond = (afficheId: string) => `fond_${afficheId}`;

/** Identifiant court unique (20 caracteres hexadecimaux), utilisable dans un nom de fichier. */
export const idUnique = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 20);

/* -------------------------------------------------------------------------- */
/* Erreurs                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Erreur normalisee. `code` reprend le code PostgreSQL / PostgREST
 * (« 23505 » doublon, « 42501 » droits refuses, « PGRST301 » jeton invalide…)
 * ou, pour le stockage et l'authentification, le statut HTTP.
 */
export class ErreurBase extends Error {
  readonly code: string;
  readonly statut: number | null;

  constructor(message: string, code = '', statut: number | null = null) {
    super(message);
    this.name = 'ErreurBase';
    this.code = code;
    this.statut = statut;
  }
}

interface ErreurBrute {
  message?: string;
  code?: string | number;
  status?: number;
  statusCode?: string | number;
}

/** Convertit une erreur renvoyee par supabase-js en ErreurBase. */
export function normaliser(erreur: ErreurBrute): ErreurBase {
  const statutBrut = erreur.status ?? erreur.statusCode;
  const statut = statutBrut !== undefined && !Number.isNaN(Number(statutBrut)) ? Number(statutBrut) : null;
  return new ErreurBase(erreur.message ?? 'Erreur inconnue', String(erreur.code ?? statutBrut ?? ''), statut);
}

/**
 * Renvoie les donnees d'une reponse supabase-js, ou leve une ErreurBase.
 * Evite de tester `error` apres chaque requete.
 */
export function verifier(reponse: { data: unknown; error: ErreurBrute | null }): unknown {
  if (reponse.error) throw normaliser(reponse.error);
  return reponse.data;
}

/** Violation d'une contrainte d'unicite. */
export const estDoublon = (e: unknown): boolean =>
  e instanceof ErreurBase && (e.code === '23505' || e.statut === 409);

/** Droits insuffisants (regle RLS qui refuse l'operation). */
export const estDroitsRefuses = (e: unknown): boolean =>
  e instanceof ErreurBase &&
  (e.code === '42501' || e.statut === 403 || /row-level security|permission denied|not authorized/i.test(e.message));

/** Session absente ou expiree. */
export const estSessionExpiree = (e: unknown): boolean =>
  e instanceof ErreurBase && (e.code === 'PGRST301' || e.statut === 401 || /jwt/i.test(e.message));

/** Element introuvable. */
export const estIntrouvable = (e: unknown): boolean =>
  e instanceof ErreurBase && (e.code === 'PGRST116' || e.statut === 404 || /not found/i.test(e.message));

/** Colonne inconnue de la base (schema pas a jour). */
export const estColonneAbsente = (e: unknown, colonne: string): boolean =>
  e instanceof ErreurBase && e.message.toLowerCase().includes(colonne.toLowerCase()) &&
  (e.code === '42703' || e.code === 'PGRST204' || /column/i.test(e.message));

/** Message lisible commun aux erreurs les plus courantes. */
export function messageErreurGenerique(erreur: unknown): string {
  if (!(erreur instanceof ErreurBase)) {
    return erreur instanceof Error ? erreur.message : 'Une erreur est survenue.';
  }
  if (estSessionExpiree(erreur)) return 'Session expiree. Reconnectez-vous.';
  if (estDroitsRefuses(erreur)) return "Vous n'avez pas les droits pour cette action.";
  if (estIntrouvable(erreur)) return 'Element introuvable.';
  return erreur.message || 'Une erreur est survenue.';
}

/** Taille d'une page de lecture. Supabase plafonne par defaut a 1 000 lignes par requete. */
export const TAILLE_PAGE = 500;
