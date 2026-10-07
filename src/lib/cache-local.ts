/**
 * AFFICHES-EM v1.0 — Cache local des grosses lectures
 *
 * Supabase ne facture pas les lignes lues, mais le plan gratuit limite le
 * volume de donnees sortantes (5 Go par mois) et relire 2 400 articles a
 * chaque ouverture ralentit l'ecran. Les listes volumineuses sont donc gardees
 * dans le navigateur et ne sont relues que si elles ont change.
 *
 * Principe : pour le savoir, un simple comptage (sans transfert de lignes)
 * suffit. Si le nombre de lignes n'a pas bouge et que le cache est recent, on
 * le garde.
 */

import { supabase, verifier } from './supabase';

const PREFIXE = 'affiches-em.cache.';

interface Enveloppe<T> {
  readonly v: 1;
  readonly date: number;
  readonly total: number;
  readonly donnees: T;
}

export function lireCache<T>(cle: string): Enveloppe<T> | null {
  try {
    const texte = localStorage.getItem(PREFIXE + cle);
    if (!texte) return null;
    const e = JSON.parse(texte) as Enveloppe<T>;
    return e && e.v === 1 ? e : null;
  } catch {
    return null;
  }
}

export function ecrireCache<T>(cle: string, total: number, donnees: T): void {
  try {
    const e: Enveloppe<T> = { v: 1, date: Date.now(), total, donnees };
    localStorage.setItem(PREFIXE + cle, JSON.stringify(e));
  } catch {
    // Quota du navigateur depasse : on vide les anciens caches et on n'insiste pas.
    viderCaches();
  }
}

/** Efface tous les caches (bouton « Actualiser », deconnexion, changement d'utilisateur). */
export function viderCaches(prefixe = ''): void {
  try {
    const cles: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXE + prefixe)) cles.push(k);
    }
    cles.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* stockage indisponible */
  }
}

/** Nombre de lignes visibles d'une table, sans transferer aucune ligne. */
export async function compterLignes(table: string): Promise<number> {
  const reponse = await supabase.from(table).select('*', { count: 'exact', head: true });
  verifier(reponse);
  return reponse.count ?? 0;
}

const HEURE = 3600_000;

/**
 * Renvoie la liste depuis le cache si le nombre de lignes n'a pas change et
 * que le cache a moins de `ageMaxHeures` ; sinon relit tout avec `lireTout`.
 */
export async function lectureEconome<T>(options: {
  readonly cle: string;
  readonly table: string;
  readonly lireTout: () => Promise<T>;
  readonly ageMaxHeures?: number;
  readonly forcer?: boolean;
}): Promise<T> {
  const { cle, table, lireTout, ageMaxHeures = 24, forcer = false } = options;
  const cache = forcer ? null : lireCache<T>(cle);
  if (cache && Date.now() - cache.date < ageMaxHeures * HEURE) {
    const total = await compterLignes(table);
    if (total === cache.total) return cache.donnees;
  }
  const donnees = await lireTout();
  const total = Array.isArray(donnees) ? donnees.length : await compterLignes(table);
  ecrireCache(cle, total, donnees);
  return donnees;
}
