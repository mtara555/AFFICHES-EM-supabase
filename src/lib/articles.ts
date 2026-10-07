/**
 * AFFICHES-EM v1.0 — Acces aux donnees « articles »
 *
 * Les six emplacements de pictogrammes sont generiques : leur sens depend de la
 * famille de produit, pas de leur position. C'est le fonctionnement reel du
 * catalogue existant, ou l'emplacement 5 porte tantot une duree de garantie,
 * tantot une couleur. Le modele ne cherche donc pas a leur imposer une
 * semantique, mais preserve leur ordre, qui compte a l'affichage.
 */

import { supabase, TABLES, TAILLE_PAGE, verifier, estDoublon, estDroitsRefuses, messageErreurGenerique } from './supabase';
import type { CategorieProduit } from '../config/constants';

/** Nombre d'emplacements de pictogrammes par article. */
export const NB_PICTOS = 6;

export interface Article {
  readonly id: string;
  readonly ean: string;
  readonly marqueId: string;
  readonly designation: string;
  readonly reference: string;
  readonly categorie: CategorieProduit;
  readonly photoFileId: string | null;
  /** Six emplacements ordonnes ; une chaine vide signifie « emplacement libre ». */
  readonly pictos: readonly string[];
  readonly livraisonGratuiteExclue: boolean;
  readonly actif: boolean;
}

export interface SaisieArticle {
  ean: string;
  marqueId: string;
  designation: string;
  reference: string;
  categorie: CategorieProduit;
  pictos: string[];
  livraisonGratuiteExclue: boolean;
  actif: boolean;
}

/** Forme d'une ligne de la table `articles`. */
interface LigneArticle {
  id: string;
  ean: string;
  marque_id: string;
  designation: string;
  reference: string | null;
  categorie: CategorieProduit;
  photo_file_id: string | null;
  picto1: string | null;
  picto2: string | null;
  picto3: string | null;
  picto4: string | null;
  picto5: string | null;
  picto6: string | null;
  livraison_gratuite_exclue: boolean | null;
  actif: boolean | null;
}

const COLONNES =
  'id, ean, marque_id, designation, reference, categorie, photo_file_id, picto1, picto2, picto3, picto4, picto5, picto6, livraison_gratuite_exclue, actif';

function versArticle(ligne: LigneArticle): Article {
  return {
    id: ligne.id,
    ean: ligne.ean,
    marqueId: ligne.marque_id,
    designation: ligne.designation,
    reference: ligne.reference ?? '',
    categorie: ligne.categorie,
    photoFileId: ligne.photo_file_id ?? null,
    pictos: [
      ligne.picto1 ?? '',
      ligne.picto2 ?? '',
      ligne.picto3 ?? '',
      ligne.picto4 ?? '',
      ligne.picto5 ?? '',
      ligne.picto6 ?? '',
    ],
    livraisonGratuiteExclue: ligne.livraison_gratuite_exclue ?? false,
    actif: ligne.actif ?? true,
  };
}

/** Convertit la saisie en colonnes de la table (emplacements de pictogrammes a plat). */
function versDonnees(saisie: SaisieArticle): Record<string, unknown> {
  const donnees: Record<string, unknown> = {
    ean: saisie.ean.trim(),
    marque_id: saisie.marqueId,
    designation: saisie.designation.trim(),
    reference: saisie.reference.trim(),
    categorie: saisie.categorie,
    livraison_gratuite_exclue: saisie.livraisonGratuiteExclue,
    actif: saisie.actif,
  };
  for (let i = 0; i < NB_PICTOS; i++) {
    donnees[`picto${i + 1}`] = (saisie.pictos[i] ?? '').trim();
  }
  return donnees;
}

export interface PageArticles {
  readonly articles: Article[];
  readonly total: number;
}

export interface FiltresArticles {
  readonly recherche?: string;
  readonly marqueId?: string;
  readonly categorie?: CategorieProduit;
  readonly page?: number;
  readonly parPage?: number;
}

/** Echappe les caracteres speciaux d'un motif LIKE / ILIKE. */
const echapper = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Liste paginee des articles.
 *
 * Le catalogue reel compte environ 2 400 references : la pagination reste
 * utile pour garder l'ecran reactif.
 *
 * La recherche porte sur le code (`ean`) si le terme ressemble a un code, sinon
 * sur la designation : chaque mot saisi doit y figurer, dans n'importe quel
 * ordre. Cela evite a l'operateur d'avoir a choisir un mode de recherche.
 */
export async function listerArticles(filtres: FiltresArticles = {}): Promise<PageArticles> {
  const parPage = filtres.parPage ?? 25;
  const page = filtres.page ?? 0;

  let requete = supabase
    .from(TABLES.ARTICLES)
    .select(COLONNES, { count: 'exact' })
    .order('designation', { ascending: true })
    .order('id', { ascending: true })
    .range(page * parPage, page * parPage + parPage - 1);

  const terme = filtres.recherche?.trim() ?? '';
  if (terme) {
    if (/^\d{4,}$/.test(terme)) {
      requete = requete.like('ean', `${echapper(terme)}%`);
    } else {
      for (const mot of terme.split(/\s+/).filter(Boolean)) {
        requete = requete.ilike('designation', `%${echapper(mot)}%`);
      }
    }
  }

  if (filtres.marqueId) requete = requete.eq('marque_id', filtres.marqueId);
  if (filtres.categorie) requete = requete.eq('categorie', filtres.categorie);

  const reponse = await requete;
  const lignes = verifier(reponse) as LigneArticle[];
  return {
    articles: lignes.map(versArticle),
    total: reponse.count ?? lignes.length,
  };
}

/** Recherche un article par son code exact. Renvoie null s'il n'existe pas. */
export async function trouverParEan(ean: string): Promise<Article | null> {
  const lignes = verifier(
    await supabase.from(TABLES.ARTICLES).select(COLONNES).eq('ean', ean.trim()).limit(1),
  ) as LigneArticle[];
  const premiere = lignes[0];
  return premiere ? versArticle(premiere) : null;
}

/**
 * Tous les codes deja presents au catalogue, lus par pages de 500 et reduits a
 * la seule colonne `ean`. Sert a l'import pour ne pas renvoyer a la base des
 * articles qu'elle refuserait de toute facon.
 */
export async function listerTousLesCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const lignes = verifier(
      await supabase
        .from(TABLES.ARTICLES)
        .select('ean')
        .order('id', { ascending: true })
        .range(debut, debut + TAILLE_PAGE - 1),
    ) as { ean: string }[];
    lignes.forEach((l) => codes.add(l.ean));
    if (lignes.length < TAILLE_PAGE) break;
  }
  return codes;
}

export async function creerArticle(saisie: SaisieArticle): Promise<Article> {
  const ligne = verifier(
    await supabase.from(TABLES.ARTICLES).insert(versDonnees(saisie)).select(COLONNES).single(),
  );
  return versArticle(ligne as LigneArticle);
}

export async function modifierArticle(id: string, saisie: SaisieArticle): Promise<Article> {
  const ligne = verifier(
    await supabase.from(TABLES.ARTICLES).update(versDonnees(saisie)).eq('id', id).select(COLONNES).single(),
  );
  return versArticle(ligne as LigneArticle);
}

export async function supprimerArticle(id: string): Promise<void> {
  verifier(await supabase.from(TABLES.ARTICLES).delete().eq('id', id));
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Verifie la cle de controle d'un code EAN-13.
 *
 * Le catalogue reel contient 110 codes qui n'en sont pas (references internes
 * de 7 a 12 chiffres). Ils restent acceptes : la fonction sert a signaler une
 * anomalie probable, pas a bloquer la saisie.
 */
export function estEan13Valide(code: string): boolean {
  const c = code.trim();
  if (!/^\d{13}$/.test(c)) return false;
  let somme = 0;
  for (let i = 0; i < 12; i++) {
    somme += Number(c[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (somme % 10)) % 10 === Number(c[12]);
}

/** Renvoie la liste des problemes bloquants, vide si la saisie est valide. */
export function validerArticle(saisie: SaisieArticle): string[] {
  const problemes: string[] = [];
  if (!saisie.ean.trim()) problemes.push('Le code article est obligatoire.');
  if (!saisie.designation.trim()) problemes.push('La designation est obligatoire.');
  if (!saisie.marqueId) problemes.push('La marque est obligatoire.');
  return problemes;
}

/** Message lisible pour les erreurs les plus courantes. */
export function messageErreurArticle(erreur: unknown): string {
  if (estDoublon(erreur)) return 'Un article porte deja ce code.';
  if (estDroitsRefuses(erreur)) return "Vous n'avez pas les droits pour cette action (reservee aux administrateurs).";
  return messageErreurGenerique(erreur);
}
