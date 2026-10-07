/**
 * AFFICHES-EM v1.0 — Vocabulaire du catalogue
 *
 * Lit une fois les designations et references existantes (colonnes seules,
 * par pages de 500) pour alimenter :
 * - les listes deroulantes de suggestions (designations, references par marque) ;
 * - la categorie proposee pour une designation connue ;
 * - le dictionnaire du correcteur orthographique.
 */

import { supabase, TABLES, TAILLE_PAGE, verifier } from './supabase';
import { Dictionnaire, normaliser } from './correcteur';
import { lectureEconome, viderCaches } from './cache-local';
import type { CategorieProduit } from '../config/constants';

interface LigneVocabulaire {
  designation?: string | null;
  reference?: string | null;
  marque_id?: string | null;
  categorie?: CategorieProduit | null;
}

export interface Vocabulaire {
  /** Designations correctes, de la plus frequente a la plus rare. */
  readonly designations: readonly string[];
  /** References existantes par marque (suggestions de saisie). */
  readonly referencesParMarque: ReadonlyMap<string, readonly string[]>;
  /** Categorie la plus utilisee pour chaque designation. */
  readonly categorieParDesignation: ReadonlyMap<string, CategorieProduit>;
  readonly dictionnaire: Dictionnaire;
}

let cache: Promise<Vocabulaire> | null = null;

/** Vocabulaire du catalogue (lu une seule fois par session). */
export function chargerVocabulaire(): Promise<Vocabulaire> {
  if (!cache) {
    cache = lireCatalogue().catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

/** A appeler apres creation ou modification d'un article. */
export function oublierVocabulaire(): void {
  cache = null;
  viderCaches('vocabulaire');
}

const compter = <K>(table: Map<K, number>, cle: K) => table.set(cle, (table.get(cle) ?? 0) + 1);

async function lireCatalogue(): Promise<Vocabulaire> {
  // Cache du navigateur : le catalogue n'est relu que s'il a change (un simple comptage sinon).
  const lignes = await lectureEconome<LigneVocabulaire[]>({
    cle: 'vocabulaire',
    table: TABLES.ARTICLES,
    ageMaxHeures: 24 * 7,
    lireTout: async () => {
      const tout: LigneVocabulaire[] = [];
      for (let debut = 0; ; debut += TAILLE_PAGE) {
        const page = verifier(
          await supabase
            .from(TABLES.ARTICLES)
            .select('designation, reference, marque_id, categorie')
            .order('id', { ascending: true })
            .range(debut, debut + TAILLE_PAGE - 1),
        ) as LigneVocabulaire[];
        tout.push(...page);
        if (page.length < TAILLE_PAGE) break;
      }
      return tout;
    },
  });

  // 1. Frequence des mots des designations -> dictionnaire.
  const mots = new Map<string, number>();
  const designations = new Map<string, number>();
  const categories = new Map<string, Map<CategorieProduit, number>>();
  const references = new Map<string, Set<string>>();

  for (const l of lignes) {
    const d = normaliser(l.designation ?? '').replace(/\s+/g, ' ').trim();
    if (d) {
      compter(designations, d);
      for (const m of d.match(/[A-Z]+/g) ?? []) compter(mots, m);
      if (l.categorie) {
        const parCat = categories.get(d) ?? new Map<CategorieProduit, number>();
        compter(parCat, l.categorie);
        categories.set(d, parCat);
      }
    }
    const r = (l.reference ?? '').trim();
    if (r && l.marque_id) {
      const ens = references.get(l.marque_id) ?? new Set<string>();
      ens.add(r.toUpperCase());
      references.set(l.marque_id, ens);
    }
  }

  const dictionnaire = new Dictionnaire(mots);

  // 2. Suggestions : seulement les designations sans faute (tous mots connus).
  const designationsPropres = [...designations.entries()]
    .filter(([d]) => dictionnaire.corriger(d, 4).corrections.length === 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([d]) => d);

  const categorieParDesignation = new Map<string, CategorieProduit>();
  for (const [d, parCat] of categories) {
    const [meilleure] = [...parCat.entries()].sort((a, b) => b[1] - a[1]);
    if (meilleure) categorieParDesignation.set(d, meilleure[0]);
  }

  return {
    designations: designationsPropres,
    referencesParMarque: new Map([...references].map(([m, e]) => [m, [...e].sort()])),
    categorieParDesignation,
    dictionnaire,
  };
}
