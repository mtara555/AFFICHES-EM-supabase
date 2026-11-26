/**
 * AFFICHES-EM v1.0 — Statistiques du tableau de bord
 *
 * Deux lectures volumineuses, faites une seule fois a l'ouverture :
 * - les articles, reduits aux trois colonnes utiles (code, marque, categorie) ;
 * - les affiches, avec leur date de creation.
 * Les regroupements (par marque, par gabarit, par periode) sont ensuite
 * calcules dans le navigateur, sans nouvelle requete quand on change de periode.
 *
 * Perimetre : la base applique les droits ligne par ligne (RLS). Un
 * administrateur voit toutes les affiches ; un operateur ne voit que les
 * siennes. Les chiffres affiches respectent donc toujours ces droits.
 */

import { supabase, TABLES, TAILLE_PAGE, verifier } from './supabase';
import { compterLignes, ecrireCache, lectureEconome, lireCache } from './cache-local';
import { gabaritPourCategorie, type Gabarit } from '../config/gabarits';
import type { CategorieProduit } from '../config/constants';

/**
 * Lit toutes les lignes d'une table, page par page.
 * @param colonnes colonnes a lire (reduit le volume transfere)
 * @param ordre colonne de tri, indispensable pour une pagination stable
 * @param apres ne garder que les lignes dont `ordre` est strictement superieur a cette valeur
 */
async function toutLire<T>(
  table: string,
  colonnes: string,
  ordre: string,
  apres?: string,
): Promise<T[]> {
  const resultat: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    let requete = supabase
      .from(table)
      .select(colonnes)
      .order(ordre, { ascending: true })
      .order('id', { ascending: true })
      .range(debut, debut + TAILLE_PAGE - 1);
    if (apres) requete = requete.gt(ordre, apres);
    const lignes = verifier(await requete) as T[];
    resultat.push(...lignes);
    if (lignes.length < TAILLE_PAGE) break;
  }
  return resultat;
}

export interface ArticleResume {
  readonly ean: string;
  readonly marqueId: string;
  readonly gabarit: Gabarit;
}

export interface AfficheResume {
  readonly date: Date;
  readonly ean: string;
  /** null si le code n'existe plus dans le catalogue. */
  readonly gabarit: Gabarit | null;
  /** null si le code n'existe plus dans le catalogue. */
  readonly marqueId: string | null;
}

interface LigneArticleResume {
  ean: string;
  marque_id: string;
  categorie: CategorieProduit;
}

interface LigneAfficheResume {
  ean: string;
  created_at: string;
}

/**
 * Articles reduits a 3 colonnes. Garde en cache dans le navigateur : relu
 * seulement si le nombre d'articles a change (1 lecture au lieu de 2 400).
 */
export async function chargerArticlesResume(forcer = false): Promise<ArticleResume[]> {
  const lignes = await lectureEconome<LigneArticleResume[]>({
    cle: 'articles-resume',
    table: TABLES.ARTICLES,
    forcer,
    ageMaxHeures: 24 * 7,
    lireTout: () => toutLire<LigneArticleResume>(TABLES.ARTICLES, 'ean, marque_id, categorie', 'id'),
  });
  return lignes.map((l) => ({
    ean: l.ean,
    marqueId: l.marque_id,
    gabarit: gabaritPourCategorie(l.categorie),
  }));
}

/**
 * Affiches (code + date). Le cache est complete par les seules affiches
 * creees depuis la derniere visite ; relecture complete si des affiches ont
 * ete supprimees ou si le cache a plus de 7 jours.
 * @param cleUtilisateur les droits different selon l'utilisateur : un cache par compte.
 */
export async function chargerAffichesResume(
  articles: readonly ArticleResume[],
  cleUtilisateur: string,
  forcer = false,
): Promise<AfficheResume[]> {
  const cle = `affiches-resume.${cleUtilisateur}`;
  const cache = forcer ? null : lireCache<LigneAfficheResume[]>(cle);
  let lignes: LigneAfficheResume[] | null = null;

  if (cache && Date.now() - cache.date < 7 * 24 * 3600_000 && cache.donnees.length > 0) {
    const derniere = cache.donnees[cache.donnees.length - 1]!.created_at;
    const nouvelles = await toutLire<LigneAfficheResume>(
      TABLES.AFFICHES,
      'ean, created_at',
      'created_at',
      derniere,
    );
    const total = await compterLignes(TABLES.AFFICHES);
    if (cache.donnees.length + nouvelles.length === total) lignes = [...cache.donnees, ...nouvelles];
  }

  if (!lignes) {
    lignes = await toutLire<LigneAfficheResume>(TABLES.AFFICHES, 'ean, created_at', 'created_at');
  }
  ecrireCache(cle, lignes.length, lignes);

  const articleParEan = new Map(articles.map((a) => [a.ean, a]));
  return lignes.map((l) => {
    const article = articleParEan.get(l.ean);
    return {
      date: new Date(l.created_at),
      ean: l.ean,
      gabarit: article?.gabarit ?? null,
      marqueId: article?.marqueId ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Regroupement par periode                                                    */
/* -------------------------------------------------------------------------- */

export type Periode = 'jour' | 'semaine' | 'mois' | 'annee';

export const LIBELLE_PERIODE: Readonly<Record<Periode, string>> = {
  jour: 'Jour',
  semaine: 'Semaine',
  mois: 'Mois',
  annee: 'Annee',
};

/** Etendue affichee pour chaque periode. */
export const ETENDUE_PERIODE: Readonly<Record<Periode, string>> = {
  jour: '30 derniers jours',
  semaine: '12 dernieres semaines',
  mois: '12 derniers mois',
  annee: 'toutes les annees',
};

export interface Intervalle {
  readonly cle: string;
  /** Libelle court de l'axe. */
  readonly libelle: string;
  /** Libelle complet de l'infobulle et du tableau. */
  readonly libelleLong: string;
  readonly debut: Date;
  readonly fin: Date;
  electro: number;
  nt: number;
}

const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ajouterJours = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Lundi de la semaine de d. */
const debutSemaine = (d: Date) => ajouterJours(debutJour(d), -((d.getDay() + 6) % 7));

/** Numero de semaine ISO 8601. */
function numeroSemaine(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', options);
const fJour = fmt({ day: '2-digit', month: '2-digit' });
const fJourLong = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fMois = fmt({ month: 'short' });
const fMoisLong = fmt({ month: 'long', year: 'numeric' });
const fCourt = fmt({ day: 'numeric', month: 'short' });

function construireIntervalles(periode: Periode, affiches: readonly AfficheResume[]): Intervalle[] {
  const maintenant = new Date();
  const liste: Intervalle[] = [];
  const vide = { electro: 0, nt: 0 };

  if (periode === 'jour') {
    const aujourdhui = debutJour(maintenant);
    for (let i = 29; i >= 0; i--) {
      const debut = ajouterJours(aujourdhui, -i);
      liste.push({
        cle: debut.toISOString(),
        libelle: fJour.format(debut),
        libelleLong: fJourLong.format(debut),
        debut,
        fin: ajouterJours(debut, 1),
        ...vide,
      });
    }
  } else if (periode === 'semaine') {
    const lundi = debutSemaine(maintenant);
    for (let i = 11; i >= 0; i--) {
      const debut = ajouterJours(lundi, -7 * i);
      const fin = ajouterJours(debut, 7);
      liste.push({
        cle: debut.toISOString(),
        libelle: `S${numeroSemaine(debut)}`,
        libelleLong: `Semaine ${numeroSemaine(debut)} — du ${fCourt.format(debut)} au ${fCourt.format(ajouterJours(fin, -1))}`,
        debut,
        fin,
        ...vide,
      });
    }
  } else if (periode === 'mois') {
    for (let i = 11; i >= 0; i--) {
      const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      liste.push({
        cle: debut.toISOString(),
        libelle: fMois.format(debut).replace('.', ''),
        libelleLong: fMoisLong.format(debut),
        debut,
        fin: new Date(debut.getFullYear(), debut.getMonth() + 1, 1),
        ...vide,
      });
    }
  } else {
    const anneeCourante = maintenant.getFullYear();
    const premiere = affiches.length > 0 ? affiches[0]!.date.getFullYear() : anneeCourante;
    const depart = Math.min(premiere, anneeCourante - 4);
    for (let a = depart; a <= anneeCourante; a++) {
      liste.push({
        cle: String(a),
        libelle: String(a),
        libelleLong: `Annee ${a}`,
        debut: new Date(a, 0, 1),
        fin: new Date(a + 1, 0, 1),
        ...vide,
      });
    }
  }
  return liste;
}

/** Compte les affiches Electro et Nouvelles technologies de chaque intervalle. */
export function regrouper(periode: Periode, affiches: readonly AfficheResume[]): Intervalle[] {
  const intervalles = construireIntervalles(periode, affiches);
  if (intervalles.length === 0) return intervalles;
  const debutTotal = intervalles[0]!.debut.getTime();
  const finTotal = intervalles[intervalles.length - 1]!.fin.getTime();

  for (const affiche of affiches) {
    if (!affiche.gabarit) continue;
    const t = affiche.date.getTime();
    if (t < debutTotal || t >= finTotal) continue;
    const cible = intervalles.find((i) => t >= i.debut.getTime() && t < i.fin.getTime());
    if (!cible) continue;
    if (affiche.gabarit === 'electro') cible.electro += 1;
    else cible.nt += 1;
  }
  return intervalles;
}

/* -------------------------------------------------------------------------- */
/* Rapport PDF : une periode choisie (jour, semaine, mois, trimestre, annee)   */
/* -------------------------------------------------------------------------- */

export type PeriodeRapport = 'jour' | 'semaine' | 'mois' | 'trimestre' | 'annee';

export const LIBELLE_PERIODE_RAPPORT: Readonly<Record<PeriodeRapport, string>> = {
  jour: 'Jour',
  semaine: 'Semaine',
  mois: 'Mois',
  trimestre: 'Trimestre',
  annee: 'Annee',
};

export interface SousIntervalle {
  readonly libelle: string;
  readonly debut: Date;
  readonly fin: Date;
}

export interface PlageRapport {
  readonly type: PeriodeRapport;
  /** Premier instant de la periode (inclus). */
  readonly debut: Date;
  /** Premier instant apres la periode (exclu). */
  readonly fin: Date;
  /** Titre lisible : « Semaine 47 — du 16 au 22 novembre 2026 ». */
  readonly libelle: string;
  /** Periode de meme nature juste avant, pour la comparaison. */
  readonly precedente: { readonly debut: Date; readonly fin: Date };
  /** Nom de la colonne du detail : Heure, Jour ou Mois. */
  readonly colonne: string;
  readonly sousIntervalles: readonly SousIntervalle[];
}

const fMoisSeul = fmt({ month: 'long' });
const fMoisCourt = fmt({ month: 'short' });
const fJourCourt = fmt({ weekday: 'short', day: '2-digit', month: '2-digit' });
const fJourMois = fmt({ day: 'numeric', month: 'long' });

const premiereMajuscule = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function sousIntervallesParMois(annee: number, premierMois: number, nombre: number): SousIntervalle[] {
  const liste: SousIntervalle[] = [];
  for (let i = 0; i < nombre; i++) {
    const debut = new Date(annee, premierMois + i, 1);
    liste.push({
      libelle: nombre > 3 ? fMoisCourt.format(debut).replace('.', '') : premiereMajuscule(fMoisSeul.format(debut)),
      debut,
      fin: new Date(annee, premierMois + i + 1, 1),
    });
  }
  return liste;
}

/**
 * Calcule la periode du rapport qui CONTIENT la date de reference :
 * le jour, la semaine (du lundi au dimanche), le mois, le trimestre civil
 * ou l'annee de cette date.
 */
export function calculerPlage(type: PeriodeRapport, reference: Date): PlageRapport {
  const jour = debutJour(reference);

  if (type === 'jour') {
    const debut = jour;
    const fin = ajouterJours(debut, 1);
    const sous: SousIntervalle[] = [];
    for (let h = 0; h < 24; h++) {
      sous.push({
        libelle: `${String(h).padStart(2, '0')}h`,
        debut: new Date(debut.getFullYear(), debut.getMonth(), debut.getDate(), h),
        fin: new Date(debut.getFullYear(), debut.getMonth(), debut.getDate(), h + 1),
      });
    }
    return {
      type,
      debut,
      fin,
      libelle: premiereMajuscule(fJourLong.format(debut)),
      precedente: { debut: ajouterJours(debut, -1), fin: debut },
      colonne: 'Heure',
      sousIntervalles: sous,
    };
  }

  if (type === 'semaine') {
    const debut = debutSemaine(jour);
    const fin = ajouterJours(debut, 7);
    const dernier = ajouterJours(fin, -1);
    const sous: SousIntervalle[] = [];
    for (let i = 0; i < 7; i++) {
      const d = ajouterJours(debut, i);
      sous.push({
        libelle: premiereMajuscule(fJourCourt.format(d).replace('.', '')),
        debut: d,
        fin: ajouterJours(d, 1),
      });
    }
    return {
      type,
      debut,
      fin,
      libelle: `Semaine ${numeroSemaine(debut)} — du ${fJourMois.format(debut)} au ${fJourLong.format(dernier)}`,
      precedente: { debut: ajouterJours(debut, -7), fin: debut },
      colonne: 'Jour',
      sousIntervalles: sous,
    };
  }

  if (type === 'mois') {
    const debut = new Date(jour.getFullYear(), jour.getMonth(), 1);
    const fin = new Date(jour.getFullYear(), jour.getMonth() + 1, 1);
    const sous: SousIntervalle[] = [];
    for (let d = debut; d < fin; d = ajouterJours(d, 1)) {
      sous.push({ libelle: fJour.format(d), debut: d, fin: ajouterJours(d, 1) });
    }
    return {
      type,
      debut,
      fin,
      libelle: premiereMajuscule(fMoisLong.format(debut)),
      precedente: { debut: new Date(debut.getFullYear(), debut.getMonth() - 1, 1), fin: debut },
      colonne: 'Jour',
      sousIntervalles: sous,
    };
  }

  if (type === 'trimestre') {
    const trimestre = Math.floor(jour.getMonth() / 3);
    const debut = new Date(jour.getFullYear(), trimestre * 3, 1);
    const fin = new Date(jour.getFullYear(), trimestre * 3 + 3, 1);
    const dernierMois = new Date(jour.getFullYear(), trimestre * 3 + 2, 1);
    return {
      type,
      debut,
      fin,
      libelle: `Trimestre ${trimestre + 1} ${debut.getFullYear()} — ${fMoisSeul.format(debut)} a ${fMoisSeul.format(dernierMois)}`,
      precedente: { debut: new Date(debut.getFullYear(), debut.getMonth() - 3, 1), fin: debut },
      colonne: 'Mois',
      sousIntervalles: sousIntervallesParMois(debut.getFullYear(), trimestre * 3, 3),
    };
  }

  const debut = new Date(jour.getFullYear(), 0, 1);
  return {
    type,
    debut,
    fin: new Date(jour.getFullYear() + 1, 0, 1),
    libelle: `Annee ${debut.getFullYear()}`,
    precedente: { debut: new Date(debut.getFullYear() - 1, 0, 1), fin: debut },
    colonne: 'Mois',
    sousIntervalles: sousIntervallesParMois(debut.getFullYear(), 0, 12),
  };
}

/** Compte les affiches Electro / Nouvelles technologies creees dans [debut, fin[. */
export function compterAffiches(
  affiches: readonly AfficheResume[],
  debut: Date,
  fin: Date,
): { electro: number; nt: number; total: number } {
  const d = debut.getTime();
  const f = fin.getTime();
  let electro = 0;
  let nt = 0;
  for (const a of affiches) {
    if (!a.gabarit) continue;
    const t = a.date.getTime();
    if (t < d || t >= f) continue;
    if (a.gabarit === 'electro') electro += 1;
    else nt += 1;
  }
  return { electro, nt, total: electro + nt };
}
